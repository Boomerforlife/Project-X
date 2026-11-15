/**
 * Pure converters between backend DTOs and the frontend's types for the
 * private app. No network, no browser APIs: unit-tested under vitest.
 */
import type { AnswerResponse, PracticeQuestion, PublicSolution, PublicQuestion } from "@projectx/contracts";
import type { ExamId, Question, ResponseValue, Solution, SubjectId } from "@/contracts";
import { blocksToRichText, imageAssets } from "@/lib/api/adapters/blocks";
import { difficultyFromApi, examFromApi, subjectFromApi, typeFromApi } from "@/lib/api/adapters/ids";

const DEC = /^-?\d+(\.\d+)?$/;

export function isValidDecimal(v: string | undefined | null): boolean {
  return typeof v === "string" && DEC.test(v.trim());
}

type QLike = Pick<PracticeQuestion, "id" | "slug" | "question_type" | "difficulty" | "content" | "options" | "exam" | "subject" | "chapter" | "topic"> & {
  attribution?: { origin: string; year?: number | null };
};

/** Practice/public question -> frontend Question. Verification is a placeholder that must never be rendered. */
export function toQuestion(pq: QLike): Question {
  const exam = examFromApi(pq.exam.slug) ?? ("jee-main" as ExamId);
  const subject: SubjectId = subjectFromApi(pq.subject.segment, pq.subject.name)?.subject ?? "physics";
  const origin = pq.attribution?.origin;
  return {
    id: pq.id,
    slug: pq.slug,
    exams: [exam],
    subject,
    chapter: pq.chapter.segment,
    topic: pq.topic?.segment,
    type: typeFromApi(pq.question_type),
    stem: blocksToRichText(pq.content),
    blocks: pq.content,
    assets: imageAssets(pq.content),
    options: pq.options.map((o) => ({ id: o.label, ref: o.id, body: blocksToRichText(o.content), blocks: o.content })),
    difficulty: difficultyFromApi(pq.difficulty),
    source:
      origin === "PYQ"
        ? { kind: "pyq", exam, year: pq.attribution?.year ?? 0, session: null, date: null, shift: null }
        : { kind: "original" },
    verification: { status: "processed" },
    hasSolution: true,
    publicPage: true,
  };
}

export function toQuestionFromPublic(p: PublicQuestion): Question {
  return { ...toQuestion(p), verification: { status: p.verification.status === "OFFICIAL_KEY_MATCHED" ? "official_key_checked" : "human_reviewed" } };
}

/** Option label -> backend option uuid. */
function refOf(q: Question, label: string): string | undefined {
  return q.options.find((o) => o.id === label)?.ref;
}

/** The browser never grades: it only maps its answer into the wire format. */
export function toAnswerResponse(q: Question, a: ResponseValue): AnswerResponse | null {
  if (q.type === "numerical") {
    const v = a.value?.trim();
    return v && isValidDecimal(v) ? { type: "NUMERICAL", value: v } : null;
  }
  const ids = (a.optionIds ?? []).map((l) => refOf(q, l)).filter((x): x is string => Boolean(x));
  if (!ids.length) return null;
  if (q.type === "single_correct") return { type: "SINGLE_MCQ", option_id: ids[0]! };
  return { type: "MULTI_MCQ", option_ids: [...new Set(ids)] };
}

export function fromAnswerResponse(q: Question, r: AnswerResponse): ResponseValue {
  if (r.type === "NUMERICAL") return { value: r.value };
  const uuids = r.type === "SINGLE_MCQ" ? [r.option_id] : r.option_ids;
  const labels = uuids.map((u) => q.options.find((o) => o.ref === u)?.id).filter((x): x is string => Boolean(x));
  return { optionIds: labels.sort() };
}

const GENERATED_BY = {
  HUMAN_AUTHORED: "human",
  AI_GENERATED: "ai",
  AI_HUMAN_EDITED: "ai_human_edited",
  OFFICIAL: "official",
} as const;

/** Server solution -> frontend Solution (answer comes from the server, never computed here). */
export function toSolution(q: Question, s: PublicSolution): Solution {
  const fa = s.final_answer;
  const labelFor = (u: string) => q.options.find((o) => o.ref === u)?.id;
  const labels = (fa.type !== "NUMERICAL" ? (fa.correct_labels ?? fa.correct_option_ids.map(labelFor).filter((x): x is NonNullable<typeof x> => Boolean(x))) : []) as string[];
  const answer: Solution["answer"] =
    fa.type === "NUMERICAL"
      ? { type: "numerical", value: Number(fa.display_value), tolerance: 0, display: fa.display_value }
      : fa.type === "SINGLE_MCQ"
        ? { type: "single_correct", optionId: labels[0] ?? "" }
        : { type: "multiple_correct", optionIds: labels.length ? labels : [""] };
  const step = (st: PublicSolution["steps"][number]) => ({ title: st.title ?? undefined, body: blocksToRichText(st.blocks), blocks: st.blocks });
  return {
    questionId: q.id,
    answer,
    // The practice response carries no answer-key source, so we do not claim one.
    answerProvenance: "unknown",
    steps: s.steps.map(step),
    generatedBy: GENERATED_BY[s.provenance as keyof typeof GENERATED_BY] ?? "ai",
    verification: { status: "processed" },
    extras: {
      summary: s.summary,
      formulas: s.formulas,
      concepts: s.concepts,
      alternatives: s.alternatives.map((a) => ({ title: a.title, steps: a.steps.map(step) })),
      shortcuts: s.shortcuts,
      commonMistakes: s.common_mistakes,
      approvedAt: s.approved_at,
    },
  };
}

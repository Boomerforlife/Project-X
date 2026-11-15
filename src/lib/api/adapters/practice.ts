import type { AnswerResponse, AttemptResult, PracticeQuestion } from "../schemas";
import type { AttemptSection } from "@/lib/demo/types";
import type { MarkingRule, MarkingScheme, Question, ResponseValue, Solution, SubjectId, VerificationStatus } from "@/contracts";
import { blocksToRichText, imageAssets } from "./blocks";
import { solutionFromApi } from "./content";
import { difficultyFromApi, examFromApi, subjectFromApi, typeFromApi } from "./ids";

const DECIMAL = /^-?\d+(\.\d+)?$/;
export const isValidDecimal = (v: string | undefined | null): boolean => typeof v === "string" && DECIMAL.test(v.trim());

/**
 * Practice question -> frontend Question. `PracticeQuestion` carries no
 * verification, so the status is a placeholder (`processed`) that MUST NOT be
 * rendered; the solution flow supplies display copy after an attempt.
 */
export function toPracticeQuestion(p: PracticeQuestion): Question {
  const exam = examFromApi(p.exam.slug);
  const sub = subjectFromApi(p.subject.segment, p.subject.name);
  if (!exam || !sub) throw new Error(`Unsupported exam/subject from API: ${p.exam.slug}/${p.subject.segment}`);
  const diff = difficultyFromApi(p.difficulty);
  return {
    id: p.id,
    slug: p.slug,
    exams: [exam],
    subject: sub.subject,
    chapter: p.chapter.segment,
    ...(p.topic ? { topic: p.topic.segment } : {}),
    type: typeFromApi(p.question_type),
    stem: blocksToRichText(p.content),
    blocks: p.content,
    assets: imageAssets(p.content),
    options: p.options.map((o) => ({ id: o.label, ref: o.id, body: blocksToRichText(o.content), blocks: o.content })),
    ...(diff ? { difficulty: diff } : {}),
    source:
      p.attribution.origin === "PYQ" && p.attribution.year != null
        ? { kind: "pyq", exam, year: p.attribution.year, session: null, date: null, shift: null }
        : { kind: "original" },
    verification: { status: "processed" },
    hasSolution: true,
    publicPage: true,
  };
}

/**
 * Wire format for an answer. The browser never grades; it only maps option
 * labels to option uuids. Returns null when the answer cannot be submitted
 * (nothing chosen, unknown option, or a numerical value that is not a decimal).
 */
export function toAnswerResponse(q: Question, a: ResponseValue | null | undefined): AnswerResponse | null {
  if (!a) return null;
  if (q.type === "numerical") {
    const v = a.value?.trim();
    return v && isValidDecimal(v) ? { type: "NUMERICAL", value: v } : null;
  }
  const refs = (a.optionIds ?? []).map((label) => q.options.find((o) => o.id === label)?.ref);
  if (refs.length === 0 || refs.some((r) => !r)) return null;
  const ids = refs as string[];
  if (q.type === "single_correct") return ids.length === 1 ? { type: "SINGLE_MCQ", option_id: ids[0]! } : null;
  return new Set(ids).size === ids.length ? { type: "MULTI_MCQ", option_ids: ids } : null;
}

/** Stored response -> the frontend's label-based answer (resume, results). */
export function fromAnswerResponse(q: Question, r: AnswerResponse): ResponseValue {
  const labelOf = (ref: string) => q.options.find((o) => o.ref === ref)?.id ?? ref;
  if (r.type === "NUMERICAL") return { value: r.value };
  if (r.type === "SINGLE_MCQ") return { optionIds: [labelOf(r.option_id)] };
  return { optionIds: r.option_ids.map(labelOf) };
}

/**
 * Server attempt result -> what the UI shows. `partial` never occurs
 * (PARTIAL_MULTI is reserved server-side).
 */
export function fromAttemptResult(
  result: AttemptResult,
  question: Question,
  verification: VerificationStatus = "processed",
): {
  outcome: "correct" | "incorrect";
  score: number;
  answer: ResponseValue;
  timeSpentSec: number;
  submittedAt: string;
  solution: Solution;
} {
  const labels = new Map(question.options.flatMap((o) => (o.ref ? [[o.ref, o.id] as const] : [])));
  return {
    outcome: result.is_correct ? "correct" : "incorrect",
    score: Number(result.score),
    answer: fromAnswerResponse(question, result.response),
    timeSpentSec: Math.round((result.time_spent_ms ?? 0) / 1000),
    submittedAt: result.submitted_at,
    solution: solutionFromApi(question.id, result.solution, verification, labels),
  };
}

const sectionName = (s: SubjectId) => s.charAt(0).toUpperCase() + s.slice(1);

function ruleOf(p: PracticeQuestion): MarkingRule {
  return { correct: Number(p.marks), incorrect: -Number(p.negative_marks), unattempted: 0, partial: false };
}

/** Sections for a session, grouped by subject, with marking taken from each question's own marks. */
export function sectionsFor(questions: readonly PracticeQuestion[]): AttemptSection[] {
  const out = new Map<SubjectId, AttemptSection>();
  for (const p of questions) {
    const sub = subjectFromApi(p.subject.segment, p.subject.name)?.subject;
    if (!sub) continue;
    const type = typeFromApi(p.question_type);
    let sec = out.get(sub);
    if (!sec) {
      sec = { id: sub, name: sectionName(sub), subject: sub, questionIds: [], marking: {} as MarkingScheme };
      out.set(sub, sec);
    }
    sec.questionIds.push(p.id);
    sec.marking[type] ??= ruleOf(p);
  }
  return [...out.values()];
}

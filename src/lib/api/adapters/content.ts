import type {
  PracticeQuestion,
  PublicChapter,
  PublicContentBlock,
  PublicExam,
  PublicQuestion,
  PublicSolution,
  PublicSubject,
  QuestionSummary,
  TaxonomyTree,
} from "../schemas";
import type {
  Chapter,
  ExamId,
  Option,
  Question,
  QuestionCard,
  Solution,
  Source,
  Subject,
  SubjectId,
  VerificationStatus,
} from "@/contracts";
import { blocksToRichText, imageAssets, safeExcerpt } from "./blocks";
import { difficultyFromApi, examFromApi, subjectFromApi, typeFromApi } from "./ids";

type PublicVerification = PublicQuestion["verification"]["status"];

export function verificationFromApi(s: PublicVerification | "AUTOMATED_CHECKS_PASSED"): VerificationStatus {
  if (s === "AUTOMATED_CHECKS_PASSED") return "ai_checked";
  return s === "OFFICIAL_KEY_MATCHED" ? "official_key_checked" : "human_reviewed";
}

function mustExam(slug: string): ExamId {
  const e = examFromApi(slug);
  if (!e) throw new Error(`Unsupported exam from API: ${slug}`);
  return e;
}
function mustSubject(segment: string, name: string): { subject: SubjectId; group?: string } {
  const s = subjectFromApi(segment, name);
  if (!s) throw new Error(`Unsupported subject from API: ${segment}`);
  return s;
}

/* ----------------------------------------------------------------------- *
 * Taxonomy
 * ----------------------------------------------------------------------- */

/** Subject with editorial summary overlay (frontend copy, not data). */
export function toSubject(id: SubjectId, name: string, overlay: readonly Subject[]): Subject {
  return { id, name, summary: overlay.find((s) => s.id === id)?.summary ?? "" };
}

/**
 * Chapters across the given exam trees (union by subject + chapter segment).
 * Backend names and topics win; `grade` and `summary` come from the overlay
 * when present. Tree order is kept.
 */
export function toChapters(trees: readonly TaxonomyTree[], overlay: readonly Chapter[]): Chapter[] {
  const out = new Map<string, Chapter>();
  for (const tree of trees) {
    const exam = examFromApi(tree.exam.slug);
    if (!exam) continue;
    for (const s of tree.subjects) {
      const sub = subjectFromApi(s.segment, s.name);
      if (!sub) continue;
      for (const c of s.chapters) {
        const key = `${sub.subject}/${c.segment}`;
        const existing = out.get(key);
        if (existing) {
          if (!existing.exams.includes(exam)) existing.exams.push(exam);
          continue;
        }
        const ov = overlay.find((o) => o.subject === sub.subject && o.slug === c.segment);
        out.set(key, {
          slug: c.segment,
          name: c.name,
          subject: sub.subject,
          exams: [exam],
          ...(sub.group ? { group: sub.group } : {}),
          ...(ov?.grade ? { grade: ov.grade } : {}),
          summary: ov?.summary ?? "",
          topics: c.topics.map((t) => ({ slug: t.segment, name: t.name })),
        });
      }
    }
  }
  return [...out.values()];
}

/** Chapter detail page header: `description ?? overlay.summary ?? ""`. */
export function chapterSummary(page: PublicChapter, overlay: readonly Chapter[]): string {
  const sub = subjectFromApi(page.subject.segment, page.subject.name);
  const ov = sub ? overlay.find((o) => o.subject === sub.subject && o.slug === page.chapter.segment) : undefined;
  return page.chapter.description ?? ov?.summary ?? "";
}

/**
 * Question counts in the shape `getQuestionCounts` returns. `exams` are
 * `/public/exams/:slug` payloads, `subjects` are `/public/subjects/:slug`.
 * One backend row per exam, so counts across exams add up.
 */
export function toCounts(
  exams: readonly PublicExam[],
  subjects: readonly PublicSubject[],
): { bySubject: Map<string, number>; byChapter: Map<string, number>; total: number } {
  const bySubject = new Map<string, number>();
  const byChapter = new Map<string, number>();
  let total = 0;
  for (const e of exams) {
    for (const s of e.subjects) {
      const sub = subjectFromApi(s.segment, s.name);
      if (!sub) continue;
      bySubject.set(sub.subject, (bySubject.get(sub.subject) ?? 0) + s.published_question_count);
      total += s.published_question_count;
    }
  }
  for (const s of subjects) {
    const sub = subjectFromApi(s.subject.segment, s.subject.name);
    if (!sub) continue;
    for (const c of s.chapters) {
      const key = `${sub.subject}/${c.segment}`;
      byChapter.set(key, (byChapter.get(key) ?? 0) + c.published_question_count);
    }
  }
  return { bySubject, byChapter, total };
}

/* ----------------------------------------------------------------------- *
 * Question + solution
 * ----------------------------------------------------------------------- */

function sourceOf(q: PublicQuestion, exam: ExamId): Source {
  const a = q.attribution;
  if (a.origin === "PYQ") {
    const year = a.paper?.year ?? q.year;
    if (year != null) {
      return {
        kind: "pyq",
        exam,
        year,
        session: a.paper?.session_label ?? null,
        date: a.paper?.exam_date ?? null,
        shift: a.paper?.shift ?? q.shift ?? null,
      };
    }
  }
  return { kind: "original" };
}

export function toQuestion(q: PublicQuestion): Question {
  const exam = mustExam(q.exam.slug);
  const { subject } = mustSubject(q.subject.segment, q.subject.name);
  const options: Option[] = q.options.map((o) => ({
    id: o.label,
    ref: o.id,
    body: blocksToRichText(o.content),
    blocks: o.content,
  }));
  const assets = imageAssets(q.content);
  return {
    id: q.id,
    slug: q.slug,
    exams: [exam],
    subject,
    chapter: q.chapter.segment,
    ...(q.topic ? { topic: q.topic.segment } : {}),
    type: typeFromApi(q.question_type),
    stem: blocksToRichText(q.content),
    blocks: q.content,
    assets,
    options,
    ...(difficultyFromApi(q.difficulty) ? { difficulty: difficultyFromApi(q.difficulty) } : {}),
    source: sourceOf(q, exam),
    verification: { status: verificationFromApi(q.verification.status) },
    hasSolution: true,
    // AI-checked (not human-verified) items are practice-only: no public question page (same rule as the card adapters).
    publicPage: q.attribution.origin !== "AI_GENERATED",
    indexable: q.indexable && q.seo.robots === "index,follow",
  };
}

const GENERATED_BY = {
  HUMAN_AUTHORED: "human",
  AI_GENERATED: "ai",
  AI_HUMAN_EDITED: "ai_human_edited",
  OFFICIAL: "official",
} as const;

type Step = { title: string | null; blocks: PublicContentBlock[] };
const toStep = (s: Step) => ({
  ...(s.title ? { title: s.title } : {}),
  body: blocksToRichText(s.blocks),
  blocks: s.blocks,
});

/**
 * Solution adapter shared by public pages and practice results.
 * `optionLabelById` maps option uuid -> label for the fallback path.
 */
export function solutionFromApi(
  questionId: string,
  sol: PublicSolution,
  verification: VerificationStatus,
  optionLabelById: ReadonlyMap<string, string> = new Map(),
  /** Override when the source carries no answer-key evidence (practice results pass "unknown"). */
  provenance?: Solution["answerProvenance"],
): Solution {
  const fa = sol.final_answer;
  const labelOf = (id: string) => optionLabelById.get(id) ?? id;
  let answer: Solution["answer"];
  if (fa.type === "SINGLE_MCQ") {
    answer = {
      type: "single_correct",
      optionId: fa.correct_labels?.[0] ?? labelOf(fa.correct_option_ids[0]!),
    };
  } else if (fa.type === "MULTI_MCQ") {
    answer = {
      type: "multiple_correct",
      optionIds: fa.correct_labels?.length ? [...fa.correct_labels] : fa.correct_option_ids.map(labelOf),
    };
  } else {
    answer = {
      type: "numerical",
      value: Number(fa.display_value),
      tolerance: 0,
      display: fa.display_value,
    };
  }
  return {
    questionId,
    answer,
    answerProvenance: provenance ?? (verification === "official_key_checked" ? "official_key" : "derived"),
    steps: sol.steps.map(toStep),
    generatedBy: GENERATED_BY[sol.provenance],
    verification: { status: verification },
    extras: {
      summary: sol.summary,
      formulas: sol.formulas,
      concepts: sol.concepts,
      alternatives: sol.alternatives.map((a) => ({ title: a.title, steps: a.steps.map(toStep) })),
      shortcuts: sol.shortcuts,
      commonMistakes: sol.common_mistakes,
      approvedAt: sol.approved_at,
    },
  };
}

export function toSolution(q: PublicQuestion): Solution {
  return solutionFromApi(
    q.id,
    q.solution,
    verificationFromApi(q.verification.status),
    new Map(q.options.map((o) => [o.id, o.label])),
  );
}

/* ----------------------------------------------------------------------- *
 * Cards
 * ----------------------------------------------------------------------- */

/**
 * List item from a `QuestionSummary`. Summaries carry no subject or exam, so
 * the caller supplies the context of the list it came from.
 */
export function toQuestionCard(s: QuestionSummary, ctx: { exam: ExamId; subject: SubjectId }): QuestionCard {
  return {
    id: s.id,
    slug: s.slug,
    exams: [ctx.exam],
    subject: ctx.subject,
    chapter: s.chapter.segment,
    ...(s.topic ? { topic: s.topic.segment } : {}),
    type: typeFromApi(s.question_type),
    stem: safeExcerpt(s.excerpt),
    ...(difficultyFromApi(s.difficulty) ? { difficulty: difficultyFromApi(s.difficulty) } : {}),
    // AI-generated practice items are practice-only: they have no public question page.
    publicPage: s.origin !== "AI_GENERATED",
    year: s.year,
  };
}

/** Card from a `PracticeQuestion` (used for generateStaticParams-style listings). */
export function practiceToCard(p: PracticeQuestion): QuestionCard {
  const sub = mustSubject(p.subject.segment, p.subject.name);
  return {
    id: p.id,
    slug: p.slug,
    exams: [mustExam(p.exam.slug)],
    subject: sub.subject,
    chapter: p.chapter.segment,
    ...(p.topic ? { topic: p.topic.segment } : {}),
    type: typeFromApi(p.question_type),
    stem: safeExcerpt(blocksToRichText(p.content).slice(0, 200)),
    ...(difficultyFromApi(p.difficulty) ? { difficulty: difficultyFromApi(p.difficulty) } : {}),
    publicPage: p.attribution.origin !== "AI_GENERATED",
    year: p.attribution.year,
  };
}

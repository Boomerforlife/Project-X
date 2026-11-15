/**
 * ⚠️ DRAFT CONTRACT — PROPOSED BY PERSON 1, NOT YET AGREED WITH PERSON 2.
 *
 * These schemas exist so UI work and fixtures share one validated shape.
 * Every field here is a proposal to discuss (see docs/api-contract-draft.md).
 * When the real OpenAPI/shared schema lands, replace this module with the
 * generated types and update fixtures + consuming UI together.
 */
import { z } from "zod";
import type { PublicContentBlock } from "@projectx/contracts";

export type { PublicContentBlock };

/** Structured content blocks from the API (API mode only). Optional alongside the RichText fallback. */
const Blocks = z.custom<PublicContentBlock[]>((v) => Array.isArray(v));

export const ExamId = z.enum(["jee-main", "jee-advanced", "neet"]);
export type ExamId = z.infer<typeof ExamId>;

export const SubjectId = z.enum(["physics", "chemistry", "mathematics", "biology"]);
export type SubjectId = z.infer<typeof SubjectId>;

/**
 * Rich text: plain text with `$…$` inline math and `$$…$$` display math (TeX).
 * OPEN QUESTION for Person 2: is this the stored representation, or will the
 * API return a structured AST / MathML?
 */
export const RichText = z.string();
export type RichText = z.infer<typeof RichText>;

export const Asset = z.object({
  id: z.string(),
  url: z.string(),
  alt: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Asset = z.infer<typeof Asset>;

/**
 * Verification vocabulary from CLAUDE.md §12. Meanings MUST be agreed with
 * Person 2 before any badge ships; the UI only renders what the API returns.
 */
export const VerificationStatus = z.enum([
  "extracted",
  "processed",
  "ai_checked",
  "official_key_checked",
  "human_reviewed",
  "disputed",
]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const Source = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pyq"),
    exam: ExamId,
    year: z.number().int(),
    session: z.string().nullable(), // e.g. "January", "April"; null when unknown
    date: z.string().nullable(), // ISO date of the sitting; null when unknown
    shift: z.number().int().positive().nullable(),
  }),
  /** Original content written for practice; never presented as a PYQ. */
  z.object({ kind: z.literal("original") }),
  /** Development fixture. Must never reach production. */
  z.object({ kind: z.literal("sample") }),
]);
export type Source = z.infer<typeof Source>;

export const Option = z.object({
  id: z.string(), // stable per question: "A" | "B" | ...
  body: RichText,
  asset: Asset.optional(),
  /** API mode: the backend option uuid (submissions map label -> ref). */
  ref: z.string().optional(),
  /** API mode: structured content; `body` is the lossy RichText fallback. */
  blocks: Blocks.optional(),
});

export type Option = z.infer<typeof Option>;

export const QuestionType = z.enum(["single_correct", "multiple_correct", "numerical"]);
export type QuestionType = z.infer<typeof QuestionType>;

export const Difficulty = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof Difficulty>;

export const Question = z.object({
  id: z.string(),
  slug: z.string(),
  /** Exams this question is suitable for (a Physics item can serve JEE and NEET). */
  exams: z.array(ExamId).min(1),
  subject: SubjectId,
  chapter: z.string(), // Chapter.slug
  topic: z.string().optional(),
  type: QuestionType,
  stem: RichText,
  /** API mode: structured stem; `stem` stays as the lossy RichText fallback. */
  blocks: Blocks.optional(),
  assets: z.array(Asset).default([]),
  options: z.array(Option).default([]), // empty for numerical
  difficulty: Difficulty.optional(),
  source: Source,
  verification: z.object({
    status: VerificationStatus,
    note: z.string().optional(),
  }),
  hasSolution: z.boolean(),
  /** Public question page allowed? Decided server-side (quality/dup checks). */
  publicPage: z.boolean(),
  /** Server robots decision (API mode). Undefined means "no opinion" (treated as indexable). */
  indexable: z.boolean().optional(),
});
export type Question = z.infer<typeof Question>;

/**
 * Lightweight question for lists and related items. A fixture `Question` is
 * structurally assignable. In API mode `stem` is the backend excerpt (<= 200 chars).
 */
export type QuestionCard = Pick<
  Question,
  "id" | "slug" | "exams" | "subject" | "chapter" | "topic" | "type" | "difficulty" | "publicPage"
> & {
  stem: RichText;
  year?: number | null;
  indexable?: boolean;
};

export const AnswerKey = z.discriminatedUnion("type", [
  z.object({ type: z.literal("single_correct"), optionId: z.string() }),
  z.object({ type: z.literal("multiple_correct"), optionIds: z.array(z.string()).min(1) }),
  z.object({
    type: z.literal("numerical"),
    value: z.number(),
    /** Accepted absolute tolerance; OPEN QUESTION: per-question or per-paper? */
    tolerance: z.number().nonnegative().default(0),
    /** API mode: exact display string from the server (preferred by answerText). */
    display: z.string().optional(),
  }),
]);
export type AnswerKey = z.infer<typeof AnswerKey>;

export const Solution = z.object({
  questionId: z.string(),
  answer: AnswerKey,
  /** Where the final answer comes from. "official" only for real official keys. */
  answerProvenance: z.enum(["official_key", "derived", "unknown"]),
  steps: z.array(z.object({ title: z.string().optional(), body: RichText, blocks: Blocks.optional() })),
  generatedBy: z.enum(["human", "ai", "ai_human_edited", "official"]),
  verification: z.object({ status: VerificationStatus, note: z.string().optional() }),
  /** API mode: extra solution material the backend provides. */
  extras: z
    .object({
      summary: z.string().nullable().optional(),
      formulas: z.array(z.object({ name: z.string(), latex: z.string() })).optional(),
      concepts: z.array(z.string()).optional(),
      alternatives: z
        .array(
          z.object({
            title: z.string(),
            steps: z.array(z.object({ title: z.string().optional(), body: RichText, blocks: Blocks.optional() })),
          }),
        )
        .optional(),
      shortcuts: z.array(z.string()).optional(),
      commonMistakes: z.array(z.string()).optional(),
      approvedAt: z.string().nullable().optional(),
    })
    .optional(),
});
export type Solution = z.infer<typeof Solution>;

/** A nudge that stops short of the answer. Served separately from solutions (Learning mode only). */
export const Hint = z.object({
  questionId: z.string(),
  body: RichText,
  generatedBy: z.enum(["human", "ai", "ai_human_edited"]),
});
export type Hint = z.infer<typeof Hint>;

export const Topic = z.object({ slug: z.string(), name: z.string() });

export const Chapter = z.object({
  slug: z.string(),
  name: z.string(),
  subject: SubjectId,
  /** Exams whose syllabus includes this chapter. */
  exams: z.array(ExamId).min(1),
  /** Optional grouping inside a subject, e.g. NEET Biology → "Botany" / "Zoology". */
  group: z.string().optional(),
  /** Class 11 / 12 — public syllabus context. */
  grade: z.union([z.literal(11), z.literal(12)]).optional(),
  summary: z.string(),
  topics: z.array(Topic),
});
export type Chapter = z.infer<typeof Chapter>;

export const Subject = z.object({
  id: SubjectId,
  name: z.string(),
  summary: z.string(),
});
export type Subject = z.infer<typeof Subject>;

/** Marks for one question type. Negative numbers are penalties. */
export const MarkingRule = z.object({
  correct: z.number(),
  incorrect: z.number(),
  unattempted: z.number().default(0),
  /** Multiple-correct only: +1 per correct option chosen when no wrong option is chosen. */
  partial: z.boolean().default(false),
});
export type MarkingRule = z.infer<typeof MarkingRule>;

export const MarkingScheme = z.object({
  single_correct: MarkingRule.optional(),
  multiple_correct: MarkingRule.optional(),
  numerical: MarkingRule.optional(),
});
export type MarkingScheme = z.infer<typeof MarkingScheme>;

export const PaperSection = z.object({
  id: z.string(),
  name: z.string(),
  subject: SubjectId,
  questionIds: z.array(z.string()).min(1),
  marking: MarkingScheme,
});
export type PaperSection = z.infer<typeof PaperSection>;

export const PaperSummary = z.object({
  id: z.string(),
  exam: ExamId,
  /** "pyq" = a previous-year sitting; "mock" = an original full/sectional test. */
  kind: z.enum(["pyq", "mock"]),
  title: z.string(),
  year: z.number().int().nullable(),
  session: z.string().nullable(),
  /** ISO date of the sitting, when known. Never invented. */
  date: z.string().nullable(),
  shift: z.number().int().positive().nullable(),
  /** Number of questions actually available; null if not ingested yet. */
  questionCount: z.number().int().nonnegative().nullable(),
  durationMinutes: z.number().int().positive(),
  /** True while the paper is assembled from sample items rather than the real sitting. */
  isDemo: z.boolean(),
});
export type PaperSummary = z.infer<typeof PaperSummary>;

export const Paper = PaperSummary.extend({
  sections: z.array(PaperSection).min(1),
  instructions: z.array(z.string()),
});
export type Paper = z.infer<typeof Paper>;

/* ------------------------------------------------------------------------- *
 * Attempts (Stage 4–5). PROPOSED shapes; today persisted by the demo store. *
 * ------------------------------------------------------------------------- */

export const AttemptMode = z.enum(["learning", "test", "cbt"]);
export type AttemptMode = z.infer<typeof AttemptMode>;

export const ResponseValue = z.object({
  optionIds: z.array(z.string()).optional(),
  value: z.string().optional(),
});
export type ResponseValue = z.infer<typeof ResponseValue>;

export const Response = z.object({
  questionId: z.string(),
  answer: ResponseValue.nullable(),
  /** Learning mode: the student pressed "Check". */
  checked: z.boolean().default(false),
  markedForReview: z.boolean().default(false),
  visited: z.boolean().default(false),
  timeSpentSec: z.number().nonnegative().default(0),
  savedAt: z.string().nullable(),
});
export type Response = z.infer<typeof Response>;

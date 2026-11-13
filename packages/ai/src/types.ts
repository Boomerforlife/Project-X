/** Enums mirrored from DATABASE_SCHEMA section 1 (identical strings). */
export const AI_TASKS = ['CLASSIFY', 'ANSWER', 'SOLVE', 'ALTERNATIVES', 'CRITIQUE', 'QUALITY', 'SEO_META'] as const;
export type AiTask = (typeof AI_TASKS)[number];
export const QUESTION_TYPES = ['SINGLE_MCQ', 'MULTI_MCQ', 'NUMERICAL'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const SUBJECT_CODES = ['PHYSICS', 'CHEMISTRY', 'MATHEMATICS', 'BIOLOGY', 'BOTANY', 'ZOOLOGY'] as const;
export type SubjectCode = (typeof SUBJECT_CODES)[number];
export const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'] as const;
export type OptionLabel = (typeof OPTION_LABELS)[number];
export type VerificationStatus =
  | 'PENDING'
  | 'AUTOMATED_CHECKS_PASSED'
  | 'OFFICIAL_KEY_MATCHED'
  | 'HUMAN_REVIEW_REQUIRED'
  | 'HUMAN_VERIFIED'
  | 'DISPUTED';
export type IngestionStatus = 'IMPORTED' | 'CLASSIFIED' | 'SOLVED' | 'CHECKED' | 'NEEDS_ATTENTION';
export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type VerificationOutcome = 'PASSED' | 'NEEDS_REVIEW' | 'FAILED';
export const CHECK_KINDS = [
  'OFFICIAL_KEY_MATCH',
  'INDEPENDENT_ANSWER_AGREEMENT',
  'SYMPY_CHECK',
  'AI_CRITIQUE',
  'CONTENT_COMPLETENESS',
  'CLASSIFICATION_CONFIDENCE',
] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];
export type CheckResult = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'SKIPPED' | 'ERROR';
export type JobKind = 'AI_CLASSIFY' | 'AI_SOLVE' | 'AI_VERIFY' | 'AI_SEO';

export const RULES_VERSION = 'v1';
export const PIPELINE_VERSION = 'v1';

/** AnswerKey as stored in questions.answer_key / solution_versions.final_answer (API_CONTRACTS 2.3). */
export type AnswerKey =
  | { type: 'SINGLE_MCQ' | 'MULTI_MCQ'; correct_option_ids: string[] }
  | { type: 'NUMERICAL'; accepted_ranges: { min: string; max: string }[]; display_value: string };

/** Minimal structural DB interfaces (ARCHITECTURE section 4) so this package does not depend on @projectx/db at type level. */
export interface SqlTx {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}
export interface Db {
  withService<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

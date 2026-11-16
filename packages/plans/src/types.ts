/**
 * Types for the diagnostic + study-plan algorithm. Everything in this package is pure: no I/O, no clock reads,
 * no randomness except a seeded RNG, so the API and the web mock mode produce identical results for identical input.
 * Design: docs/superpowers/specs/2026-11-17-problem-library-and-study-plans-design.md (section 6).
 */

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export const DIFFICULTIES: readonly Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];
export type DifficultyCounts = Record<Difficulty, number>;

/** One problem (question family) the diagnostic may draw from. */
export interface Candidate {
  familyId: string;
  /** Published variants of the family; one is picked. */
  questionIds: string[];
  chapterId: string;
  subjectId: string;
  difficulty: Difficulty;
  /** The student has attempted this family before (it then measures recall, not skill). */
  tried: boolean;
}

export interface DiagnosticPick {
  questionId: string;
  familyId: string;
  chapterId: string;
  subjectId: string;
  difficulty: Difficulty;
}

export interface Diagnostic {
  picks: DiagnosticPick[];
  requestedMix: DifficultyCounts;
  actualMix: DifficultyCounts;
  /** How many fewer questions than requested could be found. */
  shortBy: number;
}

export type Outcome = 'correct' | 'wrong' | 'skipped';
export type EvidenceSource = 'diagnostic' | 'history' | 'plan';

export interface Evidence {
  chapterId: string;
  difficulty: Difficulty;
  outcome: Outcome;
  /** Time spent; null when unknown. */
  timeMs: number | null;
  /** ISO timestamp of the answer. */
  at: string;
  source: EvidenceSource;
}

export type Band = 'unmeasured' | 'weak' | 'shaky' | 'strong';

export interface ChapterEstimate {
  chapterId: string;
  alpha: number;
  beta: number;
  /** alpha / (alpha + beta). Internal; students see the band and counts, never this number. */
  mastery: number;
  /** alpha + beta - 2: how much weighted evidence there is. */
  evidence: number;
  /** Raw counts from diagnostic + plan answers (shown as "2 of 3 correct"). */
  correct: number;
  answered: number;
  slow: boolean;
  band: Band;
}

/** What the planner needs to know about a chapter besides its estimate. */
export interface ChapterInfo {
  chapterId: string;
  subjectId: string;
  /** Unsolved, accessible problems per difficulty. Drives `supply` and what the ladder can offer. */
  supply: DifficultyCounts;
  /** Specific unsolved problems the plan can name, by difficulty (problem numbers). */
  problems?: Partial<Record<Difficulty, number[]>>;
  /** Unresolved mistakes in this chapter. */
  openMistakes: number;
  /** Plan-period answers in this chapter at its current ladder step (for stepping up). */
  stepAttempts?: number;
  stepCorrect?: number;
}

export type PlanItemKind = 'REVIEW_DIAGNOSTIC' | 'PRACTICE' | 'PROBLEMS' | 'MISTAKES' | 'TIMED' | 'CHECKPOINT' | 'READ';

export interface PlanItem {
  /** Stable within a plan: `d<day>-<position>`. */
  key: string;
  kind: PlanItemKind;
  chapterId: string | null;
  subjectId: string | null;
  difficulty: Difficulty | null;
  /** Questions in the linked session (PRACTICE, MISTAKES, TIMED, CHECKPOINT). */
  size: number | null;
  /** Problem numbers (PROBLEMS). */
  problems: number[] | null;
  /** TIMED / CHECKPOINT only. */
  timeLimitSec: number | null;
  minutes: number;
  /** Set by the caller when the item has been started or finished; frozen on re-plan. */
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface PlanDay {
  index: number;
  /** YYYY-MM-DD */
  date: string;
  items: PlanItem[];
  /** Nothing worth scheduling (tiny bank); never padded. */
  light: boolean;
}

export interface PlanInput {
  chapters: ChapterInfo[];
  estimates: ChapterEstimate[];
  dailyMinutes: number;
  days: 7 | 14;
  /** YYYY-MM-DD, day 0 of the plan. */
  startDate: string;
  seed: string;
}

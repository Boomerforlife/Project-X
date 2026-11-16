import type { Band, Difficulty, DifficultyCounts } from './types';

/**
 * Tunables. These are product heuristics, not exam facts: never present them to students as "the JEE standard".
 */
export const PLAN_CONFIG = {
  /** Target share of each difficulty in a diagnostic. */
  mix: { EASY: 0.3, MEDIUM: 0.5, HARD: 0.2 } satisfies Record<Difficulty, number>,
  /** Diagnostic lengths offered in the UI. */
  lengths: [15, 30, 45] as const,
  /** Seconds per diagnostic question when computing its time limit. */
  diagnosticSecPerQuestion: 150,
  checkpointSize: 10,

  /** Evidence weights for a correct answer (a correct Hard says more). */
  weightCorrect: { EASY: 0.75, MEDIUM: 1, HARD: 1.5 } satisfies DifficultyCounts,
  /** Evidence weights for a wrong answer (a missed Easy says more). */
  weightWrong: { EASY: 1.5, MEDIUM: 1, HARD: 0.5 } satisfies DifficultyCounts,
  skippedFactor: 0.5,
  historyWeight: 0.5,
  historyHalfLifeDays: 21,

  /** A correct answer slower than this (seconds) counts toward "slow". */
  timeBudgetSec: { EASY: 90, MEDIUM: 150, HARD: 240 } satisfies DifficultyCounts,
  bandWeak: 0.5,
  bandStrong: 0.75,
  minEvidenceForStrong: 2,

  /** Minutes per question including reading the solution. */
  minutesPerQuestion: { EASY: 3, MEDIUM: 5, HARD: 7 } satisfies DifficultyCounts,
  reviewDiagnosticMinutes: 10,
  maxChaptersPerDay: 2,
  /** No subject goes more than this many days without an item. */
  maxSubjectGapDays: 2,
  /** Day offsets after first scheduling, by band (expanding intervals). */
  spacing: { weak: [0, 2, 5, 9], shaky: [0, 4, 10], unmeasured: [0, 3, 8], strong: [0, 7] } satisfies Record<Band, number[]>,
  unmeasuredBoost: 1.2,
  strongPriorityCap: 0.1,
  /** Step up the ladder after this accuracy on at least `stepUpMinAttempts` plan answers. */
  stepUpAccuracy: 0.7,
  stepUpMinAttempts: 4,
  sessionMin: 4,
  sessionMax: 12,
} as const;

export type PlanConfig = typeof PLAN_CONFIG;

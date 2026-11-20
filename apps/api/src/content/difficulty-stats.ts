/**
 * Difficulty from real attempts (no AI). Owner decision 2026-11-20; stored with difficulty_source = 'STATS' (migration 0027).
 *
 * For each question: n = students whose FIRST attempt is counted (one per student, so retries cannot skew it), k = how many
 * of those were correct. The solve rate is smoothed toward the chapter's average (a Beta prior worth PRIOR_STRENGTH
 * attempts), so a few lucky or unlucky attempts cannot label a question. A label is given only once n >= MIN_ATTEMPTS.
 *
 *   smoothed p >= 0.70  -> EASY,   0.40 <= p < 0.70 -> MEDIUM,   p < 0.40 -> HARD
 *
 * Hysteresis: a question already rated by STATS changes band only when p is HYSTERESIS beyond the boundary, so labels
 * do not flip back and forth around 0.40 / 0.70. Ratings set by an admin, AI or import are never touched (caller filters).
 */
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export const STATS = { minAttempts: 20, priorStrength: 10, easyAt: 0.7, hardBelow: 0.4, hysteresis: 0.05 } as const;

/** Smoothed solve rate: (k + m * p0) / (n + m). */
export function smoothedSolveRate(n: number, k: number, prior: number, m: number = STATS.priorStrength): number {
  const p0 = Math.min(0.95, Math.max(0.05, prior));
  return (k + m * p0) / (n + m);
}

function band(p: number): Difficulty {
  return p >= STATS.easyAt ? 'EASY' : p >= STATS.hardBelow ? 'MEDIUM' : 'HARD';
}

/**
 * The label for a question, or null when there is not enough evidence yet.
 * `current` is the existing STATS label (null if unrated); it enables hysteresis.
 */
export function rateDifficulty(input: { n: number; k: number; prior: number; current: Difficulty | null }): Difficulty | null {
  const { n, k, prior, current } = input;
  if (n < STATS.minAttempts) return current;
  const p = smoothedSolveRate(n, k, prior);
  const next = band(p);
  if (!current || current === next) return next;
  const h = STATS.hysteresis;
  // Only leave the current band when clearly past its edge.
  if (current === 'EASY' && p >= STATS.easyAt - h) return current;
  if (current === 'HARD' && p < STATS.hardBelow + h) return current;
  if (current === 'MEDIUM' && p < STATS.easyAt + h && p >= STATS.hardBelow - h) return current;
  return next;
}

/** Chapter prior: the chapter's pooled first-attempt solve rate, itself pulled toward 0.5 when the chapter is thin. */
export function chapterPrior(totalN: number, totalK: number): number {
  return (totalK + 20 * 0.5) / (totalN + 20);
}

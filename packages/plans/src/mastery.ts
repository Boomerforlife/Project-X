import { PLAN_CONFIG } from './config';
import type { Band, ChapterEstimate, Evidence } from './types';

const DAY_MS = 86_400_000;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Weight of one answer: diagnostic and plan answers count fully; earlier history at half weight, fading (half-life 21 days). */
function sourceWeight(e: Evidence, now: Date): number {
  if (e.source !== 'history') return 1;
  const ageDays = Math.max(0, (now.getTime() - new Date(e.at).getTime()) / DAY_MS);
  return PLAN_CONFIG.historyWeight * 0.5 ** (ageDays / PLAN_CONFIG.historyHalfLifeDays);
}

export function bandFor(mastery: number, evidence: number, slow: boolean): Band {
  // Any answered question gives some evidence (a correct Easy adds 0.75, a missed Hard 0.5); only "nothing at all" is unmeasured.
  if (evidence < 0.5) return 'unmeasured';
  if (mastery < PLAN_CONFIG.bandWeak) return 'weak';
  if (mastery < PLAN_CONFIG.bandStrong || slow || evidence < PLAN_CONFIG.minEvidenceForStrong) return 'shaky';
  return 'strong';
}

/**
 * Per-chapter Beta(α, β) estimate of "gets a typical question in this chapter right". Starts at Beta(1, 1); a correct answer
 * adds weightCorrect[d] to α, a wrong one weightWrong[d] to β, a skipped one half of that. Chapters with no evidence are
 * returned as `unmeasured`.
 */
export function estimateMastery(chapterIds: readonly string[], evidence: readonly Evidence[], now: Date): ChapterEstimate[] {
  const cfg = PLAN_CONFIG;
  const acc = new Map<string, { a: number; b: number; correct: number; answered: number; ratios: number[] }>();
  for (const id of chapterIds) acc.set(id, { a: 1, b: 1, correct: 0, answered: 0, ratios: [] });

  for (const e of evidence) {
    const row = acc.get(e.chapterId);
    if (!row) continue;
    const w = sourceWeight(e, now);
    if (e.outcome === 'correct') row.a += w * cfg.weightCorrect[e.difficulty];
    else if (e.outcome === 'wrong') row.b += w * cfg.weightWrong[e.difficulty];
    else row.b += w * cfg.skippedFactor * cfg.weightWrong[e.difficulty];
    if (e.source !== 'history' && e.outcome !== 'skipped') {
      row.answered++;
      if (e.outcome === 'correct') row.correct++;
    }
    if (e.outcome === 'correct' && e.timeMs != null && e.timeMs > 0) {
      row.ratios.push(e.timeMs / 1000 / cfg.timeBudgetSec[e.difficulty]);
    }
  }

  return chapterIds.map((chapterId) => {
    const r = acc.get(chapterId)!;
    const mastery = r.a / (r.a + r.b);
    const ev = r.a + r.b - 2;
    const slow = r.ratios.length >= 2 && median(r.ratios) > 1;
    return {
      chapterId,
      alpha: r.a,
      beta: r.b,
      mastery,
      evidence: ev,
      correct: r.correct,
      answered: r.answered,
      slow,
      band: bandFor(mastery, ev, slow),
    };
  });
}

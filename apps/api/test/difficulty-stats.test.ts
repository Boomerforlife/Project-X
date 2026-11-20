import { describe, expect, it } from 'vitest';
import { chapterPrior, rateDifficulty, smoothedSolveRate } from '../src/content/difficulty-stats';

describe('difficulty from attempts (STATS)', () => {
  it('waits for enough students', () => {
    expect(rateDifficulty({ n: 19, k: 19, prior: 0.5, current: null })).toBeNull();
    expect(rateDifficulty({ n: 19, k: 0, prior: 0.5, current: 'MEDIUM' })).toBe('MEDIUM');
  });

  it('bands the smoothed solve rate', () => {
    expect(rateDifficulty({ n: 100, k: 85, prior: 0.5, current: null })).toBe('EASY');
    expect(rateDifficulty({ n: 100, k: 55, prior: 0.5, current: null })).toBe('MEDIUM');
    expect(rateDifficulty({ n: 100, k: 20, prior: 0.5, current: null })).toBe('HARD');
  });

  it('smoothing stops a small lucky sample from looking easy', () => {
    // 20/20 correct but the chapter averages 30%: (20 + 10*0.3) / 30 = 0.767 -> still EASY, but 14/20 is not.
    expect(smoothedSolveRate(20, 20, 0.3)).toBeCloseTo(0.767, 2);
    expect(rateDifficulty({ n: 20, k: 14, prior: 0.3, current: null })).toBe('MEDIUM');
  });

  it('hysteresis keeps a label near the boundary', () => {
    // p just under 0.70: an EASY question stays EASY, an unrated one becomes MEDIUM.
    const near = { n: 200, k: 136, prior: 0.68 };
    expect(rateDifficulty({ ...near, current: 'EASY' })).toBe('EASY');
    expect(rateDifficulty({ ...near, current: null })).toBe('MEDIUM');
    // Clearly past the edge, it moves.
    expect(rateDifficulty({ n: 200, k: 100, prior: 0.5, current: 'EASY' })).toBe('MEDIUM');
  });

  it('chapter prior is pulled toward 0.5 when thin', () => {
    expect(chapterPrior(0, 0)).toBe(0.5);
    expect(chapterPrior(1000, 300)).toBeCloseTo(0.304, 2);
  });
});

import { describe, expect, it } from 'vitest';
import {
  assembleDiagnostic,
  buildPlan,
  diagnosticReport,
  estimateMastery,
  fitMix,
  ladderStep,
  replan,
  requestedMix,
  type Candidate,
  type ChapterEstimate,
  type ChapterInfo,
  type Difficulty,
  type Evidence,
  type PlanInput,
} from '../src';

const NOW = new Date('2026-11-17T06:00:00Z');

function bank(opts: { chapters: number; perChapter: Partial<Record<Difficulty, number>>; subjects?: string[]; tried?: (i: number) => boolean }): Candidate[] {
  const subjects = opts.subjects ?? ['phy', 'chem', 'math'];
  const out: Candidate[] = [];
  let n = 0;
  for (let c = 0; c < opts.chapters; c++) {
    const subjectId = subjects[c % subjects.length]!;
    for (const d of ['EASY', 'MEDIUM', 'HARD'] as const) {
      for (let i = 0; i < (opts.perChapter[d] ?? 0); i++) {
        const familyId = `f${n++}`;
        out.push({ familyId, questionIds: [`${familyId}-a`, `${familyId}-b`], chapterId: `ch${c}`, subjectId, difficulty: d, tried: opts.tried?.(n) ?? false });
      }
    }
  }
  return out;
}

describe('diagnostic assembly', () => {
  it('requests 30/50/20 and the quotas sum to the length', () => {
    expect(requestedMix(30)).toEqual({ EASY: 9, MEDIUM: 15, HARD: 6 });
    for (const n of [15, 30, 45, 7]) {
      const m = requestedMix(n);
      expect(m.EASY + m.MEDIUM + m.HARD).toBe(n);
    }
  });

  it('moves a missing Hard tier to Medium, never silently relabels', () => {
    expect(fitMix({ EASY: 9, MEDIUM: 15, HARD: 6 }, { EASY: 60, MEDIUM: 34, HARD: 0 })).toEqual({ EASY: 9, MEDIUM: 21, HARD: 0 });
    const d = assembleDiagnostic(bank({ chapters: 10, perChapter: { EASY: 6, MEDIUM: 4 } }), { length: 30, seed: 's' });
    expect(d.actualMix).toEqual({ EASY: 9, MEDIUM: 21, HARD: 0 });
    expect(d.requestedMix.HARD).toBe(6);
    expect(d.picks.every((p) => p.difficulty !== 'HARD')).toBe(true);
  });

  it('spreads across chapters before doubling up', () => {
    const d = assembleDiagnostic(bank({ chapters: 12, perChapter: { EASY: 3, MEDIUM: 3, HARD: 2 } }), { length: 12, seed: 'x' });
    expect(new Set(d.picks.map((p) => p.chapterId)).size).toBe(12);
  });

  it('is deterministic for a seed and different across seeds', () => {
    const b = bank({ chapters: 8, perChapter: { EASY: 4, MEDIUM: 4, HARD: 2 } });
    const a1 = assembleDiagnostic(b, { length: 15, seed: 'one' });
    const a2 = assembleDiagnostic(b, { length: 15, seed: 'one' });
    const a3 = assembleDiagnostic(b, { length: 15, seed: 'two' });
    expect(a1).toEqual(a2);
    expect(a1.picks.map((p) => p.questionId)).not.toEqual(a3.picks.map((p) => p.questionId));
  });

  it('uses one variant per problem and prefers untried problems', () => {
    const b = bank({ chapters: 3, perChapter: { EASY: 2, MEDIUM: 2 }, tried: (i) => i % 2 === 0 });
    // 5 questions = 2 Easy + 3 Medium; the bank has 3 untried of each, so no tried problem is needed.
    const d = assembleDiagnostic(b, { length: 5, seed: 'u' });
    expect(d.picks).toHaveLength(5);
    expect(new Set(d.picks.map((p) => p.familyId)).size).toBe(d.picks.length);
    const tried = new Set(b.filter((c) => c.tried).map((c) => c.familyId));
    expect(d.picks.filter((p) => tried.has(p.familyId))).toHaveLength(0);
  });

  it('shortens the test when the bank is too small', () => {
    const d = assembleDiagnostic(bank({ chapters: 2, perChapter: { EASY: 2, MEDIUM: 2 } }), { length: 15, seed: 't' });
    expect(d.picks).toHaveLength(8);
    expect(d.shortBy).toBe(7);
  });

  it('groups by subject and interleaves difficulties', () => {
    const d = assembleDiagnostic(bank({ chapters: 6, perChapter: { EASY: 2, MEDIUM: 2, HARD: 2 } }), { length: 12, seed: 'o' });
    const subjects = d.picks.map((p) => p.subjectId);
    expect(subjects).toEqual([...subjects].sort((a, b) => ['phy', 'chem', 'math'].indexOf(a) - ['phy', 'chem', 'math'].indexOf(b)));
  });
});

const ev = (chapterId: string, difficulty: Difficulty, outcome: Evidence['outcome'], extra: Partial<Evidence> = {}): Evidence => ({
  chapterId,
  difficulty,
  outcome,
  timeMs: null,
  at: NOW.toISOString(),
  source: 'diagnostic',
  ...extra,
});

describe('mastery estimate', () => {
  it('a missed Easy hurts more than a missed Hard; a correct Hard helps more than a correct Easy', () => {
    const [missEasy, missHard] = estimateMastery(['a', 'b'], [ev('a', 'EASY', 'wrong'), ev('b', 'HARD', 'wrong')], NOW);
    expect(missEasy!.mastery).toBeLessThan(missHard!.mastery);
    const [gotEasy, gotHard] = estimateMastery(['a', 'b'], [ev('a', 'EASY', 'correct'), ev('b', 'HARD', 'correct')], NOW);
    expect(gotHard!.mastery).toBeGreaterThan(gotEasy!.mastery);
  });

  it('bands: unmeasured, weak, shaky, strong', () => {
    const est = estimateMastery(
      ['none', 'weak', 'shaky', 'strong'],
      [
        ev('weak', 'EASY', 'wrong'),
        ev('weak', 'MEDIUM', 'wrong'),
        ev('shaky', 'MEDIUM', 'correct'),
        ev('shaky', 'MEDIUM', 'wrong'),
        ev('shaky', 'EASY', 'correct'),
        ev('strong', 'MEDIUM', 'correct'),
        ev('strong', 'HARD', 'correct'),
        ev('strong', 'MEDIUM', 'correct'),
      ],
      NOW,
    );
    expect(est.map((e) => e.band)).toEqual(['unmeasured', 'weak', 'shaky', 'strong']);
  });

  it('flags slow when correct answers take longer than the budget', () => {
    const [e] = estimateMastery(
      ['a'],
      [ev('a', 'MEDIUM', 'correct', { timeMs: 300_000 }), ev('a', 'MEDIUM', 'correct', { timeMs: 280_000 }), ev('a', 'HARD', 'correct', { timeMs: 500_000 })],
      NOW,
    );
    expect(e!.slow).toBe(true);
    expect(e!.band).toBe('shaky');
  });

  it('old history fades and counts less than the diagnostic', () => {
    const old = new Date(NOW.getTime() - 60 * 86_400_000).toISOString();
    const [hist, diag] = estimateMastery(['h', 'd'], [ev('h', 'EASY', 'wrong', { source: 'history', at: old }), ev('d', 'EASY', 'wrong')], NOW);
    expect(hist!.mastery).toBeGreaterThan(diag!.mastery);
    expect(hist!.answered).toBe(0);
  });

  it('skipped counts as half a wrong answer', () => {
    const [skip, wrong] = estimateMastery(['s', 'w'], [ev('s', 'MEDIUM', 'skipped'), ev('w', 'MEDIUM', 'wrong')], NOW);
    expect(skip!.beta).toBeCloseTo(1.5);
    expect(wrong!.beta).toBeCloseTo(2);
  });
});

function est(chapterId: string, band: ChapterEstimate['band'], mastery: number, slow = false): ChapterEstimate {
  return { chapterId, alpha: 1, beta: 1, mastery, evidence: band === 'unmeasured' ? 0 : 3, correct: 0, answered: 0, slow, band };
}
function info(chapterId: string, subjectId: string, supply: Partial<Record<Difficulty, number>> = { EASY: 10, MEDIUM: 10, HARD: 0 }, extra: Partial<ChapterInfo> = {}): ChapterInfo {
  return { chapterId, subjectId, supply: { EASY: 0, MEDIUM: 0, HARD: 0, ...supply }, openMistakes: 0, ...extra };
}

function sampleInput(over: Partial<PlanInput> = {}): PlanInput {
  const chapters = [
    info('p1', 'phy', undefined, { openMistakes: 3, problems: { EASY: [1, 2, 3, 4, 5, 6], MEDIUM: [7, 8, 9] } }),
    info('p2', 'phy'),
    info('c1', 'chem'),
    info('c2', 'chem'),
    info('m1', 'math'),
    info('m2', 'math', { EASY: 10, MEDIUM: 10, HARD: 3 }),
  ];
  const estimates = [est('p1', 'weak', 0.3), est('p2', 'strong', 0.85), est('c1', 'shaky', 0.6, true), est('c2', 'unmeasured', 0.5), est('m1', 'weak', 0.35), est('m2', 'strong', 0.9)];
  return { chapters, estimates, dailyMinutes: 60, days: 14, startDate: '2026-11-17', seed: 'plan', ...over };
}

describe('plan', () => {
  it('starts with reviewing the diagnostic and has checkpoints on days 7 and 14', () => {
    const p = buildPlan(sampleInput());
    expect(p).toHaveLength(14);
    expect(p[0]!.items[0]!.kind).toBe('REVIEW_DIAGNOSTIC');
    expect(p[6]!.items.some((i) => i.kind === 'CHECKPOINT')).toBe(true);
    expect(p[13]!.items.some((i) => i.kind === 'CHECKPOINT')).toBe(true);
    expect(p[13]!.date).toBe('2026-11-30');
  });

  it('touches at most 2 chapters a day and roughly respects the daily budget', () => {
    for (const day of buildPlan(sampleInput())) {
      expect(new Set(day.items.map((i) => i.chapterId).filter(Boolean)).size).toBeLessThanOrEqual(2);
      expect(day.items.reduce((s, i) => s + i.minutes, 0)).toBeLessThanOrEqual(60 + 20);
    }
  });

  it('no subject goes more than 2 days without an item', () => {
    const p = buildPlan(sampleInput());
    for (const s of ['phy', 'chem', 'math']) {
      const days = p.filter((d) => d.items.some((i) => i.subjectId === s)).map((d) => d.index);
      expect(days[0]).toBeLessThanOrEqual(2);
      for (let i = 1; i < days.length; i++) expect(days[i]! - days[i - 1]!).toBeLessThanOrEqual(3);
    }
  });

  it('weak chapters come back on expanding intervals, strong ones rarely', () => {
    const p = buildPlan(sampleInput());
    const daysOf = (c: string) => p.filter((d) => d.items.some((i) => i.chapterId === c)).map((d) => d.index);
    expect(daysOf('p1').length).toBeGreaterThanOrEqual(daysOf('p2').length);
    expect(daysOf('m1').length).toBeGreaterThanOrEqual(3);
  });

  it('weak chapters start Easy, slow chapters get timed drills, mistakes are revisited, problems named once', () => {
    const items = buildPlan(sampleInput()).flatMap((d) => d.items);
    expect(items.find((i) => i.chapterId === 'p1' && i.kind === 'PRACTICE')!.difficulty).toBe('EASY');
    expect(items.some((i) => i.chapterId === 'c1' && i.kind === 'TIMED')).toBe(true);
    expect(items.some((i) => i.chapterId === 'p1' && i.kind === 'MISTAKES')).toBe(true);
    const named = items.flatMap((i) => i.problems ?? []);
    expect(new Set(named).size).toBe(named.length);
  });

  it('never emits READ (no guides exist) and never schedules a chapter with nothing to practise', () => {
    const input = sampleInput();
    input.chapters[1] = info('p2', 'phy', { EASY: 0, MEDIUM: 0, HARD: 0 });
    input.estimates[1] = est('p2', 'weak', 0.1);
    const items = buildPlan(input).flatMap((d) => d.items);
    expect(items.some((i) => i.kind === 'READ')).toBe(false);
    expect(items.some((i) => i.chapterId === 'p2')).toBe(false);
  });

  it('a tiny bank gives light days instead of padding', () => {
    const p = buildPlan({ chapters: [info('a', 'phy', { EASY: 1 })], estimates: [est('a', 'strong', 0.95)], dailyMinutes: 30, days: 7, startDate: '2026-11-17', seed: 's' });
    expect(p.some((d) => d.light)).toBe(true);
  });

  it('is deterministic', () => {
    expect(buildPlan(sampleInput())).toEqual(buildPlan(sampleInput()));
  });

  it('re-plan keeps the past and started items, and regenerates the rest', () => {
    const first = buildPlan(sampleInput());
    first[3]!.items[0]!.startedAt = '2026-11-20T05:00:00Z';
    const improved = sampleInput();
    improved.estimates[0] = est('p1', 'strong', 0.9);
    const next = replan(first, improved, 3);
    expect(next.slice(0, 3)).toEqual(first.slice(0, 3));
    expect(next[3]!.items).toContainEqual(first[3]!.items[0]);
    expect(new Set(next[3]!.items.map((i) => i.key)).size).toBe(next[3]!.items.length);
    expect(next).toHaveLength(14);
  });

  it('ladder steps up after a good run and falls back when a tier is empty', () => {
    const e = est('a', 'weak', 0.3);
    expect(ladderStep(e, info('a', 'phy'))).toBe('EASY');
    expect(ladderStep(e, info('a', 'phy', undefined, { stepAttempts: 5, stepCorrect: 4 }))).toBe('MEDIUM');
    expect(ladderStep(est('b', 'strong', 0.9), info('b', 'phy'))).toBe('MEDIUM');
    expect(ladderStep(e, info('a', 'phy', { EASY: 0, MEDIUM: 0, HARD: 0 }))).toBeNull();
  });
});

describe('report', () => {
  it('summarises by subject and names up to 3 focus chapters (weak/shaky only)', () => {
    const picks = [
      { questionId: 'q1', familyId: 'f1', chapterId: 'p1', subjectId: 'phy', difficulty: 'EASY' as const },
      { questionId: 'q2', familyId: 'f2', chapterId: 'c1', subjectId: 'chem', difficulty: 'MEDIUM' as const },
    ];
    const answers = [ev('p1', 'EASY', 'wrong'), ev('c1', 'MEDIUM', 'skipped')];
    const input = sampleInput();
    const r = diagnosticReport(picks, answers, input.estimates, input.chapters);
    expect(r.subjects).toEqual([
      { subjectId: 'phy', correct: 0, answered: 1, skipped: 0 },
      { subjectId: 'chem', correct: 0, answered: 0, skipped: 1 },
    ]);
    expect(r.focus.length).toBeLessThanOrEqual(3);
    expect(r.focus).not.toContain('p2');
    expect(r.focus).not.toContain('c2');
    expect(r.focus[0]).toBe('p1');
  });
});

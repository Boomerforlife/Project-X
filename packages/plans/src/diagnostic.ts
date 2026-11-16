import { PLAN_CONFIG } from './config';
import { Rng } from './rng';
import { DIFFICULTIES, type Candidate, type Diagnostic, type DiagnosticPick, type Difficulty, type DifficultyCounts } from './types';

const zero = (): DifficultyCounts => ({ EASY: 0, MEDIUM: 0, HARD: 0 });

/** Where a difficulty's shortfall goes, nearest first. */
const FALLBACK: Record<Difficulty, Difficulty[]> = {
  HARD: ['MEDIUM', 'EASY'],
  EASY: ['MEDIUM', 'HARD'],
  MEDIUM: ['HARD', 'EASY'],
};

/** round(N × share) per difficulty, with the rounding remainder on MEDIUM so the quotas sum to N. */
export function requestedMix(length: number, mix: Record<Difficulty, number> = PLAN_CONFIG.mix): DifficultyCounts {
  const total = mix.EASY + mix.MEDIUM + mix.HARD || 1;
  const q = zero();
  q.EASY = Math.round((length * mix.EASY) / total);
  q.HARD = Math.round((length * mix.HARD) / total);
  q.MEDIUM = Math.max(0, length - q.EASY - q.HARD);
  return q;
}

/** Cap each quota at supply and move the shortfall to the nearest difficulty that has room. */
export function fitMix(requested: DifficultyCounts, supply: DifficultyCounts): DifficultyCounts {
  const q = { ...requested };
  for (const d of ['HARD', 'EASY', 'MEDIUM'] as const) {
    let excess = Math.max(0, q[d] - supply[d]);
    q[d] -= excess;
    for (const f of FALLBACK[d]) {
      if (excess === 0) break;
      const room = Math.max(0, supply[f] - q[f]);
      const moved = Math.min(room, excess);
      q[f] += moved;
      excess -= moved;
    }
  }
  return q;
}

/**
 * Assemble a diagnostic: the requested difficulty mix where supply allows, spread across chapters round-robin (no chapter
 * gets a second question until every chapter with supply has one), untried problems first, one variant per problem.
 */
export function assembleDiagnostic(
  candidates: readonly Candidate[],
  opts: { length: number; seed: string; mix?: Record<Difficulty, number> },
): Diagnostic {
  const rng = new Rng(`diag:${opts.seed}`);
  const seen = new Set<string>();
  const unique = candidates.filter((c) => c.questionIds.length > 0 && !seen.has(c.familyId) && seen.add(c.familyId));

  const supply = zero();
  for (const c of unique) supply[c.difficulty]++;
  const requested = requestedMix(opts.length, opts.mix);
  const quota = fitMix(requested, supply);

  // Per chapter, per difficulty: untried first, each tier shuffled.
  const byChapter = new Map<string, Record<Difficulty, Candidate[]>>();
  for (const c of unique) {
    const row = byChapter.get(c.chapterId) ?? { EASY: [], MEDIUM: [], HARD: [] };
    row[c.difficulty].push(c);
    byChapter.set(c.chapterId, row);
  }
  for (const row of byChapter.values()) {
    for (const d of DIFFICULTIES) {
      const xs = row[d];
      row[d] = [...rng.shuffle(xs.filter((x) => !x.tried)), ...rng.shuffle(xs.filter((x) => x.tried))];
    }
  }
  const chapters = rng.shuffle([...byChapter.keys()].sort());
  // Prefer untried globally: a chapter only offers a tried problem when no chapter has an untried one at that difficulty.
  const untriedLeft = (d: Difficulty) => [...byChapter.values()].some((r) => r[d].some((x) => !x.tried));

  const picked: Candidate[] = [];
  const left = { ...quota };
  let progress = true;
  while (progress && DIFFICULTIES.some((d) => left[d] > 0)) {
    progress = false;
    for (const ch of chapters) {
      const row = byChapter.get(ch)!;
      const options = DIFFICULTIES.filter((d) => left[d] > 0 && row[d].length > 0 && (!row[d][0]!.tried || !untriedLeft(d)));
      if (options.length === 0) continue;
      // Largest remaining quota first; ties go to the harder label (keeps the test informative).
      options.sort((a, b) => left[b] - left[a] || DIFFICULTIES.indexOf(b) - DIFFICULTIES.indexOf(a));
      const d = options[0]!;
      picked.push(row[d].shift()!);
      left[d]--;
      progress = true;
    }
  }

  const picks: DiagnosticPick[] = picked.map((c) => ({
    questionId: c.questionIds[rng.int(c.questionIds.length)]!,
    familyId: c.familyId,
    chapterId: c.chapterId,
    subjectId: c.subjectId,
    difficulty: c.difficulty,
  }));

  const actual = zero();
  for (const p of picks) actual[p.difficulty]++;
  return { picks: orderPicks(picks, candidates), requestedMix: requested, actualMix: actual, shortBy: Math.max(0, opts.length - picks.length) };
}

/** Group by subject (in the order subjects first appear in the input), interleaving difficulties within each subject. */
function orderPicks(picks: DiagnosticPick[], candidates: readonly Candidate[]): DiagnosticPick[] {
  const subjectOrder = [...new Set(candidates.map((c) => c.subjectId))];
  const out: DiagnosticPick[] = [];
  for (const s of subjectOrder) {
    const buckets = DIFFICULTIES.map((d) => picks.filter((p) => p.subjectId === s && p.difficulty === d));
    while (buckets.some((b) => b.length)) for (const b of buckets) if (b.length) out.push(b.shift()!);
  }
  return out;
}

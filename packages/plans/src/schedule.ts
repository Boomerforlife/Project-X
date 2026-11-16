import { PLAN_CONFIG } from './config';
import { Rng } from './rng';
import { DIFFICULTIES, type ChapterEstimate, type ChapterInfo, type Difficulty, type PlanDay, type PlanInput, type PlanItem } from './types';

const LADDER_START: Record<ChapterEstimate['band'], number> = { weak: 0, unmeasured: 1, shaky: 1, strong: 2 };

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const totalSupply = (c: ChapterInfo) => c.supply.EASY + c.supply.MEDIUM + c.supply.HARD;

/** How much a chapter deserves time: weakness × (a little extra if unmeasured) × whether there is anything left to practise. */
export function priority(est: ChapterEstimate, info: ChapterInfo): number {
  const supply = Math.min(1, totalSupply(info) / 5);
  let p = 1 - est.mastery;
  if (est.band === 'unmeasured') p *= PLAN_CONFIG.unmeasuredBoost;
  if (est.band === 'strong') p = Math.min(p, PLAN_CONFIG.strongPriorityCap);
  return p * supply;
}

/** Difficulty to practise next: band start, one step up after a good run, then the nearest step that has supply. */
export function ladderStep(est: ChapterEstimate, info: ChapterInfo): Difficulty | null {
  let step = LADDER_START[est.band];
  const n = info.stepAttempts ?? 0;
  if (n >= PLAN_CONFIG.stepUpMinAttempts && (info.stepCorrect ?? 0) / n >= PLAN_CONFIG.stepUpAccuracy) step = Math.min(2, step + 1);
  const order = [step, step - 1, step - 2, step + 1, step + 2].filter((i) => i >= 0 && i <= 2);
  for (const i of order) if (info.supply[DIFFICULTIES[i]!] > 0) return DIFFICULTIES[i]!;
  return null;
}

interface ChState {
  info: ChapterInfo;
  est: ChapterEstimate;
  p: number;
  tie: number;
  offsets: readonly number[];
  occ: number[];
  usedProblems: Set<number>;
}

function dueDay(c: ChState): number | null {
  if (c.occ.length === 0) return null;
  const first = c.occ[0]!;
  const i = c.occ.length;
  return i < c.offsets.length ? first + c.offsets[i]! : c.occ[c.occ.length - 1]! + 7;
}

const isCheckpointDay = (d: number, days: number) => (d === 6 || d === 13) && d < days;

/** Build a fresh plan from day 0. */
export function buildPlan(input: PlanInput): PlanDay[] {
  return replan([], input, 0);
}

/**
 * Re-plan from `todayIndex`: days before it are kept as they are, today's started or finished items are kept, and everything
 * else is regenerated from the current estimates. Deterministic for the same input.
 */
export function replan(previous: readonly PlanDay[], input: PlanInput, todayIndex: number): PlanDay[] {
  const cfg = PLAN_CONFIG;
  const rng = new Rng(`plan:${input.seed}`);
  const from = Math.max(0, Math.min(todayIndex, input.days));
  const estById = new Map(input.estimates.map((e) => [e.chapterId, e]));
  const order = rng.shuffle(input.chapters.map((c) => c.chapterId).sort());

  const chapters = new Map<string, ChState>();
  for (const info of input.chapters) {
    const est = estById.get(info.chapterId);
    if (!est) continue;
    chapters.set(info.chapterId, {
      info,
      est,
      p: priority(est, info),
      tie: order.indexOf(info.chapterId),
      offsets: cfg.spacing[est.band],
      occ: [],
      usedProblems: new Set(),
    });
  }

  const subjects = [...new Set(input.chapters.map((c) => c.subjectId))];
  const lastSeen = new Map<string, number>(subjects.map((s) => [s, -1]));
  const days: PlanDay[] = [];

  const note = (day: PlanDay) => {
    const seenToday = new Set<string>();
    for (const it of day.items) {
      if (it.subjectId) lastSeen.set(it.subjectId, day.index);
      if (it.chapterId && !seenToday.has(it.chapterId)) {
        seenToday.add(it.chapterId);
        const c = chapters.get(it.chapterId);
        if (c) {
          c.occ.push(day.index);
          for (const n of it.problems ?? []) c.usedProblems.add(n);
        }
      } else if (it.chapterId) {
        for (const n of it.problems ?? []) chapters.get(it.chapterId)?.usedProblems.add(n);
      }
    }
  };

  // Keep the past as it was.
  for (const d of previous) {
    if (d.index < from) {
      days.push(d);
      note(d);
    }
  }

  for (let d = from; d < input.days; d++) {
    const prevToday = d === from ? previous.find((x) => x.index === d) : undefined;
    const kept = (prevToday?.items ?? []).filter((it) => it.startedAt || it.completedAt);
    note({ index: d, date: '', items: kept, light: false });
    const items: PlanItem[] = [...kept];
    let budget = input.dailyMinutes - kept.reduce((s, it) => s + it.minutes, 0);
    const has = (k: PlanItem['kind']) => items.some((it) => it.kind === k);
    const push = (it: Omit<PlanItem, 'key'>) => {
      let pos = items.length;
      while (items.some((x) => x.key === `d${d}-${pos}`)) pos++;
      items.push({ ...it, key: `d${d}-${pos}` });
      budget -= it.minutes;
    };

    if (d === 0 && !has('REVIEW_DIAGNOSTIC')) {
      push(blank('REVIEW_DIAGNOSTIC', Math.min(cfg.reviewDiagnosticMinutes, Math.round(input.dailyMinutes / 3))));
    }
    if (isCheckpointDay(d, input.days) && !has('CHECKPOINT')) {
      const size = cfg.checkpointSize;
      push({ ...blank('CHECKPOINT', Math.round(input.dailyMinutes / 2)), size, timeLimitSec: size * cfg.diagnosticSecPerQuestion });
    }

    const keptChapters = new Set(kept.map((it) => it.chapterId).filter(Boolean) as string[]);
    const picked = pickChapters(d, chapters, keptChapters, lastSeen, budget);
    const share = picked.reduce((s, c) => s + c.p, 0) || 1;
    const budgetForChapters = budget;
    for (const c of picked) {
      let mins = Math.max(10, Math.floor((budgetForChapters * c.p) / share));
      const occIdx = c.occ.length;
      if (c.info.openMistakes > 0 && occIdx % 2 === 1) {
        const size = Math.min(c.info.openMistakes, 5);
        push({ ...blank('MISTAKES', size * 4), chapterId: c.info.chapterId, subjectId: c.info.subjectId, size });
        mins -= size * 4;
      }
      const step = ladderStep(c.est, c.info);
      if (step && mins > 0) {
        const cost = cfg.minutesPerQuestion[step];
        const size = Math.max(cfg.sessionMin, Math.min(cfg.sessionMax, Math.floor(mins / cost)));
        const base = { chapterId: c.info.chapterId, subjectId: c.info.subjectId, difficulty: step };
        const fresh = (c.info.problems?.[step] ?? []).filter((n) => !c.usedProblems.has(n));
        if (c.est.slow && occIdx >= 1) {
          push({ ...blank('TIMED', size * cost), ...base, size, timeLimitSec: size * cfg.timeBudgetSec[step] });
        } else if (occIdx % 2 === 1 && fresh.length >= 2) {
          const n = Math.max(2, Math.min(4, Math.floor(mins / cost), fresh.length));
          const problems = fresh.slice(0, n);
          problems.forEach((x) => c.usedProblems.add(x));
          push({ ...blank('PROBLEMS', n * cost), ...base, problems });
        } else {
          push({ ...blank('PRACTICE', size * cost), ...base, size });
        }
      }
      c.occ.push(d);
      lastSeen.set(c.info.subjectId, d);
    }
    const light = !items.some((it) => it.chapterId) && !has('CHECKPOINT');
    days.push({ index: d, date: addDays(input.startDate, d), items, light });
  }
  return days;
}

function blank(kind: PlanItem['kind'], minutes: number): Omit<PlanItem, 'key'> {
  return { kind, chapterId: null, subjectId: null, difficulty: null, size: null, problems: null, timeLimitSec: null, minutes: Math.max(1, minutes) };
}

/** Up to maxChaptersPerDay chapters: neglected subjects first, then overdue reviews, then new chapters by priority. */
function pickChapters(d: number, chapters: Map<string, ChState>, keptToday: Set<string>, lastSeen: Map<string, number>, budget: number): ChState[] {
  const cfg = PLAN_CONFIG;
  const slots = cfg.maxChaptersPerDay - keptToday.size;
  if (slots <= 0 || budget < 10) return [];
  const eligible = [...chapters.values()].filter(
    (c) => !keptToday.has(c.info.chapterId) && c.p > 0 && (totalSupply(c.info) > 0 || c.info.openMistakes > 0),
  );
  const byP = (a: ChState, b: ChState) => b.p - a.p || a.tie - b.tie;
  const due = eligible.filter((c) => (dueDay(c) ?? Infinity) <= d).sort((a, b) => dueDay(a)! - dueDay(b)! || byP(a, b));
  const fresh = eligible.filter((c) => c.occ.length === 0).sort(byP);

  const ordered: ChState[] = [];
  // A subject unseen for more than maxSubjectGapDays gets its best chapter first.
  for (const [s, last] of lastSeen) {
    if (d - last > cfg.maxSubjectGapDays) {
      const best = eligible.filter((c) => c.info.subjectId === s).sort(byP)[0];
      if (best) ordered.push(best);
    }
  }
  ordered.push(...due, ...fresh);

  const out: ChState[] = [];
  const subjects = new Set<string>();
  for (const pass of [0, 1]) {
    for (const c of ordered) {
      if (out.length >= slots) break;
      if (out.includes(c)) continue;
      if (pass === 0 && subjects.has(c.info.subjectId)) continue;
      out.push(c);
      subjects.add(c.info.subjectId);
    }
  }
  return out;
}

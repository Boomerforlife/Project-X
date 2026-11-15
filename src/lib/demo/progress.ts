/**
 * Progress & gamification selectors (demo). In production these numbers come
 * from Person 2's analytics endpoints; the rules below are the PROPOSED
 * definitions to agree on (what counts as a streak day, how XP is earned).
 */
import type { SubjectId } from "@/contracts";
import { catalog } from "@/lib/data/catalog";
import { EXAMS } from "@/lib/exams";
import { dayKey, daysAgo, startOfWeek } from "./dates";
import { flags } from "@/lib/api/env";
import { DATA_SOURCE } from "@/lib/site";
import { judge, scoreAttempt } from "./scoring";
import type { CosmeticId, DemoState } from "./types";

const API = DATA_SOURCE === "api";
/** Papers/CBT (and anything built on them) are hidden in API mode unless the demo flag is on. */
export const PAPERS_ENABLED = !API || flags.papers === "demo";
export const LEADERBOARD_ENABLED = !API || flags.leaderboard === "demo";

/**
 * A day only counts towards a streak with real practice behind it. Mock mode
 * proposes 5; API mode follows the server rule: one graded answer per day.
 */
export const STREAK_MIN_QUESTIONS = API ? 1 : 5;

export function streaks(s: DemoState) {
  if (s.server?.streak) {
    const x = s.server.streak;
    return { current: x.current, longest: Math.max(x.longest, x.current), todayDone: x.todayAttempts >= STREAK_MIN_QUESTIONS };
  }
  const active = (k: string) => (s.activity[k]?.answered ?? 0) >= STREAK_MIN_QUESTIONS;
  let current = 0;
  // Today counts if done; otherwise the streak is still alive from yesterday.
  let i = active(dayKey()) ? 0 : 1;
  while (active(dayKey(daysAgo(i)))) {
    current++;
    i++;
  }
  const keys = Object.keys(s.activity).sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of keys) {
    if (!active(k)) {
      run = 0;
      prev = null;
      continue;
    }
    const d = new Date(k + "T12:00:00");
    run = prev && Math.round((d.getTime() - prev.getTime()) / 86400000) === 1 ? run + 1 : 1;
    prev = d;
    longest = Math.max(longest, run);
  }
  return { current, longest: Math.max(longest, current), todayDone: active(dayKey()) };
}

export function totals(s: DemoState) {
  let answered = 0, correct = 0, xp = 0, seconds = 0;
  for (const d of Object.values(s.activity)) {
    answered += d.answered;
    correct += d.correct;
    xp += d.xp;
    seconds += d.seconds;
  }
  return { answered, correct, xp, seconds, accuracy: answered ? correct / answered : null };
}

export function today(s: DemoState) {
  return s.activity[dayKey()] ?? { answered: 0, correct: 0, xp: 0, seconds: 0, subjects: {} };
}

export function thisWeek(s: DemoState) {
  const start = startOfWeek();
  let answered = 0, correct = 0, xp = 0, seconds = 0;
  const subjects = new Set<string>();
  for (const [k, d] of Object.entries(s.activity)) {
    if (new Date(k + "T12:00:00") < start) continue;
    answered += d.answered;
    correct += d.correct;
    xp += d.xp;
    seconds += d.seconds;
    Object.keys(d.subjects).forEach((x) => subjects.add(x));
  }
  return { answered, correct, xp, seconds, subjects };
}

/* ---------- Levels ---------- */

export const TIERS = [
  { min: 1, name: "Novice" },
  { min: 5, name: "Apprentice" },
  { min: 10, name: "Scholar" },
  { min: 15, name: "Adept" },
  { min: 20, name: "Expert" },
  { min: 30, name: "Master" },
];

/** XP needed to *reach* level n: 50·n·(n−1). Level 2 at 100, 3 at 300, 10 at 4500. */
const levelStart = (n: number) => 50 * n * (n - 1);

export function level(xp: number) {
  let n = 1;
  while (levelStart(n + 1) <= xp) n++;
  const from = levelStart(n);
  const to = levelStart(n + 1);
  const tier = [...TIERS].reverse().find((t) => n >= t.min)!;
  return { level: n, tier: tier.name, into: xp - from, span: to - from, toNext: to - xp };
}

/* ---------- Subject / chapter breakdown (from real attempt responses) ---------- */

export function subjectStats(s: DemoState) {
  const exam = s.user?.exam ?? "jee-main";
  if (s.server) {
    // Server truth: GET /users/me/progress. No blending with invented averages.
    return EXAMS[exam].subjects.map((subject) => {
      const row = s.server!.subjects.find((x) => x.subject === subject);
      return { subject, answered: row?.answered ?? 0, accuracy: row && row.answered ? row.correct / row.answered : 0 };
    });
  }
  const out = new Map<SubjectId, { answered: number; correct: number }>();
  for (const id of EXAMS[exam].subjects) out.set(id, { answered: 0, correct: 0 });
  for (const d of Object.values(s.activity)) {
    for (const [sub, n] of Object.entries(d.subjects)) {
      const row = out.get(sub as SubjectId);
      if (row) row.answered += n ?? 0;
    }
  }
  // Correct counts by subject come from attempts (activity only stores totals).
  const ratio = new Map<string, { a: number; c: number }>();
  for (const a of Object.values(s.attempts)) {
    for (const qid of a.questionIds) {
      const r = a.responses[qid];
      if (!r?.answer || (a.mode === "learning" && !r.checked) || (a.mode !== "learning" && a.status !== "submitted")) continue;
      const q = catalog.question(qid);
      if (!q) continue;
      const { outcome } = judge(q, catalog.solution(qid), r.answer);
      const row = ratio.get(q.subject) ?? { a: 0, c: 0 };
      row.a++;
      if (outcome === "correct") row.c++;
      ratio.set(q.subject, row);
    }
  }
  const overall = totals(s).accuracy ?? 0.6;
  return [...out.entries()].map(([subject, v]) => {
    const rr = ratio.get(subject);
    // Blend attempt-level accuracy with the long-run average when the sample is small.
    const acc = rr && rr.a >= 5 ? rr.c / rr.a : rr ? (rr.c + overall * 5) / (rr.a + 5) : overall;
    return { subject, answered: v.answered, accuracy: acc };
  });
}

export function chapterStats(s: DemoState) {
  if (s.server) return s.server.chapters;
  const m = new Map<string, { subject: SubjectId; chapter: string; answered: number; correct: number }>();
  for (const a of Object.values(s.attempts)) {
    for (const qid of a.questionIds) {
      const r = a.responses[qid];
      if (!r?.answer || (a.mode === "learning" && !r.checked) || (a.mode !== "learning" && a.status !== "submitted")) continue;
      const q = catalog.question(qid);
      if (!q) continue;
      const k = `${q.subject}/${q.chapter}`;
      const row = m.get(k) ?? { subject: q.subject, chapter: q.chapter, answered: 0, correct: 0 };
      row.answered++;
      if (judge(q, catalog.solution(qid), r.answer).outcome === "correct") row.correct++;
      m.set(k, row);
    }
  }
  return [...m.values()];
}

/** The weakest chapter with enough evidence, or the next untouched one. */
export function recommendation(s: DemoState) {
  const exam = s.user?.exam ?? "jee-main";
  if (s.server?.weak.length) {
    const w = s.server.weak[0]!;
    return { kind: "weak" as const, subject: w.subject, chapter: w.chapter, accuracy: w.accuracy, answered: w.answered };
  }
  const stats = s.server ? [] : chapterStats(s).filter((c) => c.answered >= 3 && catalog.chapter(c.subject, c.chapter)?.exams.includes(exam));
  stats.sort((a, b) => a.correct / a.answered - b.correct / b.answered);
  const weak = stats[0];
  if (weak && weak.correct / weak.answered < 0.75) {
    return { kind: "weak" as const, subject: weak.subject, chapter: weak.chapter, accuracy: weak.correct / weak.answered, answered: weak.answered };
  }
  const touched = new Set(chapterStats(s).map((c) => `${c.subject}/${c.chapter}`));
  const counts = catalog.chapterCounts(exam);
  const next = catalog.chapters({ exam }).find((c) => !touched.has(`${c.subject}/${c.slug}`) && (counts.get(`${c.subject}/${c.slug}`) ?? 0) >= 6);
  return next ? { kind: "new" as const, subject: next.subject, chapter: next.slug, accuracy: null, answered: 0 } : null;
}

/** Weekly accuracy for the last `n` weeks (oldest first). */
export function weeklyTrend(s: DemoState, n = 8) {
  const start = startOfWeek();
  const rows = Array.from({ length: n }, (_, i) => {
    const from = new Date(start);
    from.setDate(from.getDate() - 7 * (n - 1 - i));
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to, answered: 0, correct: 0 };
  });
  for (const [k, d] of Object.entries(s.activity)) {
    const t = new Date(k + "T12:00:00");
    const row = rows.find((r) => t >= r.from && t < r.to);
    if (row) {
      row.answered += d.answered;
      row.correct += d.correct;
    }
  }
  return rows.map((r) => ({ label: r.from.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), answered: r.answered, accuracy: r.answered ? r.correct / r.answered : null }));
}

/* ---------- Achievements ---------- */

export type Achievement = { id: string; name: string; desc: string; icon: PixelIconName; done: boolean; progress: [number, number] };
export type PixelIconName = "spark" | "flame" | "flame2" | "hundred" | "scroll" | "target" | "loop" | "atom" | "monitor" | "crown" | "star" | "book";

export function achievements(s: DemoState): Achievement[] {
  const t = totals(s);
  const st = streaks(s);
  const subs = scoredAttempts(s);
  const papers = subs.filter((a) => a.attempt.kind === "paper").length;
  const cbts = subs.filter((a) => a.attempt.mode === "cbt").length;
  const sharp = subs.some((a) => a.result.correct + a.result.incorrect + a.result.partial >= 10 && (a.result.accuracy ?? 0) >= 0.9);
  const cleared = Object.values(s.mistakes).filter((m) => m.status === "resolved").length;
  const exam = s.user?.exam ?? "jee-main";
  const subjectsDone = subjectStats(s).filter((x) => x.answered > 0).length;
  const nSub = EXAMS[exam].subjects.length;
  const A = (id: string, name: string, desc: string, icon: PixelIconName, have: number, need: number): Achievement => ({
    id, name, desc, icon, done: have >= need, progress: [Math.min(have, need), need],
  });
  const list = [
    A("first", "First steps", "Answer your first question.", "spark", t.answered, 1),
    A("streak7", "Week-long", "Keep a 7-day practice streak.", "flame", st.longest, 7),
    A("streak30", "Habit formed", "Keep a 30-day practice streak.", "flame2", st.longest, 30),
    A("q100", "Centurion", "Answer 100 questions.", "hundred", t.answered, 100),
    A("q1000", "Thousand club", "Answer 1,000 questions.", "book", t.answered, 1000),
    A("paper", "Full paper", "Submit a full paper or mock test.", "scroll", papers, 1),
    A("sharp", "Sharpshooter", "Score 90% accuracy in a session of 10+ questions.", "target", sharp ? 1 : 0, 1),
    A("comeback", "Comeback", "Clear 5 questions from your mistake notebook.", "loop", cleared, 5),
    A("allround", "All-rounder", "Practise every subject in your exam.", "atom", subjectsDone, nSub),
    A("cbt3", "Exam-ready", "Finish 3 attempts in the CBT interface.", "monitor", cbts, 3),
  ];
  return PAPERS_ENABLED ? list : list.filter((a) => a.id !== "paper" && a.id !== "cbt3");
}

export function scoredAttempts(s: DemoState) {
  return Object.values(s.attempts)
    .filter((a) => a.status === "submitted")
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
    .map((attempt) => ({ attempt, result: scoreAttempt(attempt) }));
}

/* ---------- Weekly challenges ---------- */

export function challenges(s: DemoState) {
  const w = thisWeek(s);
  const start = startOfWeek().toISOString();
  const papers = Object.values(s.attempts).filter((a) => a.kind === "paper" && a.status === "submitted" && (a.submittedAt ?? "") >= start).length;
  const cleared = Object.values(s.mistakes).filter((m) => m.status === "resolved" && (m.resolvedAt ?? "") >= start).length;
  const exam = s.user?.exam ?? "jee-main";
  const nSub = EXAMS[exam].subjects.length;
  const goal = (s.user?.dailyGoal ?? 20) * 5;
  const list = [
    { id: "volume", name: `Answer ${goal} questions`, xp: 100, have: w.answered, need: goal },
    { id: "paper", name: "Finish a full paper or mock", xp: 150, have: papers, need: 1 },
    { id: "mistakes", name: "Clear 5 mistakes", xp: 75, have: cleared, need: 5 },
    { id: "spread", name: `Practise all ${nSub} subjects`, xp: 50, have: [...w.subjects].filter((x) => EXAMS[exam].subjects.includes(x as SubjectId)).length, need: nSub },
  ];
  // API mode: no paper bonus, and the per-day subject split is not available from the server.
  return API ? list.filter((c) => c.id !== "spread" && (PAPERS_ENABLED || c.id !== "paper")) : list;
}

/* ---------- Leaderboard (mock peers) ---------- */

const PEERS = [
  "Ananya R.", "Vihaan K.", "Ishita M.", "Kabir S.", "Diya P.", "Arjun N.", "Meera J.", "Reyansh T.", "Saanvi G.", "Aditya B.",
  "Myra D.", "Rohan V.", "Tara L.", "Krish A.", "Zoya H.",
];

/**
 * Weekly practice XP among students preparing for the same exam. It measures
 * effort this week — not marks, not an exam rank. Names are demo data.
 */
export function leaderboard(s: DemoState) {
  const exam = s.user?.exam ?? "jee-main";
  const seed = startOfWeek().getTime() / 86400000 + exam.length;
  const w = thisWeek(s);
  const dayOfWeek = ((new Date().getDay() + 6) % 7) + 1; // 1..7
  const peers = PEERS.map((name, i) => {
    const base = 1700 - i * 105 + ((seed * (i + 7)) % 90);
    return { name, xp: Math.max(40, Math.round((base * dayOfWeek) / 7)), you: false };
  });
  const rows = [...peers, { name: s.user?.showOnLeaderboard === false ? "You (hidden from others)" : `${s.user?.name ?? "You"} (you)`, xp: w.xp, you: true }];
  rows.sort((a, b) => b.xp - a.xp);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/* ---------- Kitty wardrobe ---------- */

export const COSMETICS: { id: CosmeticId; name: string; level: number }[] = [
  { id: "glasses", name: "Reading glasses", level: 3 },
  { id: "scarf", name: "Winter scarf", level: 6 },
  { id: "bowtie", name: "Bow tie", level: 9 },
  { id: "crown", name: "Pixel crown", level: 20 },
];

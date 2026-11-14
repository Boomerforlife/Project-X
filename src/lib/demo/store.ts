"use client";

/**
 * DEMO STORE — the stand-in for Person 2's attempt / bookmark / mistake /
 * analytics APIs while contracts are being agreed.
 *
 * Persisted in this browser's localStorage, which is fine for a demo and NOT
 * acceptable as the source of truth in production (CLAUDE.md §13). Screens
 * talk to this module through the actions below; swapping it for real API
 * calls should not require touching page layouts.
 */
import { useSyncExternalStore } from "react";
import type { ExamId, Response, ResponseValue, SubjectId } from "@/contracts";
import { catalog } from "@/lib/data/catalog";
import { EXAMS } from "@/lib/exams";
import { judge } from "./scoring";
import { buildSeed } from "./seed";
import { dayKey } from "./dates";
import type { Attempt, AttemptSection, DayActivity, DemoState, DemoUser, MistakeCategory } from "./types";
import { Rng } from "@/fixtures/bank/engine";

const KEY = "tabby-demo-v2";

const EMPTY: DemoState = { v: 2, user: null, attempts: {}, bookmarks: {}, review: {}, mistakes: {}, activity: {} };

let state: DemoState | null = null;
const listeners = new Set<() => void>();

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed && parsed.v === 2) return parsed;
    }
  } catch {
    /* private mode / corrupted — start clean */
  }
  return EMPTY;
}

function current(): DemoState {
  if (!state) state = load();
  return state;
}

let saveFailed = false;
function commit(next: DemoState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    saveFailed = false;
  } catch {
    saveFailed = true;
  }
  listeners.forEach((l) => l());
}

export function demoSaveFailed() {
  return saveFailed;
}

function update(fn: (s: DemoState) => DemoState) {
  commit(fn(current()));
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = load();
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** `null` until hydrated on the client — render a skeleton for that case. */
export function useDemo(): DemoState | null {
  return useSyncExternalStore(subscribe, current, () => null);
}

export function getDemoState() {
  return current();
}

/* ---------- helpers ---------- */

const nowIso = () => new Date().toISOString();

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function blankResponse(questionId: string): Response {
  return { questionId, answer: null, checked: false, markedForReview: false, visited: false, timeSpentSec: 0, savedAt: null };
}

export const XP = { correct: 10, partial: 5, incorrect: 2, paperBonus: 50, mistakeCleared: 15 } as const;

function addActivity(s: DemoState, entries: { subject: SubjectId; outcome: string; seconds: number }[], bonusXp = 0): DemoState {
  if (!entries.length && !bonusXp) return s;
  const k = dayKey();
  const d: DayActivity = s.activity[k] ?? { answered: 0, correct: 0, xp: 0, seconds: 0, subjects: {} };
  const subjects = { ...d.subjects };
  let { answered, correct, xp, seconds } = d;
  for (const e of entries) {
    answered += 1;
    seconds += e.seconds;
    subjects[e.subject] = (subjects[e.subject] ?? 0) + 1;
    if (e.outcome === "correct") {
      correct += 1;
      xp += XP.correct;
    } else if (e.outcome === "partial") xp += XP.partial;
    else xp += XP.incorrect;
  }
  xp += bonusXp;
  return { ...s, activity: { ...s.activity, [k]: { answered, correct, xp, seconds, subjects } } };
}

/* ---------- account ---------- */

export function demoLogin(name = "Aarav") {
  update((s) => ({
    ...EMPTY,
    // Keep nothing from a previous demo user; a fresh demo is the expectation.
    user: {
      name,
      exam: "jee-main",
      classLevel: "12",
      dailyGoal: 20,
      onboarded: false,
      joinedAt: nowIso(),
      showOnLeaderboard: true,
      cosmetic: null,
    },
    v: s.v,
  }));
}

/** Completes onboarding and fills the account with a believable history for the chosen exam. */
export function completeOnboarding(patch: Partial<DemoUser>) {
  update((s) => {
    const user = { ...(s.user as DemoUser), ...patch, onboarded: true };
    const seed = buildSeed(user.exam);
    return { ...s, ...seed, user: { ...user, joinedAt: seed.joinedAt, cosmetic: "glasses" } };
  });
}

export function updateUser(patch: Partial<DemoUser>) {
  update((s) => (s.user ? { ...s, user: { ...s.user, ...patch } } : s));
}

export function signOut() {
  commit(EMPTY);
}

/* ---------- attempts ---------- */

function sectionsFor(exam: ExamId, questionIds: string[]): AttemptSection[] {
  const marking = EXAMS[exam].marking;
  const bySubject = new Map<SubjectId, string[]>();
  for (const id of questionIds) {
    const q = catalog.question(id);
    if (!q) continue;
    bySubject.set(q.subject, [...(bySubject.get(q.subject) ?? []), id]);
  }
  return [...bySubject.entries()].map(([subject, ids]) => ({
    id: subject,
    name: catalog.subject(subject)?.name ?? subject,
    subject,
    questionIds: ids,
    marking: { single_correct: { correct: 4, incorrect: -1, unattempted: 0, partial: false }, numerical: { correct: 4, incorrect: -1, unattempted: 0, partial: false }, multiple_correct: { correct: 4, incorrect: -2, unattempted: 0, partial: true }, ...marking },
  }));
}

export function pickQuestions(opts: {
  exam: ExamId;
  subject?: SubjectId;
  chapter?: string;
  difficulty?: "easy" | "medium" | "hard";
  count: number;
}) {
  const s = current();
  const seen = new Set(Object.values(s.attempts).flatMap((a) => Object.keys(a.responses).filter((k) => a.responses[k].answer)));
  let pool = catalog.questions({ exam: opts.exam, subject: opts.subject, chapter: opts.chapter });
  if (opts.difficulty) {
    const filtered = pool.filter((q) => q.difficulty === opts.difficulty);
    if (filtered.length >= Math.min(opts.count, 3)) pool = filtered;
  }
  const r = new Rng(Date.now());
  const fresh = r.shuffle(pool.filter((q) => !seen.has(q.id)));
  const old = r.shuffle(pool.filter((q) => seen.has(q.id)));
  // Spread across templates/chapters: avoid serving near-identical variants back to back.
  const ordered = [...fresh, ...old];
  const out: string[] = [];
  const usedKeys = new Set<string>();
  for (const q of ordered) {
    const k = q.id.replace(/_\d+$/, "");
    if (usedKeys.has(k)) continue;
    usedKeys.add(k);
    out.push(q.id);
    if (out.length >= opts.count) break;
  }
  for (const q of ordered) {
    if (out.length >= opts.count) break;
    if (!out.includes(q.id)) out.push(q.id);
  }
  return out;
}

export function startPractice(opts: {
  exam: ExamId;
  mode: "learning" | "test";
  title: string;
  questionIds: string[];
  scope?: Attempt["scope"];
  durationSec?: number | null;
}) {
  const id = newId("att");
  const t = nowIso();
  const attempt: Attempt = {
    id,
    exam: opts.exam,
    mode: opts.mode,
    kind: "practice",
    title: opts.title,
    scope: opts.scope,
    questionIds: opts.questionIds,
    sections: sectionsFor(opts.exam, opts.questionIds),
    durationSec: opts.durationSec ?? null,
    startedAt: t,
    updatedAt: t,
    submittedAt: null,
    status: "in_progress",
    current: 0,
    elapsedSec: 0,
    responses: Object.fromEntries(opts.questionIds.map((q) => [q, blankResponse(q)])),
  };
  // Keep practice order aligned with sections so navigation matches the palette.
  attempt.questionIds = attempt.sections.flatMap((s) => s.questionIds);
  update((s) => ({ ...s, attempts: { ...s.attempts, [id]: attempt } }));
  return id;
}

/** Starts a paper. A retry is ALWAYS a new attempt; the original is untouched. */
export function startPaper(paperId: string, mode: "cbt" | "test" | "learning", retryOf?: string) {
  const p = catalog.paper(paperId);
  if (!p) throw new Error(`Unknown paper ${paperId}`);
  const id = newId("att");
  const t = nowIso();
  const questionIds = p.sections.flatMap((s) => s.questionIds);
  const attempt: Attempt = {
    id,
    exam: p.exam,
    mode,
    kind: "paper",
    title: p.title,
    paperId,
    ...(retryOf ? { retryOf } : {}),
    questionIds,
    sections: p.sections.map((s) => ({ ...s })),
    durationSec: mode === "learning" ? null : p.durationMinutes * 60,
    startedAt: t,
    updatedAt: t,
    submittedAt: null,
    status: "in_progress",
    current: 0,
    elapsedSec: 0,
    responses: Object.fromEntries(questionIds.map((q) => [q, blankResponse(q)])),
  };
  update((s) => ({ ...s, attempts: { ...s.attempts, [id]: attempt } }));
  return id;
}

function patchAttempt(id: string, fn: (a: Attempt) => Attempt) {
  update((s) => {
    const a = s.attempts[id];
    if (!a || a.status === "submitted") return s;
    return { ...s, attempts: { ...s.attempts, [id]: { ...fn(a), updatedAt: nowIso() } } };
  });
}

export function setResponse(attemptId: string, qid: string, patch: Partial<Response>) {
  patchAttempt(attemptId, (a) => {
    const prev = a.responses[qid] ?? blankResponse(qid);
    if (prev.checked && patch.answer !== undefined) return a; // learning mode: answer locked once checked
    const next = { ...prev, ...patch, savedAt: patch.answer !== undefined ? nowIso() : prev.savedAt };
    return { ...a, responses: { ...a.responses, [qid]: next } };
  });
}

export function setCurrent(attemptId: string, index: number) {
  patchAttempt(attemptId, (a) => {
    const i = Math.max(0, Math.min(a.questionIds.length - 1, index));
    const qid = a.questionIds[i];
    const r = a.responses[qid] ?? blankResponse(qid);
    return { ...a, current: i, responses: { ...a.responses, [qid]: { ...r, visited: true } } };
  });
}

/** Adds active time to the attempt clock and the current question. */
export function tick(attemptId: string, qid: string, seconds: number) {
  patchAttempt(attemptId, (a) => {
    const r = a.responses[qid] ?? blankResponse(qid);
    return {
      ...a,
      elapsedSec: a.elapsedSec + seconds,
      responses: { ...a.responses, [qid]: { ...r, timeSpentSec: r.timeSpentSec + seconds } },
    };
  });
}

/** Learning mode: lock the answer and record the outcome immediately. */
export function checkAnswer(attemptId: string, qid: string) {
  update((s) => {
    const a = s.attempts[attemptId];
    const q = catalog.question(qid);
    if (!a || !q || a.mode !== "learning" || a.status === "submitted") return s;
    const r = a.responses[qid] ?? blankResponse(qid);
    if (r.checked || !r.answer) return s;
    const { outcome } = judge(q, catalog.solution(qid), r.answer);
    let next: DemoState = {
      ...s,
      attempts: { ...s.attempts, [attemptId]: { ...a, updatedAt: nowIso(), responses: { ...a.responses, [qid]: { ...r, checked: true } } } },
    };
    next = recordOutcome(next, attemptId, q.subject, qid, outcome, r.timeSpentSec);
    return next;
  });
}

function recordOutcome(s: DemoState, attemptId: string, subject: SubjectId, qid: string, outcome: string, seconds: number): DemoState {
  let bonus = 0;
  const mistakes = { ...s.mistakes };
  const existing = mistakes[qid];
  if (outcome === "incorrect" || outcome === "partial") {
    mistakes[qid] = existing
      ? { ...existing, status: "open", resolvedAt: null, attemptId, at: nowIso(), reattempts: existing.reattempts + 1 }
      : { questionId: qid, attemptId, at: nowIso(), category: null, status: "open", resolvedAt: null, reattempts: 0 };
  } else if (outcome === "correct" && existing && existing.status === "open") {
    mistakes[qid] = { ...existing, status: "resolved", resolvedAt: nowIso(), reattempts: existing.reattempts + 1 };
    bonus = XP.mistakeCleared;
  }
  return addActivity({ ...s, mistakes }, [{ subject, outcome, seconds }], bonus);
}

export function submitAttempt(attemptId: string) {
  update((s) => {
    const a = s.attempts[attemptId];
    if (!a || a.status === "submitted") return s;
    let next: DemoState = { ...s, attempts: { ...s.attempts, [attemptId]: { ...a, status: "submitted", submittedAt: nowIso(), updatedAt: nowIso() } } };
    if (a.mode === "learning") {
      // Outcomes were already recorded when each answer was checked.
      return next;
    }
    let answered = 0;
    for (const qid of a.questionIds) {
      const q = catalog.question(qid);
      const r = a.responses[qid];
      if (!q || !r?.answer) continue;
      const { outcome } = judge(q, catalog.solution(qid), r.answer);
      if (outcome === "unattempted") continue;
      answered++;
      next = recordOutcome(next, attemptId, q.subject, qid, outcome, r.timeSpentSec);
    }
    if (a.kind === "paper" && answered >= a.questionIds.length / 2) next = addActivity(next, [], XP.paperBonus);
    return next;
  });
}

export function discardAttempt(attemptId: string) {
  update((s) => {
    const a = s.attempts[attemptId];
    if (!a || a.status === "submitted") return s;
    const attempts = { ...s.attempts };
    delete attempts[attemptId];
    return { ...s, attempts };
  });
}

/* ---------- lists ---------- */

export function toggleBookmark(qid: string) {
  update((s) => {
    const b = { ...s.bookmarks };
    if (b[qid]) delete b[qid];
    else b[qid] = nowIso();
    return { ...s, bookmarks: b };
  });
}

export function toggleReview(qid: string) {
  update((s) => {
    const r = { ...s.review };
    if (r[qid]) delete r[qid];
    else r[qid] = nowIso();
    return { ...s, review: r };
  });
}

export function setMistakeCategory(qid: string, category: MistakeCategory | null) {
  update((s) => (s.mistakes[qid] ? { ...s, mistakes: { ...s.mistakes, [qid]: { ...s.mistakes[qid], category } } } : s));
}

export function removeMistake(qid: string) {
  update((s) => {
    const m = { ...s.mistakes };
    delete m[qid];
    return { ...s, mistakes: m };
  });
}

/* ---------- selectors ---------- */

export function attemptsList(s: DemoState) {
  return Object.values(s.attempts).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function inProgress(s: DemoState) {
  return attemptsList(s).filter((a) => a.status === "in_progress");
}

export type { ResponseValue };
export { dayKey };

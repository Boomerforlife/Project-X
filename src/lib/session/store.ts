"use client";

/**
 * API-mode student store (docs/INTEGRATION_PLAN.md 2.4, 1.7, 1.8).
 *
 * Exposes the same hooks/actions as the local demo store so screens barely
 * change. The state it publishes is shaped like `DemoState`, but every number
 * in it comes from the server: attempts are graded by the API, streaks and
 * progress are server-owned, and `tabby-demo-v2` is never written.
 *
 * Local-only by design (labelled in the UI): test-mode drafts
 * (`projectx-drafts-v1:*`), review list and mistake categories
 * (`projectx-prefs-v1:*`), and flagged demo paper attempts.
 */
import { useSyncExternalStore } from "react";
import type { ExamId, Response, SubjectId } from "@/contracts";
import { toast } from "@/components/ui/Toast";
import { examFromApi, examToApi, subjectFromApi } from "@/lib/api/adapters/ids";
import { setTokenProvider } from "@/lib/api/auth";
import { flags } from "@/lib/api/env";
import { ApiError, isApiError } from "@/lib/api/errors";
import { authSignOut, getAccessToken, onAuthChange } from "@/lib/auth/session";
import { catalog } from "@/lib/data/catalog";
import { dayKey, daysAgo } from "@/lib/demo/dates";
import { EXAMS } from "@/lib/exams";
import type { Attempt, AttemptSection, DemoState, DemoUser, MistakeCategory, MistakeRecord } from "@/lib/demo/types";
import { api, type AttemptResultX, type MeX, type SessionDetailX, type SessionListItemX } from "./client";
import { fromAnswerResponse, toAnswerResponse, toQuestion, toSolution } from "./convert";
import { deleteDraft, newClientId, readDraft, writeDraft, type Draft } from "./drafts";
import { DEFAULT_PREFS, readPrefs, writePrefs, type Prefs } from "./prefs";
import { registry } from "./registry";

/* ------------------------------------------------------------------ state */

const EMPTY: DemoState = { v: 2, user: null, attempts: {}, bookmarks: {}, review: {}, mistakes: {}, activity: {} };

export type AuthStatus = "loading" | "ready" | "signedOut" | "error";
export type SubmitState = { phase: "running" | "paused" | "done"; done: number; total: number; message?: string };

let state: DemoState = EMPTY;
let snapshot: DemoState | null = null; // null until the first auth/user load finishes
let status: AuthStatus = "loading";
let statusMessage = "";
let userId: string | null = null;
let prefs: Prefs = DEFAULT_PREFS;
let initStarted = false;
const submits = new Map<string, SubmitState>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let uiVersion = 0;

function emit() {
  uiVersion++;
  snapshot = status === "loading" ? null : { ...state };
  listeners.forEach((l) => l());
}
function set(next: DemoState) {
  state = next;
  emit();
}
function patchState(fn: (s: DemoState) => DemoState) {
  set(fn(state));
}

function subscribe(l: () => void) {
  listeners.add(l);
  ensureInit();
  const off = registry.subscribe(emit);
  return () => {
    listeners.delete(l);
    off();
  };
}

/** `null` until hydrated on the client (render a skeleton). */
export function useDemo(): DemoState | null {
  return useSyncExternalStore(subscribe, () => snapshot, () => null);
}
export function getDemoState() {
  return state;
}
export function useAuthStatus(): { status: AuthStatus; message: string } {
  const v = useSyncExternalStore(subscribe, () => uiVersion, () => 0);
  void v;
  return { status, message: statusMessage };
}
export function useSubmitState(attemptId: string): SubmitState | null {
  useSyncExternalStore(subscribe, () => uiVersion, () => 0);
  return submits.get(attemptId) ?? null;
}
export function usePending(attemptId: string, qid: string): boolean {
  useSyncExternalStore(subscribe, () => uiVersion, () => 0);
  return pending.has(`${attemptId}:${qid}`);
}
export function demoSaveFailed() {
  return draftSaveFailed;
}
let draftSaveFailed = false;

/* ------------------------------------------------------------------ init */

function ensureInit() {
  if (initStarted || typeof window === "undefined") return;
  initStarted = true;
  setTokenProvider(getAccessToken);
  onAuthChange(() => void refreshAll());
  void refreshAll();
}

export function retryLoad() {
  status = "loading";
  emit();
  void refreshAll();
}

function signedOut() {
  userId = null;
  prefs = DEFAULT_PREFS;
  registry.clear();
  submits.clear();
  pending.clear();
  status = "signedOut";
  statusMessage = "";
  state = EMPTY;
  emit();
}

let refreshing: Promise<void> | null = null;
function refreshAll(): Promise<void> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh() {
  const token = await getAccessToken();
  if (!token) return signedOut();
  try {
    const [me] = await Promise.all([api.me(), registry.loadTaxonomy()]);
    userId = me.id;
    prefs = readPrefs(me.id);
    for (const stub of Object.values(prefs.reviewStubs)) if (!registry.getQuestion(stub.id)) registry.putQuestion(stub);
    const user = toUser(me, prefs);
    status = "ready";
    statusMessage = "";
    set({ ...EMPTY, user, review: prefs.review, attempts: loadLocalPapers(me.id) });
    if (user.onboarded) await loadPrivate(user.exam);
  } catch (e) {
    if (isApiError(e) && e.status === 401) return signedOut();
    status = "error";
    statusMessage = isApiError(e) && e.code === "NETWORK" ? "We couldn't reach the server." : "Something went wrong loading your account.";
    emit();
  }
}

export function toUser(me: MeX, p: Prefs): DemoUser {
  const exam = me.target_exam ? examFromApi(me.target_exam.slug) : null;
  return {
    name: me.display_name?.trim() || me.email?.split("@")[0] || "Student",
    exam: exam ?? "jee-main",
    classLevel: me.class_level ?? "12",
    dailyGoal: me.daily_goal_attempts,
    // Before the backend returns `onboarding_completed`, a chosen target exam is the best signal.
    onboarded: me.onboarding_completed ?? Boolean(me.target_exam),
    joinedAt: me.created_at,
    showOnLeaderboard: p.showOnLeaderboard,
    cosmetic: p.cosmetic,
  };
}

/* ------------------------------------------------------- derived server data */

const xpOf = (answered: number, correct: number) => 10 * correct + 2 * (answered - correct);

function activityFrom(rows: { date: string; attempts: number; correct: number; total_time_ms: number }[]): DemoState["activity"] {
  const out: DemoState["activity"] = {};
  for (const r of rows) out[r.date] = { answered: r.attempts, correct: r.correct, xp: xpOf(r.attempts, r.correct), seconds: Math.round(r.total_time_ms / 1000), subjects: {} };
  return out;
}

function subjectOf(segment: string, name?: string): SubjectId | null {
  return subjectFromApi(segment, name)?.subject ?? null;
}

async function loadPrivate(exam: ExamId) {
  const from = dayKey(daysAgo(125));
  const [progress, streak, activity, bookmarks, mistakes, sessions] = await Promise.allSettled([
    api.progress(examToApi(exam)),
    api.streak(),
    api.activity(from, dayKey()),
    api.bookmarks(),
    api.mistakes(),
    api.listSessions(),
  ]);
  const all = [progress, streak, activity, bookmarks, mistakes];
  for (const r of all) if (r.status === "rejected" && isApiError(r.reason) && r.reason.status === 401) return signedOut();
  if (all.every((r) => r.status === "rejected")) {
    status = "error";
    statusMessage = "We couldn't reach the server.";
    emit();
    return;
  }

  patchState((s) => {
    const next: DemoState = { ...s, server: s.server ?? { streak: null, chapters: [], subjects: [], weak: [] } };
    if (streak.status === "fulfilled") {
      const x = streak.value;
      next.server = { ...next.server!, streak: { current: x.current_streak, longest: x.longest_streak, todayAttempts: x.today_attempts, goalMetToday: x.goal_met_today } };
    }
    if (progress.status === "fulfilled") {
      const p = progress.value;
      const chapters: NonNullable<DemoState["server"]>["chapters"] = [];
      for (const c of p.chapters) {
        const hit = registry.chapterLookup(c.chapter.slug);
        if (hit) chapters.push({ subject: hit.subject, chapter: hit.chapter, answered: c.attempts, correct: c.correct });
      }
      const subjects: NonNullable<DemoState["server"]>["subjects"] = [];
      for (const x of p.subjects) {
        const sub = subjectOf(x.subject.segment, x.subject.name);
        if (!sub) continue;
        const prev = subjects.find((y) => y.subject === sub);
        if (prev) {
          prev.answered += x.attempts;
          prev.correct += x.correct;
        } else subjects.push({ subject: sub, answered: x.attempts, correct: x.correct });
      }
      const weak: NonNullable<DemoState["server"]>["weak"] = [];
      for (const w of p.weak_areas) {
        const hit = registry.chapterLookup(w.chapter.slug);
        if (hit) weak.push({ subject: hit.subject, chapter: hit.chapter, answered: w.attempts, accuracy: w.accuracy });
      }
      next.server = { ...next.server!, chapters, subjects, weak };
    }
    if (activity.status === "fulfilled") next.activity = activityFrom(activity.value);
    if (bookmarks.status === "fulfilled") {
      next.bookmarks = Object.fromEntries(bookmarks.value.map((b) => (registry.stubFromSummary(b.question), [b.question.id, b.created_at])));
    }
    if (mistakes.status === "fulfilled") next.mistakes = mistakesFrom(mistakes.value);
    return next;
  });
  registry.touch();

  if (sessions.status === "fulfilled") void hydrateSessions(sessions.value);
}

function mistakesFrom(items: { question: Parameters<typeof registry.stubFromSummary>[0]; wrong_count: number; last_wrong_at: string; resolved_at: string | null }[]): Record<string, MistakeRecord> {
  const out: Record<string, MistakeRecord> = {};
  for (const m of items) {
    registry.stubFromSummary(m.question);
    out[m.question.id] = {
      questionId: m.question.id,
      attemptId: "",
      at: m.last_wrong_at,
      category: prefs.categories[m.question.id] ?? null,
      status: m.resolved_at ? "resolved" : "open",
      resolvedAt: m.resolved_at,
      reattempts: Math.max(0, m.wrong_count - 1),
    };
  }
  return out;
}

let derivedTimer: number | undefined;
/** Debounced refresh of server-derived numbers after attempts. */
function refreshDerivedSoon(delay = 1200) {
  if (typeof window === "undefined") return;
  window.clearTimeout(derivedTimer);
  derivedTimer = window.setTimeout(() => {
    const exam = state.user?.exam;
    if (exam && state.user?.onboarded) void loadPrivateDerived(exam);
  }, delay);
}
async function loadPrivateDerived(exam: ExamId) {
  const sessions = state.attempts;
  await loadPrivate(exam);
  void sessions;
}

/* ----------------------------------------------------------------- sessions */

const SESSION_MODE = { chapter: "CHAPTER", subject: "SUBJECT", quick: "MIXED", mistakes: "MISTAKES", bookmarks: "BOOKMARKS" } as const;

function sectionsFor(exam: ExamId, questionIds: string[]): AttemptSection[] {
  const by = new Map<SubjectId, string[]>();
  for (const id of questionIds) {
    const q = registry.getQuestion(id);
    if (q) by.set(q.subject, [...(by.get(q.subject) ?? []), id]);
  }
  return [...by.entries()].map(([subject, ids]) => ({
    id: subject,
    name: catalog.subject(subject)?.name ?? subject,
    subject,
    questionIds: ids,
    // Display-only: the server's score is what results show (scoreAttempt prefers it).
    marking: { single_correct: { correct: 4, incorrect: -1, unattempted: 0, partial: false }, numerical: { correct: 4, incorrect: -1, unattempted: 0, partial: false }, multiple_correct: { correct: 4, incorrect: -2, unattempted: 0, partial: false }, ...EXAMS[exam].marking },
  }));
}

function titleFor(mode: string, qs: { subject: SubjectId; chapter: string }[]): string {
  if (mode === "MISTAKES") return "Mistake revision";
  if (mode === "BOOKMARKS") return "Bookmarked questions";
  const first = qs[0];
  if (first && qs.every((q) => q.subject === first.subject && q.chapter === first.chapter)) {
    const c = catalog.chapter(first.subject, first.chapter);
    if (c) return c.name;
  }
  if (first && qs.every((q) => q.subject === first.subject)) return `${catalog.subject(first.subject)?.name ?? first.subject} · quick practice`;
  return "Quick practice · mixed";
}

const blank = (questionId: string): Response => ({ questionId, answer: null, checked: false, markedForReview: false, visited: false, timeSpentSec: 0, savedAt: null });

type SessionLike = SessionDetailX["session"] | SessionListItemX;

function buildAttempt(session: SessionLike, items: SessionDetailX["items"]): Attempt {
  const questions = items.map((i) => toQuestion(i.question));
  registry.putQuestions(questions);
  const exam = examFromApi(items[0]?.question.exam.slug ?? "") ?? state.user?.exam ?? "jee-main";
  const draft = userId ? readDraft(userId, session.id) : null;
  const completed = session.status !== "ACTIVE";
  const mode = session.ui_mode ?? draft?.mode ?? "learning";
  const responses: Record<string, Response> = {};
  let firstOpen = -1;
  items.forEach((item, i) => {
    const q = questions[i]!;
    const d = draft?.responses[q.id];
    const r = blank(q.id);
    if (item.attempt) {
      const at = item.attempt;
      registry.putOutcome(`${session.id}:${q.id}`, { isCorrect: at.is_correct, score: at.score });
      registry.putSolution(toSolution(q, at.solution));
      responses[q.id] = {
        ...r,
        answer: at.response ? fromAnswerResponse(q, at.response) : (d?.answer ?? null),
        checked: true,
        visited: true,
        markedForReview: d?.markedForReview ?? false,
        timeSpentSec: at.time_spent_ms != null ? Math.round(at.time_spent_ms / 1000) : (d?.timeSpentSec ?? 0),
        savedAt: at.submitted_at,
      };
    } else {
      if (firstOpen < 0) firstOpen = i;
      responses[q.id] = { ...r, answer: d?.answer ?? null, markedForReview: d?.markedForReview ?? false, visited: d?.visited ?? false, timeSpentSec: d?.timeSpentSec ?? 0, savedAt: d?.answer ? (d.savedAt ?? null) : null };
    }
  });
  const ids = questions.map((q) => q.id);
  const started = session.started_at;
  const listed = session as SessionListItemX;
  return {
    id: session.id,
    exam,
    mode,
    kind: "practice",
    title: draft?.title ?? titleFor(session.mode, questions),
    scope: { source: scopeFromMode(session.mode) },
    questionIds: ids,
    sections: sectionsFor(exam, ids),
    durationSec: session.time_limit_sec ?? draft?.durationSec ?? null,
    startedAt: started,
    updatedAt: listed.last_activity_at ?? draft?.savedAt ?? started,
    submittedAt: completed ? ((session as SessionDetailX["session"]).completed_at ?? listed.completed_at ?? started) : null,
    status: completed ? "submitted" : "in_progress",
    current: Math.min(ids.length - 1, Math.max(0, draft?.current ?? (firstOpen < 0 ? 0 : firstOpen))),
    elapsedSec: draft?.elapsedSec ?? 0,
    responses,
  };
}

function scopeFromMode(mode: string): NonNullable<Attempt["scope"]>["source"] {
  return mode === "CHAPTER" ? "chapter" : mode === "SUBJECT" ? "subject" : mode === "MISTAKES" ? "mistakes" : mode === "BOOKMARKS" ? "bookmarks" : "quick";
}

/** Load one session (items + attempts) into state. Server wins over any local draft. */
export async function loadSession(id: string): Promise<Attempt | null> {
  try {
    const d = await api.getSession(id);
    if (d.session.status === "ABANDONED") return null;
    const a = buildAttempt(d.session, d.items);
    patchState((s) => ({ ...s, attempts: { ...s.attempts, [id]: a } }));
    return a;
  } catch (e) {
    handleError(e, "load");
    return null;
  }
}

async function hydrateSessions(list: SessionListItemX[]) {
  const active = list.filter((s) => s.status === "ACTIVE").slice(0, 3);
  const done = list.filter((s) => s.status === "COMPLETED").slice(0, 5);
  await Promise.allSettled([...active, ...done].map((s) => (state.attempts[s.id] ? Promise.resolve(null) : loadSession(s.id))));
}

/** On-demand load used by the session and results screens (deep link / reload / second device). */
export async function ensureAttempt(id: string): Promise<Attempt | null> {
  if (state.attempts[id]) return state.attempts[id]!;
  if (id.startsWith("single_") || id.startsWith("att_")) return null;
  return loadSession(id);
}

export class NoQuestionsError extends Error {
  constructor() {
    super("No eligible questions");
    this.name = "NoQuestionsError";
  }
}

export type StartOpts = {
  exam: ExamId;
  mode: "learning" | "test";
  title: string;
  questionIds: string[];
  scope?: Attempt["scope"];
  durationSec?: number | null;
  /** API mode: how many questions the server should pick (1..50, test mode <= 20). */
  count?: number;
  difficulty?: "easy" | "medium" | "hard";
  /** API mode: include questions already solved (default false). */
  includeSolved?: boolean;
};

export async function startPractice(opts: StartOpts): Promise<string> {
  const src = opts.scope?.source ?? "quick";
  if (src === "single") return startSingle(opts);
  if (src === "review") throw new Error("The review list can't start a session yet.");
  const exam = opts.exam;
  const body: Parameters<typeof api.createSession>[0] = {
    client_request_id: newClientId(),
    mode: SESSION_MODE[src],
    exam: examToApi(exam),
    size: Math.max(1, Math.min(opts.mode === "test" ? 20 : 50, opts.count ?? (opts.questionIds.length || 10))),
    filters: {
      ...(opts.difficulty ? { difficulty: [opts.difficulty.toUpperCase() as "EASY" | "MEDIUM" | "HARD"] } : {}),
      exclude_correct: src === "bookmarks" || src === "mistakes" ? false : !opts.includeSolved,
    },
    ui_mode: opts.mode,
    ...(opts.durationSec ? { time_limit_sec: Math.max(60, Math.round(opts.durationSec)) } : {}),
  };
  if (opts.scope?.subject) {
    const sub = registry.apiSubject(exam, opts.scope.subject);
    if (sub) body.subject = sub.apiSlug;
  }
  if (opts.scope?.chapter && opts.scope.subject) {
    const ch = registry.apiChapter(exam, opts.scope.subject, opts.scope.chapter);
    if (ch) {
      body.chapter = ch.apiSlug;
      body.subject = ch.subjectApiSlug;
    }
  }
  try {
    const created = await api.createSession(body);
    const a = buildAttempt(
      { ...created.session, completed_at: null },
      created.questions.map((question) => ({ question, attempt: null })),
    );
    const attempt: Attempt = { ...a, mode: opts.mode, title: opts.title || a.title, durationSec: opts.durationSec ?? a.durationSec, scope: opts.scope ?? a.scope, startedAt: created.session.started_at };
    if (userId) writeDraft(userId, attempt.id, { v: 1, current: 0, elapsedSec: 0, savedAt: new Date().toISOString(), responses: {}, mode: opts.mode, durationSec: attempt.durationSec, title: attempt.title });
    patchState((s) => ({ ...s, attempts: { ...s.attempts, [attempt.id]: attempt } }));
    return attempt.id;
  } catch (e) {
    if (isApiError(e) && e.status === 422 && (e.details as { reason?: string } | undefined)?.reason === "NO_QUESTIONS") throw new NoQuestionsError();
    handleError(e, "start");
    throw e;
  }
}

/** One question, no server session: attempts are posted without `session_id`. */
function startSingle(opts: StartOpts): string {
  const qid = opts.questionIds[0];
  const q = qid ? registry.getQuestion(qid) : null;
  if (!q || !qid) throw new Error("Question not loaded");
  const id = `single_${qid}_${Date.now().toString(36)}`;
  const t = new Date().toISOString();
  const a: Attempt = {
    id,
    exam: opts.exam,
    mode: "learning",
    kind: "practice",
    title: "Single question",
    scope: { source: "single" },
    questionIds: [qid],
    sections: sectionsFor(opts.exam, [qid]),
    durationSec: null,
    startedAt: t,
    updatedAt: t,
    submittedAt: null,
    status: "in_progress",
    current: 0,
    elapsedSec: 0,
    responses: { [qid]: blank(qid) },
  };
  patchState((s) => ({ ...s, attempts: { ...s.attempts, [id]: a } }));
  return id;
}

/** Public question page -> practice: load the question (no solution is kept) and start a single attempt. */
export async function startSingleBySlug(slug: string, exam: ExamId): Promise<string> {
  const { pub } = await import("./client");
  const { toQuestionFromPublic } = await import("./convert");
  const pq = await pub.question(slug);
  const q = toQuestionFromPublic(pq);
  registry.putQuestions([q]); // deliberately not putSolution: the answer is revealed only via an attempt
  return startSingle({ exam: q.exams[0] ?? exam, mode: "learning", title: "Single question", questionIds: [q.id], scope: { source: "single" } });
}

/* ------------------------------------------------------- demo papers (flagged) */

const papersKey = (uid: string) => `projectx-demo-papers-v1:${uid}`;
function loadLocalPapers(uid: string): Record<string, Attempt> {
  if (flags.papers !== "demo") return {};
  try {
    const raw = localStorage.getItem(papersKey(uid));
    return raw ? (JSON.parse(raw) as Record<string, Attempt>) : {};
  } catch {
    return {};
  }
}
function saveLocalPapers() {
  if (!userId || flags.papers !== "demo") return;
  try {
    localStorage.setItem(papersKey(userId), JSON.stringify(Object.fromEntries(Object.entries(state.attempts).filter(([, a]) => a.local))));
  } catch {
    /* demo data is best effort */
  }
}

export async function startPaper(paperId: string, mode: "cbt" | "test" | "learning", retryOf?: string): Promise<string> {
  if (flags.papers !== "demo") throw new Error("Papers are not available yet.");
  const p = catalog.paper(paperId);
  if (!p) throw new Error(`Unknown paper ${paperId}`);
  const id = `att_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const t = new Date().toISOString();
  const questionIds = p.sections.flatMap((s) => s.questionIds);
  const a: Attempt = {
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
    responses: Object.fromEntries(questionIds.map((q) => [q, blank(q)])),
    local: true,
  };
  patchState((s) => ({ ...s, attempts: { ...s.attempts, [id]: a } }));
  saveLocalPapers();
  return id;
}

/* --------------------------------------------------------------- local edits */

const isLocal = (a: Attempt) => Boolean(a.local) || a.id.startsWith("single_");
const nowIso = () => new Date().toISOString();

function persistDraft(a: Attempt) {
  if (a.local) return saveLocalPapers();
  if (!userId || a.id.startsWith("single_")) return;
  const prev = readDraft(userId, a.id);
  const responses: Draft["responses"] = {};
  for (const [qid, r] of Object.entries(a.responses)) {
    responses[qid] = {
      answer: r.answer,
      markedForReview: r.markedForReview,
      visited: r.visited,
      timeSpentSec: r.timeSpentSec,
      savedAt: r.savedAt ?? undefined,
      clientAttemptId: prev?.responses[qid]?.clientAttemptId,
    };
  }
  draftSaveFailed = !writeDraft(userId, a.id, { v: 1, current: a.current, elapsedSec: a.elapsedSec, savedAt: nowIso(), responses, mode: a.mode === "cbt" ? "test" : a.mode, durationSec: a.durationSec, title: a.title });
}

function patchAttempt(id: string, fn: (a: Attempt) => Attempt) {
  const a = state.attempts[id];
  if (!a || a.status === "submitted") return;
  const next = { ...fn(a), updatedAt: nowIso() };
  set({ ...state, attempts: { ...state.attempts, [id]: next } });
  persistDraft(next);
}

export function setResponse(attemptId: string, qid: string, patch: Partial<Response>) {
  patchAttempt(attemptId, (a) => {
    const prev = a.responses[qid] ?? blank(qid);
    if (prev.checked && patch.answer !== undefined) return a; // locked once the server has the answer
    const next = { ...prev, ...patch, savedAt: patch.answer !== undefined ? nowIso() : prev.savedAt };
    return { ...a, responses: { ...a.responses, [qid]: next } };
  });
}

export function setCurrent(attemptId: string, index: number) {
  patchAttempt(attemptId, (a) => {
    const i = Math.max(0, Math.min(a.questionIds.length - 1, index));
    const qid = a.questionIds[i]!;
    const r = a.responses[qid] ?? blank(qid);
    return { ...a, current: i, responses: { ...a.responses, [qid]: { ...r, visited: true } } };
  });
}

export function tick(attemptId: string, qid: string, seconds: number) {
  patchAttempt(attemptId, (a) => {
    const r = a.responses[qid] ?? blank(qid);
    return { ...a, elapsedSec: a.elapsedSec + seconds, responses: { ...a.responses, [qid]: { ...r, timeSpentSec: r.timeSpentSec + seconds } } };
  });
}

/* ---------------------------------------------------------- checking / submit */

function reserveClientId(a: Attempt, qid: string): string {
  if (!userId || a.local) return newClientId();
  const d = readDraft(userId, a.id) ?? { v: 1 as const, current: a.current, elapsedSec: a.elapsedSec, savedAt: nowIso(), responses: {} };
  const cur = d.responses[qid] ?? { answer: a.responses[qid]?.answer ?? null, markedForReview: false, visited: true, timeSpentSec: 0 };
  const id = cur.clientAttemptId ?? newClientId();
  // Written BEFORE the request so a retry after a network failure is idempotent.
  d.responses[qid] = { ...cur, clientAttemptId: id };
  writeDraft(userId, a.id, d);
  return id;
}

function applyResult(a: Attempt, qid: string, res: AttemptResultX) {
  const q = registry.getQuestion(qid);
  if (q) registry.putSolution(toSolution(q, res.solution));
  registry.putOutcome(`${a.id}:${qid}`, { isCorrect: res.is_correct, score: res.score });
  const cur = state.attempts[a.id];
  if (!cur) return;
  const r = cur.responses[qid] ?? blank(qid);
  set({
    ...state,
    attempts: {
      ...state.attempts,
      [a.id]: { ...cur, updatedAt: nowIso(), responses: { ...cur.responses, [qid]: { ...r, checked: true, savedAt: res.submitted_at } } },
    },
  });
  registry.touch();
  refreshDerivedSoon();
}

async function postOne(a: Attempt, qid: string): Promise<AttemptResultX | "already"> {
  const q = registry.getQuestion(qid);
  const r = a.responses[qid];
  if (!q || !r?.answer) throw new Error("nothing to send");
  const response = toAnswerResponse(q, r.answer);
  if (!response) throw new ApiError(400, "VALIDATION_ERROR", "Invalid answer");
  const clientAttemptId = reserveClientId(a, qid);
  try {
    return await api.submitAttempt({
      client_attempt_id: clientAttemptId,
      question_id: qid,
      ...(a.id.startsWith("single_") ? {} : { session_id: a.id }),
      response,
      time_spent_ms: Math.max(0, Math.min(10_800_000, Math.round(r.timeSpentSec * 1000))),
    });
  } catch (e) {
    if (isApiError(e) && e.code === "ALREADY_ATTEMPTED") return "already";
    throw e;
  }
}

/** Learning mode "Check": store the attempt on the server, then show what it returns. */
export async function checkAnswer(attemptId: string, qid: string): Promise<void> {
  const a = state.attempts[attemptId];
  const r = a?.responses[qid];
  const key = `${attemptId}:${qid}`;
  if (!a || a.mode !== "learning" || a.status === "submitted" || !r?.answer || r.checked || pending.has(key)) return;
  const q = registry.getQuestion(qid);
  if (q && !toAnswerResponse(q, r.answer)) {
    toast("Enter a number such as 12.5 before checking", { icon: "alert", tone: "warn" });
    return;
  }
  pending.add(key);
  emit();
  try {
    const res = await postOne(a, qid);
    if (res === "already") {
      if (!a.id.startsWith("single_")) await loadSession(a.id);
      toast("This question was already answered", { icon: "info" });
    } else applyResult(a, qid, res);
  } catch (e) {
    handleError(e, "check");
  } finally {
    pending.delete(key);
    emit();
  }
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/**
 * Finish a session. Test mode posts every answered, unsent question one by one
 * (each with a pre-reserved `client_attempt_id`), then completes the session.
 * Returns true when finished; false when paused (call again to retry).
 */
export async function submitAttempt(attemptId: string): Promise<boolean> {
  const a0 = state.attempts[attemptId];
  if (!a0 || a0.status === "submitted") return true;
  if (isLocal(a0)) {
    patchState((s) => ({ ...s, attempts: { ...s.attempts, [attemptId]: { ...a0, status: "submitted", submittedAt: nowIso(), updatedAt: nowIso() } } }));
    saveLocalPapers();
    return true;
  }
  const queue = a0.questionIds.filter((qid) => a0.responses[qid]?.answer && !a0.responses[qid]!.checked && registry.getQuestion(qid));
  const total = queue.length;
  let done = 0;
  const setSubmit = (s: SubmitState | null) => {
    if (s) submits.set(attemptId, s);
    else submits.delete(attemptId);
    emit();
  };
  setSubmit({ phase: "running", done, total });
  let needReload = false;
  for (const qid of queue) {
    for (let tries = 0; ; tries++) {
      const a = state.attempts[attemptId]!;
      try {
        const res = await postOne(a, qid);
        if (res === "already") needReload = true;
        else applyResult(a, qid, res);
        break;
      } catch (e) {
        if (isApiError(e) && e.status === 429 && tries < 6) {
          const wait = Math.min(e.retryAfterSec ?? 5, 30);
          setSubmit({ phase: "running", done, total, message: `Slowing down for ${Math.ceil(wait)}s…` });
          await sleep(wait * 1000);
          continue;
        }
        if (isApiError(e) && e.status === 401) {
          setSubmit(null);
          handleError(e, "submit");
          return false;
        }
        if (isApiError(e) && e.code === "VALIDATION_ERROR" && e.status === 400) break; // unsendable answer: skip it
        setSubmit({ phase: "paused", done, total, message: isApiError(e) && e.code === "NETWORK" ? "Connection lost. Your answers are saved on this device." : "The server didn't accept that yet." });
        return false;
      }
    }
    done++;
    setSubmit({ phase: "running", done, total });
  }
  try {
    if (!attemptId.startsWith("single_")) await api.completeSession(attemptId);
  } catch (e) {
    if (!(isApiError(e) && e.code === "INVALID_STATE_TRANSITION")) {
      setSubmit({ phase: "paused", done, total, message: "Couldn't finish the session yet. Retry to complete it." });
      return false;
    }
  }
  if (needReload && !attemptId.startsWith("single_")) await loadSession(attemptId);
  patchState((s) => {
    const a = s.attempts[attemptId];
    return a ? { ...s, attempts: { ...s.attempts, [attemptId]: { ...a, status: "submitted", submittedAt: nowIso(), updatedAt: nowIso() } } } : s;
  });
  if (userId) deleteDraft(userId, attemptId);
  setSubmit({ phase: "done", done, total });
  refreshDerivedSoon(0);
  return true;
}

export async function discardAttempt(attemptId: string): Promise<void> {
  const a = state.attempts[attemptId];
  if (!a || a.status === "submitted") return;
  if (!isLocal(a)) {
    try {
      await api.abandonSession(attemptId);
    } catch (e) {
      if (!(isApiError(e) && (e.code === "NOT_FOUND" || e.code === "INVALID_STATE_TRANSITION"))) {
        handleError(e, "discard");
        return;
      }
    }
  }
  patchState((s) => {
    const attempts = { ...s.attempts };
    delete attempts[attemptId];
    return { ...s, attempts };
  });
  if (userId) deleteDraft(userId, attemptId);
  saveLocalPapers();
}

/* ------------------------------------------------------------------ lists */

export async function toggleBookmark(qid: string): Promise<void> {
  const had = Boolean(state.bookmarks[qid]);
  const prevMap = state.bookmarks;
  const next = { ...prevMap };
  if (had) delete next[qid];
  else next[qid] = nowIso();
  patchState((s) => ({ ...s, bookmarks: next }));
  try {
    if (had) await api.removeBookmark(qid);
    else await api.addBookmark(qid);
  } catch (e) {
    patchState((s) => ({ ...s, bookmarks: prevMap })); // rollback
    toast(had ? "Couldn't remove the bookmark" : "Couldn't save the bookmark", { icon: "alert", tone: "warn" });
    handleError(e, "bookmark", true);
  }
}

function savePrefs(next: Prefs) {
  prefs = next;
  if (userId) writePrefs(userId, next);
}

export function toggleReview(qid: string) {
  const review = { ...state.review };
  const reviewStubs = { ...prefs.reviewStubs };
  if (review[qid]) {
    delete review[qid];
    delete reviewStubs[qid];
  } else {
    review[qid] = nowIso();
    const q = registry.getQuestion(qid);
    if (q) reviewStubs[qid] = { ...q, blocks: undefined, options: [], assets: [], stem: q.stem.slice(0, 200) };
  }
  savePrefs({ ...prefs, review, reviewStubs });
  patchState((s) => ({ ...s, review }));
}

export function setMistakeCategory(qid: string, category: MistakeCategory | null) {
  const categories = { ...prefs.categories };
  if (category) categories[qid] = category;
  else delete categories[qid];
  savePrefs({ ...prefs, categories });
  patchState((s) => (s.mistakes[qid] ? { ...s, mistakes: { ...s.mistakes, [qid]: { ...s.mistakes[qid]!, category } } } : s));
}

export async function removeMistake(qid: string): Promise<void> {
  const prev = state.mistakes;
  const m = { ...prev };
  delete m[qid];
  patchState((s) => ({ ...s, mistakes: m }));
  try {
    await api.dismissMistake(qid);
  } catch (e) {
    patchState((s) => ({ ...s, mistakes: prev }));
    handleError(e, "mistake", true);
  }
}

/* ------------------------------------------------------------------ account */

export async function updateUser(patch: Partial<DemoUser>): Promise<void> {
  if (!state.user) return;
  const prevUser = state.user;
  patchState((s) => (s.user ? { ...s, user: { ...s.user, ...patch } } : s));
  if (patch.showOnLeaderboard !== undefined || patch.cosmetic !== undefined) {
    savePrefs({ ...prefs, showOnLeaderboard: patch.showOnLeaderboard ?? prefs.showOnLeaderboard, cosmetic: patch.cosmetic === undefined ? prefs.cosmetic : patch.cosmetic });
  }
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.display_name = patch.name.trim().slice(0, 60) || null;
  if (patch.dailyGoal !== undefined) body.daily_goal_attempts = Math.max(1, Math.min(500, Math.round(patch.dailyGoal)));
  if (patch.exam !== undefined) body.target_exam = examToApi(patch.exam);
  if (patch.classLevel !== undefined) body.class_level = patch.classLevel;
  if (!Object.keys(body).length) return;
  try {
    await api.patchMe(body);
    if (patch.exam) {
      await api.putExamPreferences([{ exam: examToApi(patch.exam), is_primary: true }]);
      void loadPrivate(patch.exam);
    }
  } catch (e) {
    patchState((s) => ({ ...s, user: prevUser }));
    toast("Couldn't save that change. Try again.", { icon: "alert", tone: "warn" });
    handleError(e, "profile", true);
  }
}

export async function completeOnboarding(patch: Partial<DemoUser>): Promise<void> {
  if (!state.user) return;
  const user = { ...state.user, ...patch };
  const body: Record<string, unknown> = {
    target_exam: examToApi(user.exam),
    daily_goal_attempts: Math.max(1, Math.min(500, Math.round(user.dailyGoal))),
    class_level: user.classLevel,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
    onboarding_completed: true,
  };
  try {
    await api.patchMe(body);
    await api.putExamPreferences([{ exam: examToApi(user.exam), is_primary: true }]);
  } catch (e) {
    handleError(e, "onboarding");
    throw e;
  }
  patchState((s) => ({ ...s, user: { ...user, onboarded: true } }));
  void loadPrivate(user.exam);
}

export async function signOut(): Promise<void> {
  await authSignOut();
  signedOut();
}

/** Mock-mode entry point; API mode signs in through /login/. */
export function demoLogin() {
  /* intentionally a no-op in API mode */
}

export async function reportQuestion(questionId: string, reason: string, text: string): Promise<void> {
  const body = `[REPORT:${reason}] ${text}`.trim().slice(0, 4000);
  await api.postDoubt({ body, question_id: questionId });
}

/* ------------------------------------------------------------------ errors */

let lastToast = 0;
function handleError(e: unknown, what: string, quiet = false) {
  if (!isApiError(e)) return;
  if (e.status === 401) {
    void authSignOut().then(signedOut);
    return;
  }
  const now = Date.now();
  if (quiet || now - lastToast < 1500) return;
  lastToast = now;
  if (e.code === "ACCOUNT_REQUIRED") toast("Create an account to continue", { icon: "info", tone: "warn" });
  else if (e.status === 429) toast(`Too many requests. Try again in ${Math.ceil(e.retryAfterSec ?? 5)}s`, { icon: "clock", tone: "warn" });
  else if (e.code === "NETWORK") toast("You appear to be offline. Your work is saved on this device.", { icon: "alert", tone: "warn" });
  else if (what !== "load") toast("Something went wrong. Please try again.", { icon: "alert", tone: "warn" });
}

/* ---------------------------------------------------------------- selectors */

export function attemptsList(s: DemoState) {
  return Object.values(s.attempts).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function inProgress(s: DemoState) {
  return attemptsList(s).filter((a) => a.status === "in_progress");
}

export function pickQuestions(): string[] {
  // The server picks questions in API mode; kept for signature compatibility.
  return [];
}

export { dayKey };
export const XP = { correct: 10, partial: 5, incorrect: 2, paperBonus: 0, mistakeCleared: 0 } as const;

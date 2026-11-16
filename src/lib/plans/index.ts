"use client";

/**
 * Diagnostic + study plan, client side. API mode calls `/plans/*` (server runs @projectx/plans and enforces Plus). Mock mode
 * runs the same @projectx/plans algorithm in the browser on the fixture bank and this browser's demo attempts, so the whole
 * flow can be tried without a backend. The algorithm is never forked: both paths use the shared package.
 */
import {
  assembleDiagnostic,
  buildPlan,
  diagnosticReport,
  estimateMastery,
  PLAN_CONFIG,
  replan,
  type Band,
  type Candidate,
  type ChapterInfo,
  type Difficulty as PlanDifficulty,
  type Evidence,
  type PlanDay,
  type PlanItem,
} from "@projectx/plans";
import {
  CreateDiagnosticBody,
  DiagnosticCreatedSchema,
  DiagnosticReportSchema,
  PlanItemStartedSchema,
  StudyPlanSchema,
  type StudyPlan,
} from "@projectx/contracts";
import { z } from "zod";
import type { Difficulty, ExamId, SubjectId } from "@/contracts";
import { getToken } from "@/lib/api/auth";
import { ApiError, isApiError } from "@/lib/api/errors";
import { apiFetch } from "@/lib/api/http";
import { examToApi } from "@/lib/api/adapters/ids";
import { catalog } from "@/lib/data/catalog";
import { outcomeFor } from "@/lib/demo/scoring";
import { pickQuestions, startPractice } from "@/lib/demo/store";
import type { Attempt, DemoState } from "@/lib/demo/types";
import { mockFamiliesForPlans, mockOutcomes } from "@/lib/problems";
import { registry } from "@/lib/session/registry";
import { DATA_SOURCE } from "@/lib/site";

const API = DATA_SOURCE === "api";
const DAY_MS = 86_400_000;

export type Mix = Record<Difficulty, number>;
export type ChapterView = { subject: SubjectId; chapter: string; name: string; band: Band; correct: number; answered: number; slow: boolean };
export type ReportView = {
  attemptId: string;
  completed: boolean;
  actualMix: Mix;
  subjects: { subject: SubjectId; name: string; correct: number; answered: number; skipped: number }[];
  focus: ChapterView[];
  /** Null when the viewer isn't on Plus (server strips it). */
  chapters: ChapterView[] | null;
  plus: boolean;
};
export type ItemView = {
  key: string;
  kind: PlanItem["kind"];
  subject: SubjectId | null;
  chapter: string | null;
  chapterName: string | null;
  difficulty: Difficulty | null;
  size: number | null;
  problems: number[] | null;
  timeLimitSec: number | null;
  minutes: number;
  startedAt: string | null;
  completedAt: string | null;
};
export type DayView = { index: number; date: string; light: boolean; items: ItemView[] };
export type PlanView = { id: string; exam: ExamId; startsOn: string; days: number; dailyMinutes: number; todayIndex: number; diagnosticAttemptId: string; locked: boolean; plan: DayView[] };
export type Setup = { exam: ExamId; subjects: SubjectId[]; chapters: string[]; length: 15 | 30 | 45 };
export type DiagnosticMeta = { attemptId: string; requestedMix: Mix; actualMix: Mix; shortBy: number };

export class PlusRequiredError extends Error {
  constructor() {
    super("Tabby Plus required");
    this.name = "PlusRequiredError";
  }
}

const lower = (d: PlanDifficulty): Difficulty => d.toLowerCase() as Difficulty;
const upperMix = (m: { EASY: number; MEDIUM: number; HARD: number }): Mix => ({ easy: m.EASY, medium: m.MEDIUM, hard: m.HARD });
const chapterKey = (subject: string, chapter: string) => `${subject}/${chapter}`;
const splitKey = (k: string) => {
  const [subject, chapter] = k.split("/");
  return { subject: subject as SubjectId, chapter: chapter ?? "" };
};
export const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/* =================================================================== mock storage */

type MockState = {
  v: 1;
  exam: ExamId;
  setup: Setup;
  diagnostic: DiagnosticMeta;
  plan?: {
    id: string;
    startsOn: string;
    days: 7 | 14;
    dailyMinutes: number;
    seed: string;
    createdAt: string;
    planDays: PlanDay[];
    itemAttempts: Record<string, string>;
  };
};
const KEY = "projectx-plan-v1";
function readMock(): MockState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MockState) : null;
  } catch {
    return null;
  }
}
function writeMock(s: MockState | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* demo data is best effort */
  }
}
/** API mode: remember which diagnostic this browser started (a pointer only; the server holds the session). */
const LAST_DIAG = "projectx-last-diagnostic";
function rememberDiagnostic(meta: DiagnosticMeta) {
  try {
    localStorage.setItem(LAST_DIAG, JSON.stringify(meta));
  } catch {
    /* convenience only */
  }
}
function lastDiagnostic(): DiagnosticMeta | null {
  try {
    const raw = localStorage.getItem(LAST_DIAG);
    return raw ? (JSON.parse(raw) as DiagnosticMeta) : null;
  } catch {
    return null;
  }
}

/* =================================================================== mock data */

function candidates(s: DemoState, chapterKeys: Set<string>): Candidate[] {
  const outcomes = mockOutcomes(s);
  return mockFamiliesForPlans()
    .filter((f) => chapterKeys.has(chapterKey(f.questions[0]!.subject, f.questions[0]!.chapter)))
    .map((f) => {
      const q = f.questions[0]!;
      return {
        familyId: f.key,
        questionIds: f.questions.map((x) => x.id),
        chapterId: chapterKey(q.subject, q.chapter),
        subjectId: q.subject,
        difficulty: (q.difficulty ?? "medium").toUpperCase() as PlanDifficulty,
        tried: f.questions.some((x) => outcomes.has(x.id)),
      };
    });
}

function attemptEvidence(a: Attempt, source: Evidence["source"]): Evidence[] {
  const out: Evidence[] = [];
  for (const qid of a.questionIds) {
    const q = catalog.question(qid);
    const r = a.responses[qid];
    if (!q || !r) continue;
    const counted = a.mode === "learning" ? r.checked : a.status === "submitted";
    if (!counted) continue;
    const o = outcomeFor(a, q, r).outcome;
    out.push({
      chapterId: chapterKey(q.subject, q.chapter),
      difficulty: (q.difficulty ?? "medium").toUpperCase() as PlanDifficulty,
      outcome: o === "correct" ? "correct" : o === "unattempted" ? "skipped" : "wrong",
      timeMs: r.timeSpentSec ? r.timeSpentSec * 1000 : null,
      at: r.savedAt ?? a.updatedAt,
      source,
    });
  }
  return out;
}

function allEvidence(s: DemoState, m: MockState): Evidence[] {
  const planStart = m.plan?.createdAt ?? null;
  const out: Evidence[] = [];
  for (const a of Object.values(s.attempts)) {
    if (a.id === m.diagnostic.attemptId) out.push(...attemptEvidence(a, "diagnostic"));
    else if (planStart && a.startedAt >= planStart) out.push(...attemptEvidence(a, "plan"));
    else out.push(...attemptEvidence(a, "history"));
  }
  return out;
}

function chapterInfos(s: DemoState, m: MockState, evidence: Evidence[]): ChapterInfo[] {
  const outcomes = mockOutcomes(s);
  const fams = mockFamiliesForPlans();
  return m.setup.chapters.map((key) => {
    const { subject, chapter } = splitKey(key);
    const mine = fams.filter((f) => f.questions[0]!.subject === subject && f.questions[0]!.chapter === chapter);
    const supply = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const problems: Record<PlanDifficulty, number[]> = { EASY: [], MEDIUM: [], HARD: [] };
    for (const f of mine) {
      if (f.questions.some((q) => outcomes.get(q.id) === "solved")) continue;
      const d = (f.questions[0]!.difficulty ?? "medium").toUpperCase() as PlanDifficulty;
      supply[d]++;
      problems[d].push(f.number);
    }
    const openMistakes = Object.values(s.mistakes).filter((x) => {
      if (x.status !== "open") return false;
      const q = catalog.question(x.questionId);
      return q?.subject === subject && q.chapter === chapter;
    }).length;
    const plan = evidence.filter((e) => e.source === "plan" && e.chapterId === key && e.outcome !== "skipped");
    return {
      chapterId: key,
      subjectId: subject,
      supply,
      problems,
      openMistakes,
      stepAttempts: plan.length,
      stepCorrect: plan.filter((e) => e.outcome === "correct").length,
    };
  });
}

function chapterView(e: { chapterId: string; band: Band; correct: number; answered: number; slow: boolean }): ChapterView {
  const { subject, chapter } = splitKey(e.chapterId);
  return { subject, chapter, name: catalog.chapter(subject, chapter)?.name ?? chapter, band: e.band, correct: e.correct, answered: e.answered, slow: e.slow };
}

function itemView(it: PlanItem): ItemView {
  const ch = it.chapterId ? splitKey(it.chapterId) : null;
  return {
    key: it.key,
    kind: it.kind,
    subject: ch?.subject ?? null,
    chapter: ch?.chapter ?? null,
    chapterName: ch ? (catalog.chapter(ch.subject, ch.chapter)?.name ?? ch.chapter) : null,
    difficulty: it.difficulty ? lower(it.difficulty) : null,
    size: it.size,
    problems: it.problems,
    timeLimitSec: it.timeLimitSec,
    minutes: it.minutes,
    startedAt: it.startedAt ?? null,
    completedAt: it.completedAt ?? null,
  };
}

function isDone(a: Attempt | undefined): boolean {
  if (!a) return false;
  if (a.status === "submitted") return true;
  return a.mode === "learning" && a.questionIds.every((q) => a.responses[q]?.checked);
}

/* =================================================================== api */

const enc = encodeURIComponent;
async function authed<S extends z.ZodType>(path: string, schema: S, method: "GET" | "POST" = "GET", body?: unknown) {
  const token = await getToken();
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Not signed in");
  try {
    return (await apiFetch(path, { schema, token, base: "browser", method, body })).data;
  } catch (e) {
    if (isApiError(e) && (e.details as { reason?: string } | undefined)?.reason === "PREMIUM_REQUIRED") throw new PlusRequiredError();
    throw e;
  }
}

function subjectFromSlug(slug: string): SubjectId {
  const hit = registry.allSubjects().find((x) => slug.endsWith(`-${x.id}`));
  return hit?.id ?? "physics";
}

function apiChapterView(c: z.infer<typeof DiagnosticReportSchema>["focus"][number]): ChapterView {
  const hit = registry.chapterLookup(c.chapter.slug);
  return {
    subject: hit?.subject ?? subjectFromSlug(c.subject.slug),
    chapter: hit?.chapter ?? c.chapter.slug,
    name: c.chapter.name,
    band: c.band,
    correct: c.correct,
    answered: c.answered,
    slow: c.slow,
  };
}

function apiPlanView(p: StudyPlan): PlanView {
  return {
    id: p.id,
    exam: (p.exam === "neet-ug" ? "neet" : p.exam) as ExamId,
    startsOn: p.starts_on,
    days: p.days,
    dailyMinutes: p.daily_minutes,
    todayIndex: p.today_index,
    diagnosticAttemptId: p.diagnostic_session_id,
    locked: p.locked,
    plan: p.plan_days.map((d) => ({
      index: d.index,
      date: d.date,
      light: d.light,
      items: d.items.map((it) => {
        const hit = it.chapter ? registry.chapterLookup(it.chapter.slug) : null;
        return {
          key: it.key,
          kind: it.kind,
          subject: hit?.subject ?? (it.subject ? subjectFromSlug(it.subject.slug) : null),
          chapter: hit?.chapter ?? it.chapter?.slug ?? null,
          chapterName: it.chapter?.name ?? null,
          difficulty: it.difficulty ? lower(it.difficulty) : null,
          size: it.size,
          problems: it.problems,
          timeLimitSec: it.time_limit_sec,
          minutes: it.minutes,
          startedAt: it.started_at,
          completedAt: it.completed_at,
        };
      }),
    })),
  };
}

/* =================================================================== public */

/** Chapters with at least one problem, per subject (what a diagnostic can draw from). */
export function availableChapters(exam: ExamId): { subject: SubjectId; chapters: { key: string; name: string }[] }[] {
  const counts = catalog.chapterCounts(exam);
  const subjects = catalog.subjectsForExam(exam).map((x) => x.id);
  return subjects.map((subject) => ({
    subject,
    chapters: catalog
      .chapters({ exam, subject })
      .filter((c) => (counts.get(chapterKey(subject, c.slug)) ?? 0) > 0)
      .map((c) => ({ key: chapterKey(subject, c.slug), name: c.name })),
  }));
}

export async function startDiagnostic(setup: Setup, s: DemoState): Promise<{ attemptId: string; meta: DiagnosticMeta }> {
  if (API) {
    const body: z.input<typeof CreateDiagnosticBody> = {
      client_request_id: crypto.randomUUID(),
      exam: examToApi(setup.exam),
      length: setup.length,
      subjects: setup.subjects.map((x) => registry.apiSubject(setup.exam, x)?.apiSlug).filter((x): x is string => Boolean(x)),
      chapters: setup.chapters
        .map((k) => {
          const { subject, chapter } = splitKey(k);
          return registry.apiChapter(setup.exam, subject, chapter)?.apiSlug;
        })
        .filter((x): x is string => Boolean(x)),
    };
    const r = await authed("/plans/diagnostic", DiagnosticCreatedSchema, "POST", body);
    const meta = { attemptId: r.session.id ?? "", requestedMix: upperMix(r.requested_mix), actualMix: upperMix(r.actual_mix), shortBy: r.short_by };
    rememberDiagnostic(meta);
    return { attemptId: meta.attemptId, meta };
  }
  const keys = new Set(setup.chapters);
  const d = assembleDiagnostic(candidates(s, keys), { length: setup.length, seed: `${Date.now()}` });
  if (d.picks.length === 0) throw new Error("No questions in the chosen chapters");
  const attemptId = await startPractice({
    exam: setup.exam,
    mode: "test",
    title: "Diagnostic",
    questionIds: d.picks.map((p) => p.questionId),
    scope: { source: "quick" },
    durationSec: d.picks.length * PLAN_CONFIG.diagnosticSecPerQuestion,
  });
  const meta: DiagnosticMeta = { attemptId, requestedMix: upperMix(d.requestedMix), actualMix: upperMix(d.actualMix), shortBy: d.shortBy };
  writeMock({ v: 1, exam: setup.exam, setup, diagnostic: meta });
  return { attemptId, meta };
}

/** The diagnostic this student last started, if any. */
export function currentDiagnostic(): DiagnosticMeta | null {
  return API ? lastDiagnostic() : (readMock()?.diagnostic ?? null);
}

export function isDiagnosticAttempt(attemptId: string): boolean {
  return currentDiagnostic()?.attemptId === attemptId;
}

export async function getReport(s: DemoState): Promise<ReportView | null> {
  if (API) {
    const last = lastDiagnostic();
    if (!last) return null;
    const r = await authed(`/plans/diagnostic/${enc(last.attemptId)}/report`, DiagnosticReportSchema);
    return {
      attemptId: r.session_id,
      completed: r.completed,
      actualMix: upperMix(r.actual_mix),
      subjects: r.subjects.map((x) => ({ subject: subjectFromSlug(x.subject.slug), name: x.subject.name, correct: x.correct, answered: x.answered, skipped: x.skipped })),
      focus: r.focus.map(apiChapterView),
      chapters: r.chapters ? r.chapters.map(apiChapterView) : null,
      plus: r.plus,
    };
  }
  const m = readMock();
  if (!m) return null;
  const a = s.attempts[m.diagnostic.attemptId];
  if (!a) return null;
  const evidence = allEvidence(s, m);
  const estimates = estimateMastery(m.setup.chapters, evidence, new Date());
  const picks = a.questionIds.map((qid) => {
    const q = catalog.question(qid)!;
    return { questionId: qid, familyId: qid, chapterId: chapterKey(q.subject, q.chapter), subjectId: q.subject, difficulty: (q.difficulty ?? "medium").toUpperCase() as PlanDifficulty };
  });
  const r = diagnosticReport(picks, evidence, estimates, chapterInfos(s, m, evidence));
  const measured = r.chapters.filter((e) => e.band !== "unmeasured" || picks.some((p) => p.chapterId === e.chapterId));
  return {
    attemptId: a.id,
    completed: a.status === "submitted",
    actualMix: m.diagnostic.actualMix,
    subjects: r.subjects.map((x) => ({ subject: x.subjectId as SubjectId, name: catalog.subject(x.subjectId as SubjectId)?.name ?? x.subjectId, correct: x.correct, answered: x.answered, skipped: x.skipped })),
    focus: r.focus.map((id) => chapterView(r.chapters.find((e) => e.chapterId === id)!)),
    chapters: measured.map(chapterView),
    plus: true,
  };
}

export async function createPlan(opts: { dailyMinutes: 30 | 60 | 90 | 120; days: 7 | 14 }, s: DemoState): Promise<PlanView> {
  if (API) {
    const last = lastDiagnostic();
    if (!last) throw new Error("Take the diagnostic first");
    const p = await authed("/plans", StudyPlanSchema, "POST", {
      client_request_id: crypto.randomUUID(),
      diagnostic_session_id: last.attemptId,
      daily_minutes: opts.dailyMinutes,
      days: opts.days,
    });
    return apiPlanView(p);
  }
  const m = readMock();
  if (!m) throw new Error("Take the diagnostic first");
  const createdAt = new Date().toISOString();
  const seed = `${m.diagnostic.attemptId}:${createdAt}`;
  const evidence = allEvidence(s, m);
  const estimates = estimateMastery(m.setup.chapters, evidence, new Date());
  const startsOn = todayIst();
  const planDays = buildPlan({ chapters: chapterInfos(s, m, evidence), estimates, dailyMinutes: opts.dailyMinutes, days: opts.days, startDate: startsOn, seed });
  m.plan = { id: `plan_${Date.now().toString(36)}`, startsOn, days: opts.days, dailyMinutes: opts.dailyMinutes, seed, createdAt, planDays, itemAttempts: {} };
  writeMock(m);
  return (await getPlan(s))!;
}

/** The active plan, re-planned for today from everything practised since it started. */
export async function getPlan(s: DemoState): Promise<PlanView | null> {
  if (API) {
    try {
      return apiPlanView(await authed("/plans/current", StudyPlanSchema));
    } catch (e) {
      if (isApiError(e) && e.status === 404) return null;
      throw e;
    }
  }
  const m = readMock();
  if (!m?.plan) return null;
  const p = m.plan;
  const todayIndex = Math.max(0, Math.min(p.days, daysBetween(p.startsOn, todayIst())));
  const outcomes = mockOutcomes(s);
  const fams = mockFamiliesForPlans();
  // Completion from the linked attempts / problems.
  for (const day of p.planDays) {
    for (const it of day.items) {
      if (it.completedAt) continue;
      const att = p.itemAttempts[it.key];
      if (it.kind === "PROBLEMS") {
        const done = (it.problems ?? []).every((n) => fams.find((f) => f.number === n)?.questions.some((q) => outcomes.has(q.id)));
        if (done && it.startedAt) it.completedAt = new Date().toISOString();
      } else if (it.kind === "REVIEW_DIAGNOSTIC") {
        if (it.startedAt) it.completedAt = it.startedAt;
      } else if (att && isDone(s.attempts[att])) {
        it.completedAt = s.attempts[att]!.submittedAt ?? new Date().toISOString();
      }
    }
  }
  const evidence = allEvidence(s, m);
  const estimates = estimateMastery(m.setup.chapters, evidence, new Date());
  if (todayIndex < p.days) {
    p.planDays = replan(p.planDays, { chapters: chapterInfos(s, m, evidence), estimates, dailyMinutes: p.dailyMinutes, days: p.days, startDate: p.startsOn, seed: p.seed }, todayIndex);
  }
  writeMock(m);
  return {
    id: p.id,
    exam: m.exam,
    startsOn: p.startsOn,
    days: p.days,
    dailyMinutes: p.dailyMinutes,
    todayIndex,
    diagnosticAttemptId: m.diagnostic.attemptId,
    locked: false,
    plan: p.planDays.map((d) => ({ index: d.index, date: d.date, light: d.light, items: d.items.map(itemView) })),
  };
}

/**
 * Start a plan item. Returns where to go: a session, the diagnostic's results, or null when the item is a list of problems
 * the page shows inline (PROBLEMS).
 */
export async function startItem(plan: PlanView, item: ItemView, s: DemoState): Promise<string | null> {
  if (item.kind === "REVIEW_DIAGNOSTIC" && !API) {
    markStarted(item.key, null);
    return `/results/?id=${plan.diagnosticAttemptId}`;
  }
  if (API) {
    const r = await authed(`/plans/${enc(plan.id)}/items/${enc(item.key)}/start`, PlanItemStartedSchema, "POST");
    if (item.kind === "REVIEW_DIAGNOSTIC") return `/results/?id=${plan.diagnosticAttemptId}`;
    return r.session ? `/practice/session/?id=${r.session.session.id}` : null;
  }
  const m = readMock();
  if (!m?.plan) throw new Error("No plan");
  let attemptId: string | null = null;
  if (item.kind === "PROBLEMS") {
    markStarted(item.key, null);
    return null;
  }
  if ((item.kind === "PRACTICE" || item.kind === "TIMED") && item.subject && item.chapter) {
    const ids = pickQuestions({ exam: plan.exam, subject: item.subject, chapter: item.chapter, count: item.size ?? 8, difficulty: item.difficulty ?? undefined });
    if (!ids.length) throw new Error("No questions left here");
    attemptId = await startPractice({
      exam: plan.exam,
      mode: item.kind === "TIMED" ? "test" : "learning",
      title: `${item.kind === "TIMED" ? "Timed drill" : "Plan practice"} · ${item.chapterName ?? ""}`,
      questionIds: ids,
      scope: { subject: item.subject, chapter: item.chapter, source: "chapter" },
      durationSec: item.kind === "TIMED" ? item.timeLimitSec : null,
    });
  } else if (item.kind === "MISTAKES") {
    const ids = Object.values(s.mistakes)
      .filter((x) => x.status === "open")
      .map((x) => x.questionId)
      .filter((id) => {
        const q = catalog.question(id);
        return q?.subject === item.subject && q.chapter === item.chapter;
      })
      .slice(0, item.size ?? 5);
    if (!ids.length) throw new Error("No open mistakes in this chapter any more");
    attemptId = await startPractice({ exam: plan.exam, mode: "learning", title: `Mistakes · ${item.chapterName ?? ""}`, questionIds: ids, scope: { source: "mistakes" } });
  } else if (item.kind === "CHECKPOINT") {
    const d = assembleDiagnostic(candidates(s, new Set(m.setup.chapters)), { length: item.size ?? PLAN_CONFIG.checkpointSize, seed: `${plan.id}:${item.key}` });
    attemptId = await startPractice({
      exam: plan.exam,
      mode: "test",
      title: "Checkpoint",
      questionIds: d.picks.map((p) => p.questionId),
      scope: { source: "quick" },
      durationSec: item.timeLimitSec,
    });
  }
  if (!attemptId) throw new Error("Nothing to start");
  markStarted(item.key, attemptId);
  return `/practice/session/?id=${attemptId}`;
}

function markStarted(key: string, attemptId: string | null) {
  const m = readMock();
  if (!m?.plan) return;
  for (const d of m.plan.planDays) for (const it of d.items) if (it.key === key && !it.startedAt) it.startedAt = new Date().toISOString();
  if (attemptId) m.plan.itemAttempts[key] = attemptId;
  writeMock(m);
}

/** Start over: the old plan is dropped in demo mode (API mode archives it on the server when a new one is created). */
export function resetDemoPlan() {
  if (!API) writeMock(null);
  else
    try {
      localStorage.removeItem(LAST_DIAG);
    } catch {
      /* convenience only */
    }
}

export const BAND_COPY: Record<Band, { label: string; help: string }> = {
  weak: { label: "Needs work", help: "Most answers here were wrong. Start with easier problems." },
  shaky: { label: "Getting there", help: "Some right, some wrong, or right but slow." },
  strong: { label: "Strong", help: "Right on most answers, including harder ones." },
  unmeasured: { label: "Not measured", help: "Not enough answers here to judge yet." },
};

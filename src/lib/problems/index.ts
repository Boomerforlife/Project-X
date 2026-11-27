"use client";

/**
 * Problem library data layer (client). API mode reads Owner B's `/problems*` endpoints (migration 0022); mock mode derives
 * the same shape from the fixture bank, grouping template variants into one problem the way the backend does.
 * Nothing here invents numbers: solve rate is shown only when the server returns one.
 */
import { z } from "zod";
import {
  DailyProblemSchema,
  PracticeQuestionSchema,
  ProblemDetailSchema,
  ProblemListSchema,
  ProblemSummarySchema,
  type Problem as ApiProblem,
} from "@projectx/contracts";
import type { Difficulty, ExamId, Question, QuestionType, SubjectId } from "@/contracts";
import { getToken } from "@/lib/api/auth";
import { apiFetch } from "@/lib/api/http";
import { toPracticeQuestion } from "@/lib/api/adapters/practice";
import { examToApi, subjectFromApi, typeFromApi } from "@/lib/api/adapters/ids";
import { catalog } from "@/lib/data/catalog";
import { outcomeFor } from "@/lib/demo/scoring";
import { startList, startPractice } from "@/lib/demo/store";
import type { DemoState } from "@/lib/demo/types";
import { registry } from "@/lib/session/registry";
import { DATA_SOURCE } from "@/lib/site";

const API = DATA_SOURCE === "api";

export type ProblemStatus = "solved" | "attempted" | null;

export type LibProblem = {
  number: number;
  /** RichText (may contain `$…$`). Null when the server title is unreadable (maths stripped): show "open to read". */
  title: string | null;
  difficulty: Difficulty | null;
  subject: SubjectId;
  chapter: string;
  chapterName: string;
  type: QuestionType | null;
  versions: number;
  /** 0..1, only when the server has enough attempts to show one. */
  solveRate: number | null;
  premium: boolean;
  locked: boolean;
  status: ProblemStatus;
};

export type LibFilters = {
  exam: ExamId;
  subject?: SubjectId;
  chapter?: string;
  difficulty?: Difficulty[];
  status?: "solved" | "attempted" | "todo";
  q?: string;
  offset?: number;
  limit?: number;
};

export type LibPage = { items: LibProblem[]; total: number; offset: number; limit: number };
type Counts = Record<Difficulty, number> & { total: number };
export type LibSummary = { problems: Counts; solved: Counts | null; plus: boolean; freeVersions: number };

const zero = (): Counts => ({ easy: 0, medium: 0, hard: 0, total: 0 });
const DIFF_FROM_API = { EASY: "easy", MEDIUM: "medium", HARD: "hard" } as const;
const DIFF_TO_API = { easy: "EASY", medium: "MEDIUM", hard: "HARD" } as const;

/* ------------------------------------------------------------------ titles */

/**
 * Server titles are the stem with LaTeX stripped, which turns maths into "x 0 1 - 2x x 2 equals". Treat a title as unreadable
 * when a large share of its tokens are lone symbols or digits.
 */
export function readableTitle(t: string): string | null {
  const tokens = t.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || t === "Untitled problem") return null;
  const lone = tokens.filter((x) => x.length === 1 && x.toLowerCase() !== "a").length;
  return lone / tokens.length > 0.3 ? null : t;
}

/** Cut RichText to about `max` visible characters without splitting a `$…$` span. */
export function truncateRich(src: string, max = 140): string {
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let out = "";
  let seen = 0;
  let last = 0;
  const addText = (s: string) => {
    const room = max - seen;
    if (s.length <= room) {
      out += s;
      seen += s.length;
      return true;
    }
    const cut = s.slice(0, room).replace(/\s+\S*$/, "");
    out += `${cut}…`;
    seen = max;
    return false;
  };
  for (const m of src.matchAll(re)) {
    if (!addText(src.slice(last, m.index))) return out;
    const tex = m[1] ?? m[2] ?? "";
    if (seen + Math.ceil(tex.length / 2) > max) return `${out.trimEnd()} …`;
    out += `$${tex}$`;
    seen += Math.ceil(tex.length / 2);
    last = m.index + m[0].length;
  }
  addText(src.slice(last));
  return out.replace(/\s*_{2,}\.?$/, " …");
}

/* --------------------------------------------------------------------- api */

const enc = encodeURIComponent;
async function call<S extends z.ZodType>(path: string, schema: S) {
  const token = await getToken();
  return (await apiFetch(path, { schema, token, base: "browser" })).data;
}

function fromApi(p: ApiProblem): LibProblem {
  const hit = registry.chapterLookup(p.chapter.slug);
  const sub = hit?.subject ?? subjectFromApi(p.subject.slug.split("-").pop() ?? "", p.subject.name)?.subject ?? "physics";
  return {
    number: p.number,
    title: readableTitle(p.title),
    difficulty: p.difficulty ? DIFF_FROM_API[p.difficulty] : null,
    subject: sub,
    chapter: hit?.chapter ?? p.chapter.slug,
    chapterName: p.chapter.name,
    type: p.question_type ? typeFromApi(p.question_type) : null,
    versions: p.variants,
    solveRate: p.acceptance_rate,
    premium: p.premium,
    locked: p.locked,
    status: p.status === "SOLVED" ? "solved" : p.status === "ATTEMPTED" ? "attempted" : null,
  };
}

function apiQuery(f: LibFilters): string {
  const u = new URLSearchParams({ exam: examToApi(f.exam) });
  if (f.subject) {
    const s = registry.apiSubject(f.exam, f.subject);
    if (s) u.set("subject", s.apiSlug);
  }
  if (f.subject && f.chapter) {
    const c = registry.apiChapter(f.exam, f.subject, f.chapter);
    if (c) u.set("chapter", c.apiSlug);
  }
  for (const d of f.difficulty ?? []) u.append("difficulty", DIFF_TO_API[d]);
  if (f.status) u.set("status", f.status.toUpperCase());
  if (f.q && f.q.trim().length >= 2) u.set("q", f.q.trim());
  u.set("offset", String(f.offset ?? 0));
  u.set("limit", String(f.limit ?? 50));
  return u.toString();
}

/* -------------------------------------------------------------------- mock */

type MockFamily = { number: number; key: string; questions: Question[] };
let mockFamilies: MockFamily[] | null = null;

/** Fixture template variants are `g_<template>_<n>`; everything else is a problem of one. */
function families(): MockFamily[] {
  if (mockFamilies) return mockFamilies;
  const byKey = new Map<string, Question[]>();
  for (const q of catalog.questions()) {
    const key = q.id.startsWith("g_") ? q.id.replace(/_\d+$/, "") : q.id;
    byKey.set(key, [...(byKey.get(key) ?? []), q]);
  }
  const order = new Map(catalog.chapters().map((c, i) => [`${c.subject}/${c.slug}`, i]));
  const subjects = ["physics", "chemistry", "mathematics", "biology"];
  const list = [...byKey.entries()].sort(([, a], [, b]) => {
    const qa = a[0]!;
    const qb = b[0]!;
    return (
      subjects.indexOf(qa.subject) - subjects.indexOf(qb.subject) ||
      (order.get(`${qa.subject}/${qa.chapter}`) ?? 0) - (order.get(`${qb.subject}/${qb.chapter}`) ?? 0) ||
      qa.id.localeCompare(qb.id)
    );
  });
  mockFamilies = list.map(([key, questions], i) => ({ number: i + 1, key, questions }));
  return mockFamilies;
}

/** question id -> best outcome across this browser's attempts (mock mode only). */
export function mockOutcomes(s: DemoState): Map<string, "solved" | "attempted"> {
  const out = new Map<string, "solved" | "attempted">();
  for (const a of Object.values(s.attempts)) {
    for (const [qid, r] of Object.entries(a.responses)) {
      if (!(r.checked || (a.status === "submitted" && r.answer))) continue;
      const q = catalog.question(qid);
      if (!q) continue;
      const o = outcomeFor(a, q, r).outcome;
      if (o === "correct") out.set(qid, "solved");
      else if (o !== "unattempted" && out.get(qid) !== "solved") out.set(qid, "attempted");
    }
  }
  return out;
}

function mockProblem(f: MockFamily, outcomes: Map<string, "solved" | "attempted">): LibProblem {
  const q = f.questions[0]!;
  const ch = catalog.chapter(q.subject, q.chapter);
  const statuses = f.questions.map((x) => outcomes.get(x.id));
  return {
    number: f.number,
    title: truncateRich(q.stem),
    difficulty: q.difficulty ?? null,
    subject: q.subject,
    chapter: q.chapter,
    chapterName: ch?.name ?? q.chapter,
    type: q.type,
    versions: f.questions.length,
    solveRate: null,
    premium: false,
    locked: false,
    status: statuses.includes("solved") ? "solved" : statuses.includes("attempted") ? "attempted" : null,
  };
}

function mockAll(exam: ExamId, s: DemoState | null): LibProblem[] {
  const outcomes = s ? mockOutcomes(s) : new Map();
  return families()
    .filter((f) => f.questions[0]!.exams.includes(exam))
    .map((f) => mockProblem(f, outcomes));
}

/* ------------------------------------------------------------------ public */

export async function listProblems(f: LibFilters, s: DemoState | null): Promise<LibPage> {
  if (API) {
    const r = await call(`/problems?${apiQuery(f)}`, ProblemListSchema);
    return { items: r.items.map(fromApi), total: r.total, offset: r.offset, limit: r.limit };
  }
  const q = f.q?.trim().toLowerCase();
  const all = mockAll(f.exam, s).filter(
    (p) =>
      (!f.subject || p.subject === f.subject) &&
      (!f.chapter || p.chapter === f.chapter) &&
      (!f.difficulty?.length || (p.difficulty && f.difficulty.includes(p.difficulty))) &&
      (!f.status || (f.status === "todo" ? p.status === null : p.status === f.status)) &&
      (!q || (p.title ?? "").toLowerCase().includes(q)),
  );
  const offset = f.offset ?? 0;
  const limit = f.limit ?? 50;
  return { items: all.slice(offset, offset + limit), total: all.length, offset, limit };
}

export async function problemSummary(exam: ExamId, s: DemoState | null): Promise<LibSummary> {
  if (API) {
    const r = await call(`/problems/summary?exam=${enc(examToApi(exam))}`, ProblemSummarySchema);
    const conv = (c: { EASY: number; MEDIUM: number; HARD: number; total: number }): Counts => ({ easy: c.EASY, medium: c.MEDIUM, hard: c.HARD, total: c.total });
    return { problems: conv(r.problems), solved: r.solved ? conv(r.solved) : null, plus: r.plus, freeVersions: r.free_variants_per_problem };
  }
  const problems = zero();
  const solved = zero();
  for (const p of mockAll(exam, s)) {
    const d = p.difficulty ?? "medium";
    problems[d]++;
    problems.total++;
    if (p.status === "solved") {
      solved[d]++;
      solved.total++;
    }
  }
  return { problems, solved: s ? solved : null, plus: true, freeVersions: 3 };
}

/** Same problem for everyone today (IST). Mock mode: deterministic pick from the bank. */
export async function todaysProblem(exam: ExamId, s: DemoState | null): Promise<{ date: string; problem: LibProblem } | null> {
  if (API) {
    try {
      const r = await call(`/problems/daily?exam=${enc(examToApi(exam))}`, DailyProblemSchema);
      return { date: r.date, problem: fromApi(r.problem) };
    } catch {
      return null;
    }
  }
  const all = mockAll(exam, s);
  if (!all.length) return null;
  const date = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  let h = 0;
  for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { date, problem: all[h % all.length]! };
}

export async function problemDetail(number: number) {
  if (!API) return null;
  return call(`/problems/${number}`, ProblemDetailSchema);
}

/**
 * Open a problem for solving: serve one version (an untried one first) and start a one-question Learning session.
 * Returns the attempt id for /practice/session/. API mode: 403 PREMIUM_REQUIRED surfaces as an ApiError.
 */
export async function openProblem(number: number, exam: ExamId, s: DemoState | null): Promise<string> {
  if (API) {
    const pq = await call(`/problems/${number}/next`, PracticeQuestionSchema);
    const q = toPracticeQuestion(pq);
    registry.putQuestions([q]);
    return startPractice({ exam: q.exams[0] ?? exam, mode: "learning", title: `Q-${String(number).padStart(3, "0")}`, questionIds: [q.id], scope: { source: "single" } });
  }
  const fam = families().find((f) => f.number === number);
  if (!fam) throw new Error("Problem not found");
  const outcomes = s ? mockOutcomes(s) : new Map();
  const pick = fam.questions.find((q) => !outcomes.has(q.id)) ?? fam.questions.find((q) => outcomes.get(q.id) !== "solved") ?? fam.questions[0]!;
  return startPractice({ exam, mode: "learning", title: `Q-${String(number).padStart(3, "0")}`, questionIds: [pick.id], scope: { source: "single" } });
}

/**
 * Open a problem inside the list it was picked from (a chapter's problems or the visible library list), positioned at it,
 * so Previous/Next walk that list. API mode resolves each problem to a question only when the student reaches it.
 */
export async function openProblemList(numbers: number[], start: number, exam: ExamId, s: DemoState | null, title: string): Promise<string> {
  const startIndex = Math.max(0, numbers.indexOf(start));
  const scope = { source: "quick" as const };
  if (API) return startList({ exam, title, items: numbers.map((problem) => ({ problem })), startIndex, scope });
  const outcomes = s ? mockOutcomes(s) : new Map();
  const byNumber = new Map(families().map((f) => [f.number, f]));
  const ids = numbers.flatMap((n) => {
    const fam = byNumber.get(n);
    if (!fam) return [];
    const pick = fam.questions.find((q) => !outcomes.has(q.id)) ?? fam.questions.find((q) => outcomes.get(q.id) !== "solved") ?? fam.questions[0];
    return pick ? [pick.id] : [];
  });
  const startFam = byNumber.get(start);
  const startId = startFam ? ids.find((id) => startFam.questions.some((q) => q.id === id)) : undefined;
  return startList({ exam, title, items: ids.map((questionId) => ({ questionId })), startIndex: startId ? ids.indexOf(startId) : 0, scope });
}

/** Mock-mode hook for the study plan: which problem numbers exist per chapter and difficulty. */
export function mockFamiliesForPlans() {
  return families();
}

export const formatNumber = (n: number) => `Q-${String(n).padStart(3, "0")}`;

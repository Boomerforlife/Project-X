/**
 * Content data layer for SERVER components — the only place public pages read
 * content from.
 *
 * Every function dispatches on DATA_SOURCE (a whole-app switch, never per
 * entity): "mock" reads the validated fixtures through the catalog exactly as
 * before; "api" calls the cached wrappers in ./api (no fixture fallback).
 * Pages and components never call fetch() directly.
 */
import { z } from "zod";
import { Chapter, Paper, Question, Solution, Subject, type ExamId, type QuestionCard, type SubjectId } from "@/contracts";
import { getBank } from "@/fixtures/bank";
import { getDemoPapers } from "@/fixtures/papers";
import { chapters as chapterFx, subjects as subjectFx } from "@/fixtures/syllabus";
import { flags } from "@/lib/api/env";
import { TRACK_INFO, trackOf, type Track } from "@/lib/exams";
import { isQuestionIndexable } from "@/lib/indexing";
import { DATA_SOURCE } from "@/lib/site";
import * as api from "./api";
import { catalog } from "./catalog";

const API = DATA_SOURCE === "api";

/**
 * Papers/CBT are demo-only (fixture-backed in every mode). In API mode they are
 * hidden unless NEXT_PUBLIC_FEATURE_PAPERS=demo, so public pages must not link to them.
 */
export const PAPERS_VISIBLE = !API || flags.papers === "demo";

// Fixtures must pass the same schemas as API responses (CLAUDE.md §14).
let validated = false;
function validate() {
  if (validated) return;
  const bank = getBank();
  z.array(Subject).parse(subjectFx);
  z.array(Chapter).parse(chapterFx);
  z.array(Question).parse(bank.questions);
  z.array(Solution).parse(bank.solutions);
  z.array(Paper).parse(getDemoPapers());
  validated = true;
}

/** Active exams of a track. Mock mode: all of them. API mode: only exams the backend has activated. */
export async function getExams(track: Track): Promise<ExamId[]> {
  return API ? api.apiExams(track) : TRACK_INFO[track].exams;
}

export async function getSubjects(track?: Track) {
  if (API) return api.apiSubjects(track);
  validate();
  return track ? catalog.subjectsForTrack(track) : catalog.subjects();
}

export async function getSubject(id: string) {
  if (API) return (await api.apiSubjects()).find((s) => s.id === id) ?? null;
  return catalog.subject(id);
}

export async function getChapters(filter: { subject?: SubjectId; track?: Track; exam?: ExamId } | SubjectId = {}) {
  const f = typeof filter === "string" ? { subject: filter } : filter;
  if (API) return api.apiChapters(f);
  validate();
  return catalog.chapters(f);
}

export async function getChapter(subject: string, slug: string) {
  if (!API) return catalog.chapter(subject, slug);
  const c = (await api.apiChapters({})).find((x) => x.subject === subject && x.slug === slug) ?? null;
  if (!c) return null;
  // Backend description wins over the editorial overlay (null today, so usually the overlay).
  const summary = await api.apiChapterSummary(c.subject, c.slug, trackOf(c.exams[0]!));
  return summary ? { ...c, summary } : c;
}

export async function getQuestions(filter: { subject?: SubjectId; chapter?: string; track?: Track } = {}): Promise<QuestionCard[]> {
  if (API) {
    if (filter.subject && filter.chapter) return api.apiChapterQuestions(filter.subject, filter.chapter, filter.track);
    const all = await api.apiPublicQuestions(filter.track);
    return all.filter((q) => (!filter.subject || q.subject === filter.subject) && (!filter.chapter || q.chapter === filter.chapter));
  }
  validate();
  return catalog.questions(filter);
}

/** Questions eligible for an indexable public page. API mode: capped at 200 (feeds generateStaticParams). */
export async function getPublicQuestions(): Promise<QuestionCard[]> {
  if (API) return api.apiPublicQuestions();
  return catalog.questions().filter((q) => q.publicPage);
}

export async function getQuestionBySlug(slug: string) {
  return catalog.questions().find((q) => q.slug === slug) ?? null;
}

export type QuestionPage =
  | { status: "ok"; question: Question; solution: Solution | null }
  | { status: "moved"; slug: string }
  | { status: "missing" };

/** Public question page data: question + solution, or a redirect target / not-found. */
export async function getQuestionPage(slug: string): Promise<QuestionPage> {
  if (API) return api.apiQuestionPage(slug);
  const q = catalog.questions().find((x) => x.slug === slug);
  if (!q || !q.publicPage) return { status: "missing" };
  return { status: "ok", question: q, solution: catalog.solution(q.id) };
}

export async function getRelatedQuestions(slug: string, limit = 4): Promise<QuestionCard[]> {
  if (API) return api.apiRelatedQuestions(slug, limit);
  const q = catalog.questions().find((x) => x.slug === slug);
  if (!q) return [];
  return catalog
    .questions({ subject: q.subject, chapter: q.chapter, track: trackOf(q.exams[0]) })
    .filter((x) => x.id !== q.id && x.publicPage)
    .slice(0, limit);
}

/** Questions that belong in the sitemap (server's `sitemap_include` in API mode). */
export async function getSitemapQuestions(): Promise<{ track: Track; slug: string; updatedAt: string | null }[]> {
  if (API) return api.apiSitemapQuestions();
  return catalog
    .questions()
    .filter(isQuestionIndexable)
    .map((q) => ({ track: trackOf(q.exams[0]), slug: q.slug, updatedAt: null }));
}

/**
 * OPEN QUESTION (Person 2): are solutions public on question pages, or gated
 * behind an attempt / login? Until agreed, public pages render them.
 */
export async function getSolution(questionId: string) {
  // API mode: solutions come with `getQuestionPage`; there is no standalone lookup.
  return API ? null : catalog.solution(questionId);
}

/**
 * Papers are demo fixtures in EVERY mode (plan 1.6): the backend has no paper endpoint yet. Read the
 * fixture directly (not via `catalog`, whose API-mode view is the client registry) so
 * `/tests/[paperId]` generateStaticParams stays non-empty. Public pages must go through
 * `getPublicPapers`; private screens gate on the papers flag themselves.
 */
export async function getPapers(filter: { track?: Track; exam?: ExamId; kind?: "pyq" | "mock" } = {}) {
  if (!API) {
    validate();
    return catalog.papers(filter);
  }
  const exams = filter.exam ? [filter.exam] : filter.track ? TRACK_INFO[filter.track].exams : null;
  return getDemoPapers().filter((p) => (!exams || exams.includes(p.exam)) && (!filter.kind || p.kind === filter.kind));
}

/**
 * Papers a PUBLIC page may present. API mode never shows demo papers (the
 * backend has no paper endpoint yet), so crawlers cannot see sample papers.
 */
export async function getPublicPapers(filter: { track?: Track; exam?: ExamId; kind?: "pyq" | "mock" } = {}) {
  const papers = await getPapers(filter);
  return API ? papers.filter((p) => !p.isDemo) : papers;
}

export async function getPaper(id: string) {
  return API ? (getDemoPapers().find((p) => p.id === id) ?? null) : catalog.paper(id);
}

export async function getQuestionCounts(track?: Track) {
  if (API) return api.apiQuestionCounts(track);
  const bySubject = new Map<string, number>();
  const byChapter = new Map<string, number>();
  const qs = catalog.questions(track ? { track } : {});
  for (const q of qs) {
    bySubject.set(q.subject, (bySubject.get(q.subject) ?? 0) + 1);
    const key = `${q.subject}/${q.chapter}`;
    byChapter.set(key, (byChapter.get(key) ?? 0) + 1);
  }
  return { bySubject, byChapter, total: qs.length };
}

/**
 * API-backed implementations of the public content data layer (API mode only).
 *
 * Every function here is a `"use cache"` function: public pages never fetch
 * uncached data (cacheComponents would fail the prerender), responses carry no
 * Authorization header, and the backend's `X-Cache-Tags` are copied into
 * Next's cache with `cacheTag` so `/api/revalidate/` can purge them.
 *
 * There is NO fixture fallback: an API failure throws, which surfaces as the
 * route error boundary (or serves the stale cached copy), never sample content.
 * The syllabus fixture is used ONLY as an editorial overlay (summaries, grades).
 */
import { cacheLife, cacheTag } from "next/cache";
import type { Chapter, ExamId, Question, QuestionCard, Solution, Subject, SubjectId } from "@/contracts";
import { chapters as chapterOverlay, subjects as subjectOverlay } from "@/fixtures/syllabus";
import { chapterSummary, practiceToCard, toChapters, toCounts, toQuestion, toQuestionCard, toSolution } from "@/lib/api/adapters/content";
import { examFromApi, examToApi, subjectFromApi } from "@/lib/api/adapters/ids";
import {
  practiceQuestions,
  publicChapter,
  publicExam,
  publicQuestion,
  publicSubject,
  related,
  sitemapQuestions,
  taxonomyExams,
  taxonomyTree,
} from "@/lib/api/public";
import type { PublicChapter, TaxonomyTree } from "@/lib/api/schemas";
import { EXAMS, TRACKS, TRACK_INFO, trackOf, type Track } from "@/lib/exams";

/** Taxonomy changes rarely; the operator purges `tax` by hand when it does. */
const TAXONOMY = { stale: 300, revalidate: 86_400, expire: 604_800 } as const;
/** Published content: purged by the backend webhook on publish/unpublish/edit. */
const CONTENT = { stale: 60, revalidate: 3_600, expire: 86_400 } as const;
/** Negative results (missing question) must flip quickly once published. */
const SHORT = { stale: 30, revalidate: 60, expire: 300 } as const;

const MAX_TAGS = 120;
const tagAll = (tags: string[]) => cacheTag("web", ...tags.slice(0, MAX_TAGS));

/** Hard cap on the question list that feeds generateStaticParams (plan 2.3). */
const STATIC_PARAM_CAP = 200;

/* ----------------------------------------------------------------------- *
 * Taxonomy
 * ----------------------------------------------------------------------- */

/** Active exams of the track, in TRACK_INFO order. Inactive exams are "no content". */
export async function apiExams(track: Track): Promise<ExamId[]> {
  "use cache";
  cacheLife(TAXONOMY);
  const r = await taxonomyExams();
  tagAll(r.tags);
  const active = new Set(r.data.filter((e) => e.is_active).map((e) => e.slug));
  return TRACK_INFO[track].exams.filter((e) => active.has(examToApi(e)));
}

async function apiTrees(track: Track): Promise<TaxonomyTree[]> {
  "use cache";
  cacheLife(TAXONOMY);
  const exams = await apiExams(track);
  const trees = await Promise.all(exams.map((e) => taxonomyTree(examToApi(e))));
  for (const t of trees) tagAll(t.tags);
  return trees.map((t) => t.data);
}

const tracksFor = (track?: Track): Track[] => (track ? [track] : TRACKS);

async function allTrees(track?: Track): Promise<TaxonomyTree[]> {
  return (await Promise.all(tracksFor(track).map(apiTrees))).flat();
}

export async function apiSubjects(track?: Track): Promise<Subject[]> {
  const out = new Map<SubjectId, Subject>();
  for (const tree of await allTrees(track)) {
    for (const s of tree.subjects) {
      const m = subjectFromApi(s.segment, s.name);
      if (!m || out.has(m.subject)) continue;
      const ov = subjectOverlay.find((x) => x.id === m.subject);
      // Botany/Zoology both surface as one "Biology" subject (chapters carry the group).
      out.set(m.subject, { id: m.subject, name: m.group ? (ov?.name ?? "Biology") : s.name, summary: ov?.summary ?? "" });
    }
  }
  return [...out.values()];
}

export async function apiChapters(filter: { subject?: SubjectId; track?: Track; exam?: ExamId }): Promise<Chapter[]> {
  const track = filter.track ?? (filter.exam ? EXAMS[filter.exam].track : undefined);
  const exams = filter.exam ? [filter.exam] : filter.track ? TRACK_INFO[filter.track].exams : null;
  const all = toChapters(await allTrees(track), chapterOverlay);
  return all.filter((c) => (!filter.subject || c.subject === filter.subject) && (!exams || c.exams.some((e) => exams.includes(e))));
}

/* ----------------------------------------------------------------------- *
 * Counts
 * ----------------------------------------------------------------------- */

type CountsEntries = { bySubject: [string, number][]; byChapter: [string, number][]; total: number };

async function apiCountsForTrack(track: Track): Promise<CountsEntries> {
  "use cache";
  cacheLife(CONTENT);
  const trees = await apiTrees(track);
  const exams = await Promise.all(trees.map((t) => publicExam(t.exam.slug)));
  const subjects = await Promise.all(trees.flatMap((t) => t.subjects.map((s) => publicSubject(s.slug))));
  for (const r of [...exams, ...subjects]) tagAll(r.tags);
  const c = toCounts(
    exams.map((r) => r.data),
    subjects.map((r) => r.data),
  );
  return { bySubject: [...c.bySubject], byChapter: [...c.byChapter], total: c.total };
}

export async function apiQuestionCounts(track?: Track) {
  const parts = await Promise.all(tracksFor(track).map(apiCountsForTrack));
  const bySubject = new Map<string, number>();
  const byChapter = new Map<string, number>();
  let total = 0;
  for (const p of parts) {
    for (const [k, v] of p.bySubject) bySubject.set(k, (bySubject.get(k) ?? 0) + v);
    for (const [k, v] of p.byChapter) byChapter.set(k, (byChapter.get(k) ?? 0) + v);
    total += p.total;
  }
  return { bySubject, byChapter, total };
}

/* ----------------------------------------------------------------------- *
 * Question lists
 * ----------------------------------------------------------------------- */

function cardsOf(page: PublicChapter): QuestionCard[] {
  const exam = examFromApi(page.exam.slug);
  const sub = subjectFromApi(page.subject.segment, page.subject.name);
  if (!exam || !sub) return [];
  return page.questions.map((q) => toQuestionCard(q, { exam, subject: sub.subject }));
}

/** One backend chapter's published questions (first 100). */
async function apiChapterCards(chapterSlug: string): Promise<QuestionCard[]> {
  "use cache";
  cacheLife(CONTENT);
  const r = await publicChapter(chapterSlug, { limit: 100 });
  tagAll(r.tags);
  return cardsOf(r.data);
}

export async function apiChapterQuestions(subject: SubjectId, chapter: string, track?: Track): Promise<QuestionCard[]> {
  const slugs: string[] = [];
  for (const tree of await allTrees(track)) {
    for (const s of tree.subjects) {
      if (subjectFromApi(s.segment, s.name)?.subject !== subject) continue;
      const c = s.chapters.find((x) => x.segment === chapter);
      if (c) slugs.push(c.slug);
    }
  }
  // One backend row per exam: a chapter shared by two exams of a track lists both rows.
  return (await Promise.all(slugs.map(apiChapterCards))).flat();
}

/** Published questions of one exam, capped (feeds generateStaticParams). */
async function apiExamCards(exam: ExamId): Promise<QuestionCard[]> {
  "use cache";
  cacheLife(CONTENT);
  const out: QuestionCard[] = [];
  let cursor: string | undefined;
  while (out.length < STATIC_PARAM_CAP) {
    const r = await practiceQuestions({ exam: examToApi(exam), limit: 50, cursor });
    tagAll(r.tags);
    out.push(...r.data.map(practiceToCard));
    cursor = r.meta?.page?.next_cursor ?? undefined;
    if (!cursor || r.data.length === 0) break;
  }
  return out.slice(0, STATIC_PARAM_CAP);
}

export async function apiPublicQuestions(track?: Track): Promise<QuestionCard[]> {
  const exams = (await Promise.all(tracksFor(track).map(apiExams))).flat();
  return (await Promise.all(exams.map(apiExamCards))).flat().slice(0, STATIC_PARAM_CAP);
}

/* ----------------------------------------------------------------------- *
 * Question page
 * ----------------------------------------------------------------------- */

export type QuestionPageResult =
  | { status: "ok"; question: Question; solution: Solution }
  | { status: "moved"; slug: string }
  | { status: "missing" };

export async function apiQuestionPage(slug: string): Promise<QuestionPageResult> {
  "use cache";
  const r = await publicQuestion(slug);
  if (r.status === "ok") {
    cacheLife(CONTENT);
    tagAll([...r.tags, `qslug-${slug}`]);
    return { status: "ok", question: toQuestion(r.data), solution: toSolution(r.data) };
  }
  cacheLife(SHORT);
  cacheTag("web", `qslug-${slug}`);
  return r;
}

export async function apiRelatedQuestions(slug: string, limit: number): Promise<QuestionCard[]> {
  "use cache";
  cacheLife(CONTENT);
  const page = await apiQuestionPage(slug);
  if (page.status !== "ok") return [];
  const q = page.question;
  const r = await related(slug, limit);
  tagAll([...r.tags, `qslug-${slug}`]);
  return r.data.map((s) => toQuestionCard(s, { exam: q.exams[0]!, subject: q.subject }));
}

/** Chapter summary from the backend description, else the editorial overlay. Null when the chapter is unknown. */
export async function apiChapterSummary(subject: SubjectId, chapter: string, track: Track): Promise<string | null> {
  "use cache";
  cacheLife(CONTENT);
  for (const tree of await apiTrees(track)) {
    for (const s of tree.subjects) {
      if (subjectFromApi(s.segment, s.name)?.subject !== subject) continue;
      const c = s.chapters.find((x) => x.segment === chapter);
      if (!c) continue;
      const r = await publicChapter(c.slug, { limit: 1 });
      tagAll(r.tags);
      return chapterSummary(r.data, chapterOverlay);
    }
  }
  return null;
}

/* ----------------------------------------------------------------------- *
 * Sitemap
 * ----------------------------------------------------------------------- */

export async function apiSitemapQuestions(): Promise<{ track: Track; slug: string; updatedAt: string | null }[]> {
  "use cache";
  cacheLife(CONTENT);
  const out: { track: Track; slug: string; updatedAt: string | null }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const r = await sitemapQuestions(cursor, 1000);
    tagAll([...r.tags, "sitemap"]);
    for (const e of r.data) {
      const exam = examFromApi(e.exam_slug);
      if (exam) out.push({ track: trackOf(exam), slug: e.slug, updatedAt: e.updated_at });
    }
    cursor = r.meta?.page?.next_cursor ?? undefined;
    if (!cursor || r.data.length === 0) break;
  }
  return out;
}

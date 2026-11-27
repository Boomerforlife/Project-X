import type { Track } from "@/lib/exams";

/**
 * One place for the app's URLs (UX audit 2026-11-28, section E). Public pages are the backbone: a chapter page is the
 * question list for everyone, PYQs live under /<track>/pyq/, and signed-in extras (Home, Notebook, Progress) sit beside
 * them. Use these helpers instead of hand-written strings so a route change is one edit.
 */

/** Year inside a paper slug such as `jee-main-2024-01-27-shift-1`; null when the slug has no year. */
export function paperYear(slug: string): number | null {
  const m = /(?:^|-)((?:19|20)\d{2})(?:-|$)/.exec(slug);
  return m ? Number(m[1]) : null;
}

/** `?next=` value: only same-site paths are accepted, anything else falls back. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

function withNext(path: string, next?: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

export const routes = {
  landing: "/",
  home: "/dashboard/",

  /** Practice home for everyone: subjects and chapters of an exam track. */
  practice: (track: Track = "jee") => `/${track}/`,
  subject: (track: Track, subject: string) => `/${track}/${subject}/`,
  chapter: (track: Track, subject: string, chapter: string) => `/${track}/${subject}/${chapter}/`,
  /** Chapter page with the Practise sheet open. `timed` preselects a timed test. */
  chapterPractise: (track: Track, subject: string, chapter: string, opts: { timed?: boolean } = {}) =>
    `/${track}/${subject}/${chapter}/?practise=1${opts.timed ? "&mode=timed" : ""}`,
  question: (track: Track, slug: string) => `/${track}/questions/${slug}/`,
  /** Cross-chapter library ("All questions"). */
  allQuestions: "/practice/",

  pyq: (track: Track = "jee") => `/${track}/pyq/`,
  pyqYear: (track: Track, year: number) => `/${track}/pyq/${year}/`,
  pyqPaper: (track: Track, year: number, slug: string) => `/${track}/pyq/${year}/${slug}/`,
  /** Paper page from just its slug (the year is part of every API paper slug); the PYQ hub when it isn't. */
  pyqPaperFromSlug: (track: Track, slug: string) => {
    const y = paperYear(slug);
    return y ? `/${track}/pyq/${y}/${slug}/` : `/${track}/pyq/`;
  },

  mistakes: "/mistakes/",
  bookmarks: "/bookmarks/",
  review: "/review/",
  progress: "/progress/",
  progressTests: "/progress/?tab=tests",
  leaderboard: "/leaderboard/",
  studyPlan: "/plan/",
  studyPlansInfo: "/study-plans/",
  account: "/account/",

  pricing: (next?: string | null) => withNext("/pricing/", next),
  login: (next?: string | null) => withNext("/login/", next),
  signup: (next?: string | null) => withNext("/signup/", next),

  session: (attemptId: string) => `/practice/session/?id=${encodeURIComponent(attemptId)}`,
  results: (attemptId: string) => `/results/?id=${encodeURIComponent(attemptId)}`,
  cbt: (attemptId: string) => `/cbt/?id=${encodeURIComponent(attemptId)}`,
} as const;

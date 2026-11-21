/**
 * Plain facts about the site for /about/ and /llms.txt: what is in it, counted from the API (never hardcoded or
 * rounded up). Search engines and AI assistants quote these pages, so every number here must be true today.
 */
import { getChapters, getPublicPapers, getQuestionCounts, getSubjects } from "@/lib/data";
import { EXAMS, TRACK_INFO, TRACKS, type Track } from "@/lib/exams";
import { isChapterIndexable } from "@/lib/indexing";

export type TrackFacts = {
  track: Track;
  name: string;
  questions: number;
  subjects: { id: string; name: string; questions: number }[];
  chapters: { subject: string; slug: string; name: string; questions: number }[];
  /** Previous-year papers per exam ("JEE Main": 57 papers, 2019-2026). */
  papers: { exam: string; count: number; from: number | null; to: number | null }[];
};

export async function trackFacts(track: Track): Promise<TrackFacts> {
  const [subjects, chapters, counts, papers] = await Promise.all([
    getSubjects(track),
    getChapters({ track }),
    getQuestionCounts(track),
    getPublicPapers({ track, kind: "pyq" }),
  ]);
  const byExam = new Map<string, number[]>();
  for (const p of papers) byExam.set(p.exam, [...(byExam.get(p.exam) ?? []), ...(p.year != null ? [p.year] : [])]);
  const paperFacts = [...byExam].map(([exam, ys]) => ({
    exam: EXAMS[exam as keyof typeof EXAMS]?.name ?? exam,
    count: papers.filter((p) => p.exam === exam).length,
    from: ys.length ? Math.min(...ys) : null,
    to: ys.length ? Math.max(...ys) : null,
  }));
  return {
    track,
    name: TRACK_INFO[track].name,
    questions: counts.total,
    subjects: subjects.map((s) => ({ id: s.id, name: s.name, questions: counts.bySubject.get(s.id) ?? 0 })),
    chapters: chapters
      .map((c) => ({ subject: c.subject, slug: c.slug, name: c.name, questions: counts.byChapter.get(`${c.subject}/${c.slug}`) ?? 0 }))
      .filter((c) => isChapterIndexable(c.questions)),
    papers: paperFacts,
  };
}

/** Facts for every track that has content today (an inactive exam is left out instead of announced). */
export async function brandFacts(): Promise<TrackFacts[]> {
  const all = await Promise.all(TRACKS.map((t) => trackFacts(t).catch(() => null)));
  return all.filter((f): f is TrackFacts => f !== null && f.questions > 0);
}

export const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * Fixture-backed catalog (mock mode, and the flagged paper demo in API mode).
 * Imported ONLY through the guarded `require` in ./catalog.ts so that API-mode
 * client bundles never contain the fixture bank or its solutions.
 */
import type { Chapter, ExamId, Hint, Paper, Question, Solution, Subject, SubjectId } from "@/contracts";
import { getBank } from "@/fixtures/bank";
import { getDemoPapers } from "@/fixtures/papers";
import { chapters as chapterFx, subjects as subjectFx } from "@/fixtures/syllabus";
import { EXAMS, TRACK_INFO, type Track } from "@/lib/exams";

type Index = {
  qById: Map<string, Question>;
  solById: Map<string, Solution>;
  hintById: Map<string, Hint>;
  paperById: Map<string, Paper>;
  papers: Paper[];
};

let index: Index | null = null;
function idx(): Index {
  if (index) return index;
  const bank = getBank();
  const papers = getDemoPapers();
  index = {
    qById: new Map(bank.questions.map((q) => [q.id, q])),
    solById: new Map(bank.solutions.map((s) => [s.questionId, s])),
    hintById: new Map(bank.hints.map((h) => [h.questionId, h])),
    paperById: new Map(papers.map((p) => [p.id, p])),
    papers,
  };
  return index;
}

export const mockCatalog = {
  subjects(): Subject[] {
    return subjectFx;
  },
  subject(id: string): Subject | null {
    return subjectFx.find((s) => s.id === id) ?? null;
  },
  subjectsForTrack(track: Track): Subject[] {
    return TRACK_INFO[track].subjects.map((id) => subjectFx.find((s) => s.id === id)!);
  },
  subjectsForExam(exam: ExamId): Subject[] {
    return EXAMS[exam].subjects.map((id) => subjectFx.find((s) => s.id === id)!);
  },
  chapters(filter: { subject?: SubjectId; exam?: ExamId; track?: Track } = {}): Chapter[] {
    const exams = filter.exam ? [filter.exam] : filter.track ? TRACK_INFO[filter.track].exams : null;
    return chapterFx.filter(
      (c) => (!filter.subject || c.subject === filter.subject) && (!exams || c.exams.some((e) => exams.includes(e))),
    );
  },
  chapter(subject: string, slug: string): Chapter | null {
    return chapterFx.find((c) => c.subject === subject && c.slug === slug) ?? null;
  },
  questions(filter: { subject?: SubjectId; chapter?: string; exam?: ExamId; track?: Track } = {}): Question[] {
    const exams = filter.exam ? [filter.exam] : filter.track ? TRACK_INFO[filter.track].exams : null;
    return getBank().questions.filter(
      (q) =>
        (!filter.subject || q.subject === filter.subject) &&
        (!filter.chapter || q.chapter === filter.chapter) &&
        (!exams || q.exams.some((e) => exams.includes(e))),
    );
  },
  question(id: string): Question | null {
    return idx().qById.get(id) ?? null;
  },
  questionsByIds(ids: string[]): Question[] {
    const m = idx().qById;
    return ids.map((id) => m.get(id)).filter((q): q is Question => Boolean(q));
  },
  /** Learning mode and post-submission review only. */
  solution(questionId: string): Solution | null {
    return idx().solById.get(questionId) ?? null;
  },
  hint(questionId: string): Hint | null {
    return idx().hintById.get(questionId) ?? null;
  },
  papers(filter: { exam?: ExamId; track?: Track; kind?: "pyq" | "mock" } = {}): Paper[] {
    const exams = filter.exam ? [filter.exam] : filter.track ? TRACK_INFO[filter.track].exams : null;
    return idx().papers.filter((p) => (!exams || exams.includes(p.exam)) && (!filter.kind || p.kind === filter.kind));
  },
  paper(id: string): Paper | null {
    return idx().paperById.get(id) ?? null;
  },
  chapterCounts(exam?: ExamId): Map<string, number> {
    const m = new Map<string, number>();
    for (const q of getBank().questions) {
      if (exam && !q.exams.includes(exam)) continue;
      const k = `${q.subject}/${q.chapter}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  },
  /** Number of questions available for a selection (mock: counted from the bank). */
  questionCount(filter: { subject?: SubjectId; chapter?: string; exam?: ExamId } = {}): number {
    return mockCatalog.questions(filter).length;
  },
};

export type Catalog = typeof mockCatalog;

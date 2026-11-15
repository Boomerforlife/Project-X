/**
 * Content catalog — synchronous, mock-backed, safe to import from client
 * components (the practice player and CBT need question data in the browser).
 *
 * When Person 2's API lands, this module is replaced by API calls through the
 * shared client; screens only use the functions exported here.
 */
import type { Chapter, ExamId, Hint, Paper, Question, Solution, Subject, SubjectId } from "@/contracts";
import { getBank } from "@/fixtures/bank";
import { getDemoPapers } from "@/fixtures/papers";
import { chapters as chapterFx, subjects as subjectFx } from "@/fixtures/syllabus";
import { EXAMS, TRACK_INFO, type Track } from "@/lib/exams";
import { flags } from "@/lib/api/env";
import { registry } from "@/lib/session/registry";
import { DATA_SOURCE } from "@/lib/site";

/** API mode: content comes only from the client registry (taxonomy + server-delivered questions). */
const API = DATA_SOURCE === "api";
const PAPERS = !API || flags.papers === "demo";

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

const apiExams = (filter: { exam?: ExamId; track?: Track }): ExamId[] =>
  filter.exam ? [filter.exam] : filter.track ? TRACK_INFO[filter.track].exams : registry.exams();

const mockCatalog = {
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

/** API-mode catalog: reads the registry; fixtures only for the flagged paper demo. */
const apiCatalog: typeof mockCatalog = {
  subjects: () => registry.allSubjects(),
  subject: (id) => registry.allSubjects().find((s) => s.id === id) ?? null,
  subjectsForTrack: (track) => registry.allSubjects().filter((s) => TRACK_INFO[track].subjects.includes(s.id)),
  subjectsForExam: (exam) => {
    const t = registry.taxExam(exam);
    return registry.allSubjects().filter((s) => t?.subjects.some((x) => x.id === s.id));
  },
  chapters: (filter = {}) =>
    apiExams(filter).flatMap((e) =>
      (registry.taxExam(e)?.chapters ?? []).map((c) => c.chapter).filter((c) => !filter.subject || c.subject === filter.subject),
    ),
  chapter: (subject, slug) => {
    for (const e of registry.exams()) {
      const c = registry.taxExam(e)?.chapters.find((x) => x.chapter.subject === subject && x.chapter.slug === slug);
      if (c) return c.chapter;
    }
    return null;
  },
  questions: () => [],
  question: (id) => registry.getQuestion(id) ?? (PAPERS ? mockCatalog.question(id) : null),
  questionsByIds: (ids) => ids.map((id) => apiCatalog.question(id)).filter((q): q is Question => Boolean(q)),
  /** Revealed only after the server returned an attempt result for the question. */
  solution: (id) => registry.getSolution(id) ?? (PAPERS && !registry.getQuestion(id) ? mockCatalog.solution(id) : null),
  hint: () => null,
  papers: (f = {}) => (PAPERS ? mockCatalog.papers(f) : []),
  paper: (id) => (PAPERS ? mockCatalog.paper(id) : null),
  chapterCounts(exam) {
    const m = new Map<string, number>();
    for (const e of exam ? [exam] : registry.exams()) {
      for (const c of registry.taxExam(e)?.chapters ?? []) {
        const k = `${c.chapter.subject}/${c.chapter.slug}`;
        m.set(k, (m.get(k) ?? 0) + c.count);
      }
    }
    return m;
  },
  questionCount({ exam, subject, chapter } = {}) {
    let n = 0;
    for (const [k, v] of apiCatalog.chapterCounts(exam)) {
      const [s, c] = k.split("/");
      if ((!subject || s === subject) && (!chapter || c === chapter)) n += v;
    }
    return n;
  },
};

export const catalog: typeof mockCatalog = API ? apiCatalog : mockCatalog;

/**
 * Content catalog — synchronous, safe to import from client components (the
 * practice player and CBT need question data in the browser).
 *
 * Mock mode: backed by the fixtures in ./catalog.mock.
 * API mode: backed only by the client registry (taxonomy + server-delivered
 * questions). The fixture module is loaded through a dynamic import guarded by
 * build-time constants, so API-mode client bundles do not contain the fixture bank
 * or its solutions (the import is only live when the demo-papers flag is on).
 */
import type { Question, Solution } from "@/contracts";
import { TRACK_INFO, type Track } from "@/lib/exams";
import { flags } from "@/lib/api/env";
import { registry } from "@/lib/session/registry";
import { DATA_SOURCE } from "@/lib/site";
import type { Catalog } from "./catalog.mock";
import type { ExamId } from "@/contracts";

const API = DATA_SOURCE === "api";
const PAPERS = !API || flags.papers === "demo";

/**
 * Lazy fixture catalog. The condition is written inline in terms of literal
 * NEXT_PUBLIC_* reads so the bundler can drop the `require` (and the whole fixture
 * module graph) from API builds that do not enable the paper demo.
 */
const fixtures: Catalog | null =
  process.env.NEXT_PUBLIC_DATA_SOURCE !== "api" ||
  !process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_FEATURE_PAPERS === "demo"
    ? (await import("./catalog.mock")).mockCatalog
    : null;

function mock(): Catalog {
  if (!fixtures) throw new Error("Fixture catalog is not available in API mode");
  return fixtures;
}

const apiExams = (filter: { exam?: ExamId; track?: Track }): ExamId[] =>
  filter.exam ? [filter.exam] : filter.track ? TRACK_INFO[filter.track].exams : registry.exams();

/** API-mode catalog: reads the registry; fixtures only for the flagged paper demo. */
const apiCatalog: Catalog = {
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
  question: (id) => registry.getQuestion(id) ?? (PAPERS ? mock().question(id) : null),
  questionsByIds: (ids) => ids.map((id) => apiCatalog.question(id)).filter((q): q is Question => Boolean(q)),
  /** Revealed only after the server returned an attempt result for the question. */
  solution: (id): Solution | null => registry.getSolution(id) ?? (PAPERS && !registry.getQuestion(id) ? mock().solution(id) : null),
  hint: () => null,
  papers: (f = {}) => (PAPERS ? mock().papers(f) : []),
  paper: (id) => (PAPERS ? mock().paper(id) : null),
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

export const catalog: Catalog = API ? apiCatalog : mock();
// Note: `fixtures` uses top-level await, so modules importing `catalog` evaluate after it resolves.

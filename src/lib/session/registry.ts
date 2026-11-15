"use client";

/**
 * Client registry for API mode (docs/INTEGRATION_PLAN.md 2.4): everything the
 * synchronous `catalog` needs to answer from memory. Filled by taxonomy loads,
 * session loads, attempt results and bookmark/mistake lists. Never holds fixture
 * data; never holds a solution before the server has revealed it.
 */
import type { QuestionSummary, TaxonomyTree } from "@projectx/contracts";
import type { Chapter, ExamId, Question, Solution, Subject, SubjectId } from "@/contracts";
import { difficultyFromApi, examFromApi, subjectFromApi, typeFromApi } from "@/lib/api/adapters/ids";
import { chapters as chapterOverlay, subjects as subjectOverlay } from "@/fixtures/syllabus";
import { safeExcerpt } from "@/lib/api/adapters/blocks";
import { pub } from "./client";

export type TaxChapter = { chapter: Chapter; apiSlug: string; subjectApiSlug: string; count: number };
export type TaxExam = {
  exam: ExamId;
  apiSlug: string;
  subjects: { id: SubjectId; apiSlug: string; name: string }[];
  chapters: TaxChapter[];
};
export type ServerOutcome = { isCorrect: boolean; score: string };

const taxonomy = new Map<ExamId, TaxExam>();
const questions = new Map<string, Question>();
const solutions = new Map<string, Solution>();
const outcomes = new Map<string, ServerOutcome>();
const chapterByApi = new Map<string, { exam: ExamId; subject: SubjectId; chapter: string }>();
let taxonomyLoaded: "no" | "loading" | "yes" | "error" = "no";
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

export const registry = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  version: () => version,
  taxonomyStatus: () => taxonomyLoaded,
  clear() {
    taxonomy.clear();
    questions.clear();
    solutions.clear();
    outcomes.clear();
    chapterByApi.clear();
    taxonomyLoaded = "no";
    bump();
  },

  /* ---- questions / solutions / outcomes ---- */
  putQuestion(q: Question) {
    questions.set(q.id, q);
  },
  putQuestions(qs: Question[]) {
    qs.forEach((q) => questions.set(q.id, q));
    bump();
  },
  getQuestion: (id: string) => questions.get(id) ?? null,
  putSolution(s: Solution) {
    solutions.set(s.questionId, s);
  },
  getSolution: (id: string) => solutions.get(id) ?? null,
  putOutcome(key: string, o: ServerOutcome) {
    outcomes.set(key, o);
  },
  outcome: (key: string) => outcomes.get(key) ?? null,
  touch: bump,

  /** Lightweight stub for list screens (bookmarks, mistakes): excerpt as stem, no options. */
  stubFromSummary(s: QuestionSummary): Question {
    const hit = chapterByApi.get(s.chapter.slug);
    const exam = hit?.exam ?? "jee-main";
    const existing = questions.get(s.id);
    if (existing && existing.options.length) return existing;
    const q: Question = {
      id: s.id,
      slug: s.slug,
      exams: [exam],
      subject: hit?.subject ?? "physics",
      chapter: hit?.chapter ?? s.chapter.segment,
      topic: s.topic?.segment,
      type: typeFromApi(s.question_type),
      stem: safeExcerpt(s.excerpt),
      assets: [],
      options: [],
      difficulty: difficultyFromApi(s.difficulty),
      source: s.origin === "PYQ" ? { kind: "pyq", exam, year: s.year ?? 0, session: null, date: null, shift: null } : { kind: "original" },
      verification: { status: "processed" },
      hasSolution: true,
      publicPage: true,
    };
    questions.set(q.id, q);
    return q;
  },

  /* ---- taxonomy ---- */
  exams: () => [...taxonomy.keys()],
  taxExam: (e: ExamId) => taxonomy.get(e) ?? null,
  allSubjects(): Subject[] {
    const seen = new Map<SubjectId, Subject>();
    for (const t of taxonomy.values()) {
      for (const s of t.subjects) {
        if (!seen.has(s.id)) seen.set(s.id, { id: s.id, name: s.id === "biology" ? "Biology" : s.name, summary: subjectOverlay.find((x) => x.id === s.id)?.summary ?? "" });
      }
    }
    return [...seen.values()];
  },
  chapterLookup: (apiSlug: string) => chapterByApi.get(apiSlug) ?? null,
  apiChapter(exam: ExamId, subject: SubjectId, slug: string) {
    return taxonomy.get(exam)?.chapters.find((c) => c.chapter.subject === subject && c.chapter.slug === slug) ?? null;
  },
  apiSubject(exam: ExamId, subject: SubjectId) {
    return taxonomy.get(exam)?.subjects.find((s) => s.id === subject) ?? null;
  },

  async loadTaxonomy(force = false): Promise<void> {
    if (taxonomyLoaded === "yes" && !force) return;
    if (taxonomyLoaded === "loading") return;
    taxonomyLoaded = "loading";
    try {
      const apiExams = await pub.exams();
      const next = new Map<ExamId, TaxExam>();
      await Promise.all(
        apiExams
          .filter((e) => e.is_active && examFromApi(e.slug))
          .map(async (e) => {
            const exam = examFromApi(e.slug)!;
            const tree = await pub.tree(e.slug);
            const built = buildExam(exam, tree);
            // Question counts per chapter come from the public subject endpoints.
            await Promise.all(
              built.subjects.map(async (s) => {
                try {
                  const sub = await pub.subject(s.apiSlug);
                  for (const c of sub.chapters) {
                    const tc = built.chapters.find((x) => x.apiSlug === c.slug);
                    if (tc) tc.count = c.published_question_count;
                  }
                } catch {
                  /* counts are best-effort; chapters still list */
                }
              }),
            );
            next.set(exam, built);
          }),
      );
      taxonomy.clear();
      chapterByApi.clear();
      for (const [k, v] of next) {
        taxonomy.set(k, v);
        for (const c of v.chapters) chapterByApi.set(c.apiSlug, { exam: k, subject: c.chapter.subject, chapter: c.chapter.slug });
      }
      taxonomyLoaded = "yes";
    } catch (e) {
      taxonomyLoaded = "error";
      bump();
      throw e;
    }
    bump();
  },
};

export function buildExam(exam: ExamId, tree: TaxonomyTree): TaxExam {
  const subjects: TaxExam["subjects"] = [];
  const chapters: TaxChapter[] = [];
  for (const s of tree.subjects) {
    const m = subjectFromApi(s.segment, s.name);
    if (!m) continue;
    subjects.push({ id: m.subject, apiSlug: s.slug, name: s.name });
    for (const c of s.chapters) {
      const overlay = chapterOverlay.find((o) => o.subject === m.subject && o.slug === c.segment);
      chapters.push({
        apiSlug: c.slug,
        subjectApiSlug: s.slug,
        count: 0,
        chapter: {
          slug: c.segment,
          name: c.name,
          subject: m.subject,
          exams: [exam],
          group: m.group,
          grade: overlay?.grade,
          summary: overlay?.summary ?? "",
          topics: c.topics.map((t) => ({ slug: t.segment, name: t.name })),
        },
      });
    }
  }
  return { exam, apiSlug: tree.exam.slug, subjects, chapters };
}

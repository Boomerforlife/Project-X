import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Chapter, Question, Solution, Subject } from "@/contracts";
import { chapters as chapterFx, subjects as subjectFx } from "@/fixtures/syllabus";
import {
  envelope,
  PracticeQuestionSchema,
  PublicChapterSchema,
  PublicExamSchema,
  PublicQuestionSchema,
  PublicSubjectSchema,
  QuestionSummarySchema,
  SitemapEntrySchema,
  TaxonomyExamSchema,
  TaxonomyTreeSchema,
} from "../schemas";
import { blocksToRichText, imageAssets, safeExcerpt } from "./blocks";
import { chapterSummary, practiceToCard, toChapters, toCounts, toQuestion, toQuestionCard, toSolution, toSubject } from "./content";
import { difficultyFromApi, examFromApi, examToApi, subjectFromApi, typeFromApi, typeToApi } from "./ids";

const load = <S extends z.ZodType>(file: string, schema: S): z.output<S> => {
  const json = JSON.parse(readFileSync(resolve(__dirname, "../__fixtures__", file), "utf8"));
  return (envelope(schema).parse(json) as { data: z.output<S> }).data;
};

describe("ids", () => {
  it("maps neet <-> neet-ug and rejects unknown exams", () => {
    expect(examToApi("neet")).toBe("neet-ug");
    expect(examFromApi("neet-ug")).toBe("neet");
    expect(examFromApi("jee-main")).toBe("jee-main");
    expect(examFromApi("gate")).toBeNull();
  });
  it("maps botany/zoology to biology with a group", () => {
    expect(subjectFromApi("botany", "Botany")).toEqual({ subject: "biology", group: "Botany" });
    expect(subjectFromApi("zoology", "Zoology")).toEqual({ subject: "biology", group: "Zoology" });
    expect(subjectFromApi("physics", "Physics")).toEqual({ subject: "physics" });
    expect(subjectFromApi("geography")).toBeNull();
  });
  it("maps question types and difficulty", () => {
    expect(typeFromApi("MULTI_MCQ")).toBe("multiple_correct");
    expect(typeToApi("numerical")).toBe("NUMERICAL");
    expect(difficultyFromApi("HARD")).toBe("hard");
    expect(difficultyFromApi(null)).toBeUndefined();
  });
});

describe("blocks", () => {
  it("serializes blocks to RichText", () => {
    const text = blocksToRichText([
      { type: "paragraph", text: "Find $x$." },
      { type: "math", latex: "x^2=4" },
      { type: "list", ordered: true, items: ["a", "b"] },
      { type: "table", header: ["h1", "h2"], rows: [["1", "2"]] },
      { type: "image", asset_id: "d1000000-0000-4000-8000-000000000001", alt: "fig", url: "https://x.test/a.png", width: 10, height: 20 },
    ]);
    expect(text).toBe("Find $x$.\n\n$$x^2=4$$\n\n1. a\n2. b\n\nh1\th2\n1\t2");
  });
  it("only keeps images with known dimensions as assets", () => {
    const base = { type: "image" as const, asset_id: "d1000000-0000-4000-8000-000000000001", alt: "fig", url: "https://x.test/a.png" };
    const assets = imageAssets([
      { ...base, width: 10, height: 20 },
      { ...base, width: null, height: null },
    ]);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ width: 10, height: 20, alt: "fig" });
  });
  it("drops an unterminated math span from excerpts", () => {
    expect(safeExcerpt("A particle moves $x = v")).toBe("A particle moves…");
    expect(safeExcerpt("Cost is \\$5 and $x$ ok")).toBe("Cost is \\$5 and $x$ ok");
    expect(safeExcerpt("plain")).toBe("plain");
  });
});

describe("content adapters on recorded API fixtures", () => {
  it("fixtures parse with the contract schemas", () => {
    load("exams.json", z.array(TaxonomyExamSchema));
    load("tree-jee-main.json", TaxonomyTreeSchema);
    load("exam-jee-main.json", PublicExamSchema);
    load("subject-jee-main-physics.json", PublicSubjectSchema);
    load("chapter-kinematics.json", PublicChapterSchema);
    load("question-demo.json", PublicQuestionSchema);
    load("related.json", z.array(QuestionSummarySchema));
    load("practice-list.json", z.array(PracticeQuestionSchema));
    expect(SitemapEntrySchema.parse({ canonical_path: "/questions/a", slug: "a", exam_slug: "jee-main", updated_at: "2026-01-01T00:00:00.000Z" }).exam_slug).toBe("jee-main");
  });

  it("toQuestion produces a valid frontend Question", () => {
    const q = toQuestion(load("question-demo.json", PublicQuestionSchema));
    expect(() => Question.parse(q)).not.toThrow();
    expect(q.exams).toEqual(["jee-main"]);
    expect(q.subject).toBe("physics");
    expect(q.type).toBe("single_correct");
    expect(q.options.map((o) => o.id)).toEqual(["A", "B", "C", "D"]);
    expect(q.options[0]?.ref).toMatch(/^[0-9a-f-]{36}$/);
    expect(q.verification.status).toBe("human_reviewed");
    expect(q.source).toEqual({ kind: "original" });
    expect(q.publicPage).toBe(true);
    expect(q.indexable).toBe(true);
    expect(q.stem).toContain("particle");
  });

  it("toSolution maps the single answer to the option label", () => {
    const pq = load("question-demo.json", PublicQuestionSchema);
    const s = toSolution(pq);
    expect(() => Solution.parse(s)).not.toThrow();
    expect(s.answer).toEqual({ type: "single_correct", optionId: "B" });
    expect(s.answerProvenance).toBe("derived");
    expect(s.verification.status).toBe("human_reviewed");
    expect(s.steps.length).toBeGreaterThan(0);
  });

  it("falls back to uuid-to-label when correct_labels is missing and maps numerical answers", () => {
    const pq = load("question-demo.json", PublicQuestionSchema);
    const noLabels = structuredClone(pq);
    if (noLabels.solution.final_answer.type === "SINGLE_MCQ") delete noLabels.solution.final_answer.correct_labels;
    expect(toSolution(noLabels).answer).toEqual({ type: "single_correct", optionId: "B" });

    const num = structuredClone(pq);
    num.solution.final_answer = { type: "NUMERICAL", accepted_ranges: [{ min: "9.9", max: "10.1" }], display_value: "10" };
    num.question_type = "NUMERICAL";
    const a = toSolution(num).answer;
    expect(a).toEqual({ type: "numerical", value: 10, tolerance: 0, display: "10" });
  });

  it("official key matched maps to official_key provenance", () => {
    const pq = structuredClone(load("question-demo.json", PublicQuestionSchema));
    pq.verification = { status: "OFFICIAL_KEY_MATCHED", label: "x" };
    pq.solution.provenance = "OFFICIAL";
    const s = toSolution(pq);
    expect(s.answerProvenance).toBe("official_key");
    expect(s.generatedBy).toBe("official");
    expect(toQuestion(pq).verification.status).toBe("official_key_checked");
  });

  it("PYQ source keeps nullable paper parts and noindex follows seo.robots", () => {
    const pq = structuredClone(load("question-demo.json", PublicQuestionSchema));
    pq.attribution = {
      ...pq.attribution,
      origin: "PYQ",
      paper: { slug: "p", title: "P", year: 2024, session_label: null, exam_date: null, shift: null, paper_code: null },
    };
    pq.seo.robots = "noindex,follow";
    const q = toQuestion(pq);
    expect(q.source).toEqual({ kind: "pyq", exam: "jee-main", year: 2024, session: null, date: null, shift: null });
    expect(q.indexable).toBe(false);
    expect(() => Question.parse(q)).not.toThrow();
  });

  it("toChapters unions the tree with the editorial overlay", () => {
    const tree = load("tree-jee-main.json", TaxonomyTreeSchema);
    const chapters = toChapters([tree], chapterFx);
    expect(chapters.length).toBeGreaterThan(0);
    expect(() => z.array(Chapter).parse(chapters)).not.toThrow();
    const kin = chapters.find((c) => c.slug === "kinematics");
    expect(kin).toMatchObject({ subject: "physics", exams: ["jee-main"] });
    expect(kin?.grade).toBe(11);
    // a chapter with no overlay entry gets no grade and an empty summary
    const none = toChapters([tree], []);
    expect(none[0]?.grade).toBeUndefined();
    expect(none[0]?.summary).toBe("");
  });

  it("toChapters merges the same chapter across exams", () => {
    const tree = load("tree-jee-main.json", TaxonomyTreeSchema);
    const adv = structuredClone(tree);
    adv.exam = { ...adv.exam, slug: "jee-advanced" };
    const merged = toChapters([tree, adv], chapterFx);
    expect(merged.find((c) => c.slug === "kinematics")?.exams).toEqual(["jee-main", "jee-advanced"]);
    expect(merged).toHaveLength(toChapters([tree], chapterFx).length);
  });

  it("toSubject uses the overlay summary", () => {
    const s = toSubject("physics", "Physics", subjectFx);
    expect(() => Subject.parse(s)).not.toThrow();
    expect(s.summary.length).toBeGreaterThan(10);
    expect(toSubject("physics", "Physics", []).summary).toBe("");
  });

  it("chapterSummary prefers description, then overlay", () => {
    const page = structuredClone(load("chapter-kinematics.json", PublicChapterSchema));
    page.chapter.description = null;
    expect(chapterSummary(page, chapterFx)).toBe(chapterFx.find((c) => c.slug === "kinematics")?.summary);
    page.chapter.description = "From API";
    expect(chapterSummary(page, chapterFx)).toBe("From API");
  });

  it("toCounts builds subject and chapter counts", () => {
    const counts = toCounts([load("exam-jee-main.json", PublicExamSchema)], [load("subject-jee-main-physics.json", PublicSubjectSchema)]);
    const exam = load("exam-jee-main.json", PublicExamSchema);
    expect(counts.total).toBe(exam.subjects.reduce((n, s) => n + s.published_question_count, 0));
    expect(counts.bySubject.get("physics")).toBe(exam.subjects.find((s) => s.segment === "physics")?.published_question_count);
    expect(counts.byChapter.get("physics/kinematics")).toBeGreaterThan(0);
  });

  it("toQuestionCard maps summaries with the list context", () => {
    const page = load("chapter-kinematics.json", PublicChapterSchema);
    const card = toQuestionCard(page.questions[0]!, { exam: "jee-main", subject: "physics" });
    expect(card).toMatchObject({ exams: ["jee-main"], subject: "physics", chapter: "kinematics", publicPage: true });
    expect(card.stem.length).toBeGreaterThan(0);
  });

  it("practiceToCard maps practice questions", () => {
    const list = load("practice-list.json", z.array(PracticeQuestionSchema));
    const card = practiceToCard(list[0]!);
    expect(card.exams).toEqual(["jee-main"]);
    expect(card.stem.length).toBeLessThanOrEqual(201);
  });
});

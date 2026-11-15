import { describe, expect, it } from "vitest";
import type { PracticeQuestion, PublicSolution } from "@projectx/contracts";
import { PracticeQuestionSchema, AttemptResultSchema } from "@projectx/contracts";
import { fromAnswerResponse, isValidDecimal, toAnswerResponse, toQuestion, toSolution } from "./convert";
import { buildExam } from "./registry";
import { deleteDraft, newClientId, readDraft, writeDraft } from "./drafts";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const exam = { id: U(1), slug: "jee-main", name: "JEE Main", short_name: "Main" };
const subject = { id: U(2), slug: "jee-main-physics", segment: "physics", name: "Physics", code: "PHYSICS" as const };
const chapter = { id: U(3), slug: "jee-main-physics-kinematics", segment: "kinematics", name: "Kinematics", unit_number: 1 };

const pq: PracticeQuestion = {
  id: U(10),
  slug: "q-one",
  question_type: "SINGLE_MCQ",
  difficulty: "EASY",
  marks: "4",
  negative_marks: "1",
  content: [{ type: "paragraph", text: "Find $v$." }],
  options: [
    { id: U(21), label: "A", content: [{ type: "paragraph", text: "1" }] },
    { id: U(22), label: "B", content: [{ type: "paragraph", text: "2" }] },
  ],
  exam,
  subject,
  chapter,
  topic: null,
  attribution: { origin: "EDITORIAL", year: null, paper_title: null },
};

describe("practice question conversion", () => {
  it("round-trips the contract schema", () => {
    expect(PracticeQuestionSchema.safeParse(pq).success).toBe(true);
  });

  it("maps option labels to ids and refs without computing any answer", () => {
    const q = toQuestion(pq);
    expect(q.type).toBe("single_correct");
    expect(q.subject).toBe("physics");
    expect(q.chapter).toBe("kinematics");
    expect(q.options.map((o) => [o.id, o.ref])).toEqual([
      ["A", U(21)],
      ["B", U(22)],
    ]);
    expect(q.stem).toBe("Find $v$.");
    expect(q.verification.status).toBe("processed"); // placeholder, never rendered in API mode
  });

  it("sends option uuids for single, multi and a validated decimal for numerical", () => {
    const q = toQuestion(pq);
    expect(toAnswerResponse(q, { optionIds: ["B"] })).toEqual({ type: "SINGLE_MCQ", option_id: U(22) });
    const multi = { ...q, type: "multiple_correct" as const };
    expect(toAnswerResponse(multi, { optionIds: ["A", "B", "A"] })).toEqual({ type: "MULTI_MCQ", option_ids: [U(21), U(22)] });
    const num = { ...q, type: "numerical" as const, options: [] };
    expect(toAnswerResponse(num, { value: "-2.5" })).toEqual({ type: "NUMERICAL", value: "-2.5" });
    expect(toAnswerResponse(num, { value: "1e3" })).toBeNull();
    expect(toAnswerResponse(num, { value: "." })).toBeNull();
    expect(toAnswerResponse(q, { optionIds: ["Z"] })).toBeNull();
  });

  it("maps stored responses back to labels", () => {
    const q = toQuestion(pq);
    expect(fromAnswerResponse(q, { type: "SINGLE_MCQ", option_id: U(21) })).toEqual({ optionIds: ["A"] });
    expect(fromAnswerResponse(q, { type: "NUMERICAL", value: "3" })).toEqual({ value: "3" });
  });

  it("validates decimals the way the API does", () => {
    for (const ok of ["0", "-1", "12.50"]) expect(isValidDecimal(ok)).toBe(true);
    for (const bad of ["", " ", "1.", ".5", "1,5", "abc", "--1"]) expect(isValidDecimal(bad)).toBe(false);
  });
});

describe("solution conversion (server answer only)", () => {
  const base = {
    id: U(30),
    version: 1,
    summary: null,
    steps: [{ index: 1, title: null, blocks: [{ type: "paragraph" as const, text: "Because." }] }],
    formulas: [],
    concepts: [],
    alternatives: [],
    shortcuts: [],
    common_mistakes: [],
    approved_at: null,
  };
  it("single answer uses the server label and never claims an official key", () => {
    const q = toQuestion(pq);
    const sol = toSolution(q, { ...base, provenance: "AI_GENERATED", final_answer: { type: "SINGLE_MCQ", correct_option_ids: [U(22)], correct_labels: ["B"] } } as PublicSolution);
    expect(sol.answer).toEqual({ type: "single_correct", optionId: "B" });
    expect(sol.answerProvenance).toBe("unknown");
    expect(sol.generatedBy).toBe("ai");
    expect(sol.steps[0]).toMatchObject({ body: "Because." });
  });
  it("falls back to option refs when labels are missing; numerical keeps the display string", () => {
    const q = toQuestion(pq);
    const s1 = toSolution(q, { ...base, provenance: "OFFICIAL", final_answer: { type: "SINGLE_MCQ", correct_option_ids: [U(21)] } } as PublicSolution);
    expect(s1.answer).toEqual({ type: "single_correct", optionId: "A" });
    expect(s1.generatedBy).toBe("official");
    const s2 = toSolution({ ...q, type: "numerical" }, { ...base, provenance: "HUMAN_AUTHORED", final_answer: { type: "NUMERICAL", accepted_ranges: [{ min: "2", max: "2" }], display_value: "2.50" } } as PublicSolution);
    expect(s2.answer).toMatchObject({ type: "numerical", value: 2.5, display: "2.50" });
  });
  it("AttemptResult schema accepts the practice contract shape", () => {
    const ok = AttemptResultSchema.safeParse({
      attempt_id: U(40),
      question_id: pq.id,
      is_correct: false,
      score: "-1",
      correct_answer: { type: "SINGLE_MCQ", correct_option_ids: [U(22)], correct_labels: ["B"] },
      solution: { ...base, provenance: "AI_GENERATED", final_answer: { type: "SINGLE_MCQ", correct_option_ids: [U(22)], correct_labels: ["B"] } },
      submitted_at: "2026-11-15T00:00:00.000Z",
      response: { type: "SINGLE_MCQ", option_id: U(21) },
      time_spent_ms: 1200,
      session: null,
    });
    expect(ok.success).toBe(true);
  });
});

describe("taxonomy mapping", () => {
  it("builds frontend chapters keyed by segment with API slugs kept for requests", () => {
    const built = buildExam("jee-main", {
      exam,
      subjects: [{ ...subject, chapters: [{ ...chapter, topics: [{ id: U(4), slug: "jee-main-physics-kinematics-motion", segment: "motion", name: "Motion" }] }] }],
    });
    expect(built.subjects[0]).toMatchObject({ id: "physics", apiSlug: "jee-main-physics" });
    expect(built.chapters[0]).toMatchObject({ apiSlug: "jee-main-physics-kinematics", subjectApiSlug: "jee-main-physics" });
    expect(built.chapters[0]!.chapter).toMatchObject({ slug: "kinematics", subject: "physics", exams: ["jee-main"] });
    expect(built.chapters[0]!.chapter.topics).toEqual([{ slug: "motion", name: "Motion" }]);
  });
});

describe("drafts", () => {
  it("persist, read back and delete per user and session; tolerate missing storage", () => {
    const mem = new Map<string, string>();
    const ls = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    expect(readDraft("u1", "s1")).toBeNull();
    const id = newClientId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const ok = writeDraft("u1", "s1", {
      v: 1,
      current: 2,
      elapsedSec: 9,
      savedAt: "t",
      responses: { q: { answer: { optionIds: ["A"] }, markedForReview: true, visited: true, timeSpentSec: 3, clientAttemptId: id } },
    });
    expect(ok).toBe(true);
    expect(mem.has("projectx-drafts-v1:u1:s1")).toBe(true);
    expect(readDraft("u1", "s1")?.responses.q?.clientAttemptId).toBe(id);
    expect(readDraft("u2", "s1")).toBeNull();
    deleteDraft("u1", "s1");
    expect(readDraft("u1", "s1")).toBeNull();
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(readDraft("u1", "s1")).toBeNull();
    expect(writeDraft("u1", "s1", { v: 1, current: 0, elapsedSec: 0, savedAt: "t", responses: {} })).toBe(false);
  });
});

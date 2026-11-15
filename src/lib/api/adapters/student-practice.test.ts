import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PracticeQuestion, PublicSolution } from "../schemas";
import { Question, Solution } from "@/contracts";
import { setTokenProvider } from "../auth";
import {
  ActivityDaySchema,
  AttemptResultSchema,
  BookmarkItemSchema,
  PracticeQuestionSchema,
  MeSchema,
  MistakeItemSchema,
  SessionCreatedSchema,
  SessionDetailSchema,
  SessionListItemSchema,
  SessionProgressSchema,
  envelope,
} from "../schemas";
import * as student from "../student";
import { solutionFromApi } from "./content";
import { fromAnswerResponse, fromAttemptResult, isValidDecimal, sectionsFor, toAnswerResponse, toPracticeQuestion } from "./practice";
import { toBookmarks, toDayActivity, toDemoUser, toMistakeRecords } from "./student";

const load = <S extends z.ZodType>(file: string, schema: S): z.output<S> => {
  const json = JSON.parse(readFileSync(resolve(__dirname, "../__fixtures__", file), "utf8"));
  return (envelope(schema).parse(json) as { data: z.output<S> }).data;
};

describe("recorded private-API fixtures parse with the contract schemas (B1-B6)", () => {
  it("parses every fixture", () => {
    expect(load("me.json", MeSchema)).toMatchObject({ class_level: null, onboarding_completed: false });
    load("session-created.json", SessionCreatedSchema);
    load("session-detail.json", SessionDetailSchema);
    expect(load("session-list.json", z.array(SessionListItemSchema))[0]).toMatchObject({ ui_mode: "test", time_limit_sec: 600 });
    expect(load("attempt-result.json", AttemptResultSchema)).toMatchObject({ time_spent_ms: 4200, response: { type: "SINGLE_MCQ" } });
    load("activity.json", z.array(ActivityDaySchema));
    load("mistakes.json", z.array(MistakeItemSchema));
    load("bookmarks.json", z.array(BookmarkItemSchema));
    expect(load("session-complete.json", SessionProgressSchema).status).toBe("COMPLETED");
  });
});

describe("practice adapters", () => {
  const created = () => load("session-created.json", SessionCreatedSchema);

  it("toPracticeQuestion maps labels, refs and a non-rendered verification placeholder", () => {
    const q = toPracticeQuestion(created().questions[0]!);
    expect(() => Question.parse(q)).not.toThrow();
    expect(q.options.map((o) => o.id)).toEqual(["A", "B", "C", "D"]);
    expect(q.options.every((o) => !!o.ref)).toBe(true);
    expect(q.verification.status).toBe("processed");
  });

  it("toAnswerResponse maps labels to uuids and rejects invalid input", () => {
    const q = toPracticeQuestion(created().questions[0]!);
    const b = q.options.find((o) => o.id === "B")!;
    expect(toAnswerResponse(q, { optionIds: ["B"] })).toEqual({ type: "SINGLE_MCQ", option_id: b.ref });
    expect(toAnswerResponse(q, { optionIds: ["B", "C"] })).toBeNull();
    expect(toAnswerResponse(q, { optionIds: ["Z"] })).toBeNull();
    expect(toAnswerResponse(q, null)).toBeNull();
    expect(toAnswerResponse(q, { optionIds: [] })).toBeNull();

    const multi = { ...q, type: "multiple_correct" as const };
    expect(toAnswerResponse(multi, { optionIds: ["A", "C"] })).toEqual({ type: "MULTI_MCQ", option_ids: [q.options[0]!.ref, q.options[2]!.ref] });
    expect(toAnswerResponse(multi, { optionIds: ["A", "A"] })).toBeNull();

    const num = { ...q, type: "numerical" as const, options: [] };
    expect(toAnswerResponse(num, { value: " 2.5 " })).toEqual({ type: "NUMERICAL", value: "2.5" });
    expect(toAnswerResponse(num, { value: "abc" })).toBeNull();
    expect(toAnswerResponse(num, { value: "1e3" })).toBeNull();
    expect(toAnswerResponse(num, { value: "" })).toBeNull();
    expect(isValidDecimal("-4")).toBe(true);
    expect(isValidDecimal("4.")).toBe(false);
  });

  it("fromAnswerResponse round-trips with toAnswerResponse", () => {
    const q = toPracticeQuestion(created().questions[0]!);
    const wire = toAnswerResponse(q, { optionIds: ["C"] })!;
    expect(fromAnswerResponse(q, wire)).toEqual({ optionIds: ["C"] });
    expect(fromAnswerResponse({ ...q, type: "numerical" }, { type: "NUMERICAL", value: "7" })).toEqual({ value: "7" });
  });

  it("fromAttemptResult returns the server outcome, label answer and solution", () => {
    const first = created().questions[0]!;
    const q = toPracticeQuestion(first);
    const r = fromAttemptResult(load("attempt-result.json", AttemptResultSchema), q);
    expect(r.outcome).toBe("incorrect");
    expect(r.score).toBe(-1);
    expect(r.timeSpentSec).toBe(4);
    expect(r.answer).toEqual({ optionIds: ["A"] });
    expect(r.solution.answer).toEqual({ type: "single_correct", optionId: "B" });
    expect(() => Solution.parse(r.solution)).not.toThrow();
    // never claims an official source without evidence
    expect(r.solution.answerProvenance).toBe("derived");
  });

  it("sectionsFor groups by subject and takes marking from the questions", () => {
    const sections = sectionsFor(created().questions);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: "physics", subject: "physics" });
    expect(sections[0]!.questionIds).toHaveLength(created().questions.length);
    expect(sections[0]!.marking.single_correct).toEqual({ correct: 4, incorrect: -1, unattempted: 0, partial: false });
  });
});

describe("student adapters", () => {
  it("toDemoUser maps Me with defaults", () => {
    const me = load("me.json", MeSchema);
    expect(toDemoUser(me)).toMatchObject({ name: "Dev One", exam: "jee-main", classLevel: "12", dailyGoal: 10, onboarded: false, showOnLeaderboard: false, cosmetic: null });
    const set = toDemoUser({ ...me, class_level: "dropper", onboarding_completed: true, target_exam: { ...me.target_exam!, slug: "neet-ug" } } as never, { showOnLeaderboard: true, cosmetic: "crown" });
    expect(set).toMatchObject({ exam: "neet", classLevel: "dropper", onboarded: true, showOnLeaderboard: true, cosmetic: "crown" });
    expect(toDemoUser({ ...me, display_name: null, email: "asha@x.in" }).name).toBe("asha");
  });

  it("toMistakeRecords, toBookmarks and toDayActivity", () => {
    const m = toMistakeRecords(load("mistakes.json", z.array(MistakeItemSchema)));
    const rec = Object.values(m)[0]!;
    expect(rec).toMatchObject({ status: "open", reattempts: 0, category: null, attemptId: "", resolvedAt: null });
    const resolved = toMistakeRecords([{ ...load("mistakes.json", z.array(MistakeItemSchema))[0]!, wrong_count: 3, resolved_at: "2026-11-15T00:00:00.000Z" }]);
    expect(Object.values(resolved)[0]).toMatchObject({ status: "resolved", reattempts: 2, resolvedAt: "2026-11-15T00:00:00.000Z" });
    const b = toBookmarks(load("bookmarks.json", z.array(BookmarkItemSchema)));
    expect(Object.keys(b)).toHaveLength(1);
    expect(toDayActivity(load("activity.json", z.array(ActivityDaySchema)))["2026-11-15"]).toEqual({ answered: 1, correct: 0, xp: 2, seconds: 4, subjects: {} });
    expect(toDayActivity([{ date: "2026-11-01", attempts: 10, correct: 7, total_time_ms: 90_000 }])["2026-11-01"]).toMatchObject({ xp: 76, seconds: 90 });
  });
});

describe("student client", () => {
  const ORIGINAL = { ...process.env };
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://api.test/api/v1";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL };
    setTokenProvider(async () => null);
  });

  it("refuses to call without a token", async () => {
    setTokenProvider(async () => null);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(student.me()).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(f).not.toHaveBeenCalled();
  });

  it("sends the bearer token, no-store, idempotency key and builds query strings", async () => {
    setTokenProvider(async () => "tok-1");
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify({ data: [], meta: { page: { next_cursor: "c2", limit: 5 } } }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", f);
    const r = await student.listSessions({ status: ["ACTIVE", "COMPLETED"], limit: 5 });
    expect(r.nextCursor).toBe("c2");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("http://api.test/api/v1/practice/sessions?status=ACTIVE%2CCOMPLETED&limit=5");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(init!.cache).toBe("no-store");

    f.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: "ALREADY_ATTEMPTED", message: "x", request_id: "r" } }), { status: 409, headers: { "Content-Type": "application/json" } }));
    const cid = "11111111-1111-4111-8111-111111111111";
    await expect(
      student.submitAttempt({ client_attempt_id: cid, question_id: "22222222-2222-4222-8222-222222222222", response: { type: "NUMERICAL", value: "1" } }),
    ).rejects.toMatchObject({ code: "ALREADY_ATTEMPTED" });
    const [, init2] = f.mock.calls[1]!;
    expect(init2!.method).toBe("POST");
    expect((init2!.headers as Record<string, string>)["Idempotency-Key"]).toBe(cid);
    expect(f).toHaveBeenCalledTimes(2); // POST is never auto-retried
  });

  it("DELETE endpoints accept 204", async () => {
    setTokenProvider(async () => "t");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(student.removeBookmark("q1")).resolves.toBeUndefined();
    await expect(student.dismissMistake("q1")).resolves.toBeUndefined();
  });
});

/* ---- ported from the removed session/convert tests (hand-built practice question) ---- */

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pqExam = { id: U(1), slug: "jee-main", name: "JEE Main", short_name: "Main" };
const pqSubject = { id: U(2), slug: "jee-main-physics", segment: "physics", name: "Physics", code: "PHYSICS" as const };
const pqChapter = { id: U(3), slug: "jee-main-physics-kinematics", segment: "kinematics", name: "Kinematics", unit_number: 1 };

const pq = {
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
  exam: pqExam,
  subject: pqSubject,
  chapter: pqChapter,
  topic: null,
  attribution: { origin: "EDITORIAL", year: null, paper_title: null },
} as PracticeQuestion;

describe("practice question conversion (hand-built)", () => {
  it("round-trips the contract schema", () => {
    expect(PracticeQuestionSchema.safeParse(pq).success).toBe(true);
  });

  it("maps option labels to ids and refs without computing any answer", () => {
    const q = toPracticeQuestion(pq);
    expect(q.type).toBe("single_correct");
    expect(q.subject).toBe("physics");
    expect(q.chapter).toBe("kinematics");
    expect(q.options.map((o) => [o.id, o.ref])).toEqual([
      ["A", U(21)],
      ["B", U(22)],
    ]);
    expect(q.stem).toBe("Find $v$.");
    expect(q.verification.status).toBe("processed");
  });

  it("throws on an unknown exam so callers can skip the item", () => {
    expect(() => toPracticeQuestion({ ...pq, exam: { ...pqExam, slug: "gate" } })).toThrow();
  });

  it("sends option uuids for single, multi and a validated decimal for numerical", () => {
    const q = toPracticeQuestion(pq);
    expect(toAnswerResponse(q, { optionIds: ["B"] })).toEqual({ type: "SINGLE_MCQ", option_id: U(22) });
    const multi = { ...q, type: "multiple_correct" as const };
    expect(toAnswerResponse(multi, { optionIds: ["A", "B"] })).toEqual({ type: "MULTI_MCQ", option_ids: [U(21), U(22)] });
    const num = { ...q, type: "numerical" as const, options: [] };
    expect(toAnswerResponse(num, { value: "-2.5" })).toEqual({ type: "NUMERICAL", value: "-2.5" });
    expect(toAnswerResponse(num, { value: "1e3" })).toBeNull();
    expect(toAnswerResponse(num, { value: "." })).toBeNull();
    expect(toAnswerResponse(q, { optionIds: ["Z"] })).toBeNull();
  });

  it("maps stored responses back to labels", () => {
    const q = toPracticeQuestion(pq);
    expect(fromAnswerResponse(q, { type: "SINGLE_MCQ", option_id: U(21) })).toEqual({ optionIds: ["A"] });
    expect(fromAnswerResponse(q, { type: "NUMERICAL", value: "3" })).toEqual({ value: "3" });
  });

  it("validates decimals the way the API does", () => {
    for (const ok of ["0", "-1", "12.50"]) expect(isValidDecimal(ok)).toBe(true);
    for (const bad of ["", " ", "1.", ".5", "1,5", "abc", "--1"]) expect(isValidDecimal(bad)).toBe(false);
  });
});

describe("solutionFromApi for practice results (provenance override)", () => {
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
  const labels = new Map([
    [U(21), "A"],
    [U(22), "B"],
  ]);
  const sol = (provenance: string, final_answer: unknown) => ({ ...base, provenance, final_answer }) as PublicSolution;

  it("single answer uses the server label and never claims an official key", () => {
    const s = solutionFromApi(pq.id, sol("AI_GENERATED", { type: "SINGLE_MCQ", correct_option_ids: [U(22)], correct_labels: ["B"] }), "processed", labels, "unknown");
    expect(s.answer).toEqual({ type: "single_correct", optionId: "B" });
    expect(s.answerProvenance).toBe("unknown");
    expect(s.generatedBy).toBe("ai");
    expect(s.steps[0]).toMatchObject({ body: "Because." });
  });

  it("falls back to option refs when labels are missing; numerical keeps the display string", () => {
    const s1 = solutionFromApi(pq.id, sol("OFFICIAL", { type: "SINGLE_MCQ", correct_option_ids: [U(21)] }), "processed", labels, "unknown");
    expect(s1.answer).toEqual({ type: "single_correct", optionId: "A" });
    expect(s1.generatedBy).toBe("official");
    const s2 = solutionFromApi(pq.id, sol("HUMAN_AUTHORED", { type: "NUMERICAL", accepted_ranges: [{ min: "2", max: "2" }], display_value: "2.50" }), "processed", labels, "unknown");
    expect(s2.answer).toMatchObject({ type: "numerical", value: 2.5, display: "2.50" });
  });

  it("without the override the adapter derives provenance from verification", () => {
    const s = solutionFromApi(pq.id, sol("AI_GENERATED", { type: "SINGLE_MCQ", correct_option_ids: [U(22)] }), "processed", labels);
    expect(s.answerProvenance).toBe("derived");
  });
});

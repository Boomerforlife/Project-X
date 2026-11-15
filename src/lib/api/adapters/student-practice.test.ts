import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Question, Solution } from "@/contracts";
import { setTokenProvider } from "../auth";
import {
  ActivityDaySchema,
  AttemptResultSchema,
  BookmarkItemSchema,
  MeSchema,
  MistakeItemSchema,
  SessionCreatedSchema,
  SessionDetailSchema,
  SessionListItemSchema,
  SessionProgressSchema,
  envelope,
} from "../schemas";
import * as student from "../student";
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

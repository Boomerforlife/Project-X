import { describe, expect, it } from "vitest";
import { buildExam } from "./registry";
import { clearUserDrafts, deleteDraft, newClientId, readDraft, writeDraft } from "./drafts";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const exam = { id: U(1), slug: "jee-main", name: "JEE Main", short_name: "Main" };
const subject = { id: U(2), slug: "jee-main-physics", segment: "physics", name: "Physics", code: "PHYSICS" as const };
const chapter = { id: U(3), slug: "jee-main-physics-kinematics", segment: "kinematics", name: "Kinematics", unit_number: 1 };

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
    const ls = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
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

    // sign-out clears only that user's drafts
    const empty = { v: 1 as const, current: 0, elapsedSec: 0, savedAt: "t", responses: {} };
    writeDraft("u1", "a", empty);
    writeDraft("u1", "b", empty);
    writeDraft("u2", "a", empty);
    mem.set("projectx-prefs-v1:u1", "{}");
    clearUserDrafts("u1");
    expect([...mem.keys()].sort()).toEqual(["projectx-drafts-v1:u2:a", "projectx-prefs-v1:u1"]);

    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(readDraft("u1", "s1")).toBeNull();
    expect(writeDraft("u1", "s1", { v: 1, current: 0, elapsedSec: 0, savedAt: "t", responses: {} })).toBe(false);
  });
});

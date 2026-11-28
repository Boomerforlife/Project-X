import { describe, expect, it } from "vitest";
import { subjectStats } from "./progress";
import type { DemoState } from "./types";

const state = (server: NonNullable<DemoState["server"]>): DemoState => ({
  v: 2,
  user: { name: "A", exam: "jee-main", classLevel: "12", dailyGoal: 20, onboarded: true, joinedAt: "2026-01-01T00:00:00Z", showOnLeaderboard: false, cosmetic: null },
  attempts: {},
  bookmarks: {},
  review: {},
  mistakes: {},
  activity: {},
  server,
});

describe("subjectStats", () => {
  it("reports null accuracy for an untouched subject, never 0%", () => {
    const rows = subjectStats(state({ streak: null, chapters: [], weak: [], subjects: [{ subject: "physics", answered: 10, correct: 4 }] }));
    const by = Object.fromEntries(rows.map((r) => [r.subject, r]));
    expect(by.physics).toEqual({ subject: "physics", answered: 10, accuracy: 0.4 });
    expect(by.chemistry).toEqual({ subject: "chemistry", answered: 0, accuracy: null });
    expect(by.mathematics?.accuracy).toBeNull();
  });
});

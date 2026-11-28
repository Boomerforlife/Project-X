import { describe, expect, it } from "vitest";
import { chooseNextAction, planTaskLabel, todaysPlanTask } from "./next-action";
import type { ItemView } from "@/lib/plans";

const base = { resume: null, plan: null, mistakesDue: 0, weak: null, firstRun: false };
const weak = { subject: "physics", chapter: "optics", accuracy: 0.4, answered: 10 };
const item = (over: Partial<ItemView> = {}): ItemView => ({
  key: "k", kind: "PRACTICE", subject: "physics", chapter: "optics", chapterName: "Optics", difficulty: null, size: 8, problems: null, timeLimitSec: null, minutes: 20, startedAt: null, completedAt: null, ...over,
});

describe("chooseNextAction", () => {
  it("prefers resuming an unfinished attempt", () => {
    const r = { id: "a1", mode: "cbt", title: "Paper", done: 3, total: 75 };
    expect(chooseNextAction({ ...base, resume: r, plan: { label: "x" }, mistakesDue: 4, weak }).kind).toBe("resume");
  });
  it("then the study plan, mistakes due, weakest chapter", () => {
    expect(chooseNextAction({ ...base, plan: { label: "x" }, mistakesDue: 4, weak }).kind).toBe("plan");
    expect(chooseNextAction({ ...base, mistakesDue: 4, weak }).kind).toBe("mistakes");
    expect(chooseNextAction({ ...base, weak }).kind).toBe("weak");
  });
  it("falls back to a quick start, flagged for a first run", () => {
    expect(chooseNextAction(base)).toEqual({ kind: "start", firstRun: false });
    expect(chooseNextAction({ ...base, firstRun: true, weak })).toEqual({ kind: "start", firstRun: true });
  });
});

describe("planTaskLabel", () => {
  it("names tasks from kind and chapter", () => {
    expect(planTaskLabel(item())).toBe("Practise Optics");
    expect(planTaskLabel(item({ kind: "CHECKPOINT" }))).toBe("Checkpoint");
    expect(planTaskLabel(item({ kind: "MISTAKES", chapterName: null }))).toBe("Redo mistakes");
  });
});

describe("todaysPlanTask", () => {
  const plan = (over = {}) => ({ locked: false, days: 7, todayIndex: 1, plan: [{ index: 1, light: false, items: [item({ key: "a", completedAt: "x" }), item({ key: "b" })] }], ...over });
  it("returns the first unfinished task", () => {
    expect(todaysPlanTask(plan())?.key).toBe("b");
  });
  it("returns null when locked, finished, light or absent", () => {
    expect(todaysPlanTask(plan({ locked: true }))).toBeNull();
    expect(todaysPlanTask(plan({ todayIndex: 7 }))).toBeNull();
    expect(todaysPlanTask(plan({ plan: [{ index: 1, light: true, items: [item()] }] }))).toBeNull();
    expect(todaysPlanTask(null)).toBeNull();
  });
});

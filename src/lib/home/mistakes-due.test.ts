import { describe, expect, it } from "vitest";
import { isMistakeDue, mistakesDue, retryGapDays } from "./mistakes-due";

const now = new Date("2026-11-28T12:00:00.000Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const m = (days: number, reattempts = 0, status: "open" | "resolved" = "open") => ({ status, at: ago(days), reattempts });

describe("retryGapDays", () => {
  it("expands 1, 3, 7, 21 and caps", () => {
    expect([0, 1, 2, 3, 4, 10].map(retryGapDays)).toEqual([1, 3, 7, 21, 21, 21]);
  });
  it("treats negatives as the first gap", () => {
    expect(retryGapDays(-2)).toBe(1);
  });
});

describe("isMistakeDue", () => {
  it("is due one day after the first miss", () => {
    expect(isMistakeDue(m(1), now)).toBe(true);
    expect(isMistakeDue(m(0.5), now)).toBe(false);
  });
  it("waits longer as reattempts grow", () => {
    expect(isMistakeDue(m(2, 1), now)).toBe(false);
    expect(isMistakeDue(m(3, 1), now)).toBe(true);
    expect(isMistakeDue(m(6, 2), now)).toBe(false);
    expect(isMistakeDue(m(7, 2), now)).toBe(true);
    expect(isMistakeDue(m(20, 5), now)).toBe(false);
    expect(isMistakeDue(m(21, 5), now)).toBe(true);
  });
  it("ignores resolved and unparseable records", () => {
    expect(isMistakeDue(m(30, 0, "resolved"), now)).toBe(false);
    expect(isMistakeDue({ status: "open", at: "nope", reattempts: 0 }, now)).toBe(false);
  });
});

describe("mistakesDue", () => {
  it("filters a record map", () => {
    const due = mistakesDue({ a: m(2), b: m(0.1), c: m(9, 0, "resolved") }, now);
    expect(due).toHaveLength(1);
  });
});

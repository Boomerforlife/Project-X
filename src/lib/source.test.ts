import { describe, expect, it } from "vitest";
import { sourceLabel } from "./source";

describe("sourceLabel", () => {
  it("uses the official paper title when the backend sends one", () => {
    expect(
      sourceLabel({ kind: "pyq", exam: "jee-advanced", year: 2025, session: null, date: null, shift: null, paper: "JEE Advanced 2025 Paper 1" }),
    ).toBe("JEE Advanced 2025 Paper 1");
  });
  it("falls back to exam, year and shift without inventing a paper", () => {
    expect(sourceLabel({ kind: "pyq", exam: "jee-main", year: 2024, session: "April", date: null, shift: 2 })).toBe("JEE Main · 2024 · April · Shift 2");
    expect(sourceLabel({ kind: "pyq", exam: "jee-main", year: 0, session: null, date: null, shift: null, paper: null })).toBe("JEE Main");
  });
  it("never presents original or sample questions as past papers", () => {
    expect(sourceLabel({ kind: "original" })).toBe("Practice question");
    expect(sourceLabel({ kind: "sample" })).toBe("Sample (development)");
  });
});

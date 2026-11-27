import { describe, expect, it } from "vitest";
import { papersByYear, sittingLabel, type PyqPaper } from "./pyq";

const paper = (slug: string, year: number, examDate: string | null, shift: number | null): PyqPaper => ({
  slug, title: slug, exam: "jee-main", year, examDate, shift, questionCount: 75, durationMin: 180, numericalCounted: null, sections: [], isDemo: false,
});

describe("pyq papers", () => {
  it("groups by year, newest year first, sittings in date then shift order", () => {
    const g = papersByYear([paper("b", 2024, "2024-01-27", 2), paper("c", 2025, "2025-01-22", 1), paper("a", 2024, "2024-01-27", 1), paper("d", 2024, "2024-01-24", 2)]);
    expect(g.map((x) => x.year)).toEqual([2025, 2024]);
    expect(g[1]!.papers.map((p) => p.slug)).toEqual(["d", "a", "b"]);
  });

  it("labels a sitting only with what the paper states", () => {
    expect(sittingLabel({ examDate: "2024-01-27", shift: 1 })).toBe("27 Jan 2024 · Shift 1");
    expect(sittingLabel({ examDate: null, shift: 2 })).toBe("Shift 2");
    expect(sittingLabel({ examDate: null, shift: null })).toBe("");
  });
});

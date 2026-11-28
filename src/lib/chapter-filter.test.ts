import { describe, expect, it } from "vitest";
import { applyFilters, filterOptions, type ChapterRow } from "./chapter-filter";

const row = (id: string, year: number | null, type: ChapterRow["type"], difficulty: ChapterRow["difficulty"], topic: string | null = null): ChapterRow => ({ id, slug: id, year, type, difficulty, topic, publicPage: true });
const rows = [row("a", 2024, "numerical", "hard"), row("b", 2025, "single_correct", "easy", "t1"), row("c", 2024, "single_correct", null, "t2"), row("d", null, "single_correct", "medium")];

describe("chapter filters", () => {
  it("offers only options present in the chapter", () => {
    const o = filterOptions(rows);
    expect(o.years).toEqual([2025, 2024]);
    expect(o.types.sort()).toEqual(["numerical", "single_correct"]);
    expect(o.diffs).toEqual(["easy", "medium", "hard"]);
    expect(o.topics).toEqual(["t1", "t2"]);
  });

  it("combines filters and the personal overlay", () => {
    expect(applyFilters(rows, { year: "2024" }).map((r) => r.id)).toEqual(["a", "c"]);
    expect(applyFilters(rows, { year: "2024", type: "single_correct" }).map((r) => r.id)).toEqual(["c"]);
    expect(applyFilters(rows, { topic: "t1" }).map((r) => r.id)).toEqual(["b"]);
    expect(applyFilters(rows, {}, (id) => id === "d").map((r) => r.id)).toEqual(["d"]);
  });
});

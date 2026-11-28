import { describe, expect, it } from "vitest";
import { chapterBreakdown, chapterSummary, chaptersToWorkOn, type ChapterItem } from "./chapters";

const it_ = (chapter: string, outcome: ChapterItem["outcome"], subject = "physics"): ChapterItem => ({ subject, chapter, outcome });

describe("chapter breakdown", () => {
  const items = [
    it_("optics", "incorrect"), it_("optics", "incorrect"), it_("optics", "correct"), it_("optics", "unattempted"), it_("optics", "correct"),
    it_("heat", "unattempted"), it_("heat", "correct"),
    it_("waves", "correct"),
    it_("kinematics", "partial"),
  ];
  it("counts per chapter", () => {
    const o = chapterBreakdown(items).find((r) => r.chapter === "optics")!;
    expect(o).toMatchObject({ total: 5, wrong: 2, unattempted: 1, missed: 3 });
  });
  it("ranks by wrong then misses and drops clean chapters", () => {
    expect(chaptersToWorkOn(items).map((r) => r.chapter)).toEqual(["optics", "kinematics", "heat"]);
    expect(chaptersToWorkOn(items, 1)).toHaveLength(1);
  });
  it("is empty when nothing was missed", () => {
    expect(chaptersToWorkOn([it_("waves", "correct")])).toEqual([]);
    expect(chaptersToWorkOn([])).toEqual([]);
  });
  it("keeps same chapter slug in different subjects apart", () => {
    expect(chapterBreakdown([it_("intro", "correct"), it_("intro", "correct", "chemistry")])).toHaveLength(2);
  });
  it("summarises", () => {
    expect(chapterSummary({ subject: "p", chapter: "c", total: 5, wrong: 3, unattempted: 0, missed: 3 })).toBe("3 of 5 wrong");
    expect(chapterSummary({ subject: "p", chapter: "c", total: 5, wrong: 2, unattempted: 1, missed: 3 })).toBe("2 of 5 wrong · 1 unanswered");
  });
});

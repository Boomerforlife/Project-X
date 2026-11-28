import { describe, expect, it } from "vitest";
import { xpRuleCopy } from "./xp-copy";

describe("xpRuleCopy", () => {
  it("omits bonuses that are zero", () => {
    expect(xpRuleCopy({ correct: 10, partial: 5, incorrect: 2, paperBonus: 0, mistakeCleared: 0 })).toBe(
      "+10 for a correct answer, +5 for a partly correct multi-answer, +2 for a wrong attempt.",
    );
  });
  it("includes bonuses when set", () => {
    const t = xpRuleCopy({ correct: 10, partial: 5, incorrect: 2, paperBonus: 50, mistakeCleared: 15 });
    expect(t).toContain("+15 for clearing a mistake");
    expect(t).toContain("+50 for finishing a paper");
  });
});

import { describe, expect, it } from "vitest";
import { isCorrect } from "./check";

describe("isCorrect (public try box)", () => {
  it("single correct: only the key option", () => {
    const a = { type: "single_correct" as const, optionId: "B" };
    expect(isCorrect(a, ["B"], "")).toBe(true);
    expect(isCorrect(a, ["A"], "")).toBe(false);
    expect(isCorrect(a, [], "")).toBe(false);
  });
  it("multiple correct: exactly the key set, any order", () => {
    const a = { type: "multiple_correct" as const, optionIds: ["A", "C"] };
    expect(isCorrect(a, ["C", "A"], "")).toBe(true);
    expect(isCorrect(a, ["A"], "")).toBe(false);
    expect(isCorrect(a, ["A", "B", "C"], "")).toBe(false);
  });
  it("numerical: within tolerance, rejects non-numbers", () => {
    const a = { type: "numerical" as const, value: 12.5, tolerance: 0.1 };
    expect(isCorrect(a, [], "12.5")).toBe(true);
    expect(isCorrect(a, [], " 12.45 ")).toBe(true);
    expect(isCorrect(a, [], "12.7")).toBe(false);
    expect(isCorrect(a, [], "abc")).toBe(false);
    expect(isCorrect({ type: "numerical", value: 3, tolerance: 0 }, [], "3")).toBe(true);
  });
});

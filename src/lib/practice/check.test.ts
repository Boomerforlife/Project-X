import { describe, expect, it } from "vitest";
import { acceptedOptionIds, answerLabel, isCorrect } from "./check";

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
  it("single correct with a second officially accepted option accepts either", () => {
    const a = { type: "single_correct" as const, optionId: "A", alsoAccepted: ["C"] };
    expect(isCorrect(a, ["A"], "")).toBe(true);
    expect(isCorrect(a, ["C"], "")).toBe(true);
    expect(isCorrect(a, ["B"], "")).toBe(false);
    expect(acceptedOptionIds(a)).toEqual(["A", "C"]);
    expect(answerLabel(a, "Option")).toBe("Option A (C also accepted)");
  });
  it("numerical: accepted ranges from the key win over value/tolerance; several ranges = several accepted values", () => {
    const range = { type: "numerical" as const, value: 19.05, tolerance: 0, display: "19.05", ranges: [{ min: 19, max: 19.1 }] };
    expect(isCorrect(range, [], "19.08")).toBe(true);
    expect(isCorrect(range, [], "19.2")).toBe(false);
    expect(answerLabel(range)).toBe("19.05 (accepted: 19 to 19.1)");
    const two = { type: "numerical" as const, value: 1, tolerance: 0, display: "1", ranges: [{ min: 1, max: 1 }, { min: 2, max: 2 }] };
    expect(isCorrect(two, [], "2")).toBe(true);
    expect(isCorrect(two, [], "1")).toBe(true);
    expect(isCorrect(two, [], "3")).toBe(false);
    expect(isCorrect(two, [], "")).toBe(false);
    expect(answerLabel(two)).toBe("1 (also accepted: 2)");
    expect(answerLabel({ type: "numerical", value: 5, tolerance: 0, display: "5", ranges: [{ min: 5, max: 5 }] })).toBe("5");
  });
});

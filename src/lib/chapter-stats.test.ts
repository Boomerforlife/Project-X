import { describe, expect, it } from "vitest";
import type { QuestionCard } from "@/contracts";
import { pct, questionStats, yearSpan } from "./chapter-stats";

const card = (over: Partial<QuestionCard>): QuestionCard => ({
  id: Math.random().toString(36),
  slug: "s",
  exams: ["jee-main"],
  subject: "physics",
  chapter: "kinematics",
  type: "single_correct",
  stem: "x",
  publicPage: true,
  ...over,
});

describe("yearSpan", () => {
  it("never bridges missing years", () => {
    expect(yearSpan([2026, 2025, 2024, 2021, 2020])).toBe("2020–2021, 2024–2026");
    expect(yearSpan([2024])).toBe("2024");
    expect(yearSpan([])).toBe("");
  });
});

describe("questionStats", () => {
  it("counts per year, type and difficulty, keeping unknown years apart", () => {
    const s = questionStats([
      card({ year: 2025, type: "numerical", difficulty: "hard" }),
      card({ year: 2025, difficulty: "easy" }),
      card({ year: 2021, type: "multiple_correct" }),
      card({ year: null, difficulty: "medium" }),
    ]);
    expect(s.total).toBe(4);
    expect(s.pyq).toBe(3);
    expect(s.years).toEqual([
      { year: 2025, total: 2, mcq: 1, numerical: 1 },
      { year: 2021, total: 1, mcq: 1, numerical: 0 },
    ]);
    expect(s.unknownYear).toBe(1);
    expect([s.mcq, s.numerical]).toEqual([3, 1]);
    expect(s.difficulty).toEqual({ easy: 1, medium: 1, hard: 1, unrated: 1 });
  });

  it("formats shares without dividing by zero", () => {
    expect(pct(1, 3)).toBe("33%");
    expect(pct(1, 0)).toBe("0%");
  });
});

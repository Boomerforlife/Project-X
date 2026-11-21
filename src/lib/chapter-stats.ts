/**
 * Plain counts over a set of question cards (one chapter, or a whole subject): how many questions per year, how many
 * MCQ vs numerical, and the difficulty mix. Public chapter pages and the weightage page print these, so they only ever
 * count what is published today; nothing is extrapolated to papers TabbyPrep does not have.
 */
import type { QuestionCard } from "@/contracts";

export type YearRow = { year: number; total: number; mcq: number; numerical: number };

export type QuestionStats = {
  total: number;
  /** Previous-year questions: those with a paper year. Only these may be called "PYQs" or counted as weightage. */
  pyq: number;
  /** Years with at least one question, newest first. */
  years: YearRow[];
  /**
   * Questions with no paper year. In the data today these are exactly the practice questions written for the site
   * (origin AI_GENERATED), never PYQs, so they are kept out of every "PYQ" count and year table.
   */
  unknownYear: number;
  mcq: number;
  numerical: number;
  difficulty: { easy: number; medium: number; hard: number; unrated: number };
};

const isMcq = (q: QuestionCard) => q.type === "single_correct" || q.type === "multiple_correct";

export function questionStats(qs: QuestionCard[]): QuestionStats {
  const byYear = new Map<number, YearRow>();
  const difficulty = { easy: 0, medium: 0, hard: 0, unrated: 0 };
  let unknownYear = 0;
  let mcq = 0;
  for (const q of qs) {
    if (isMcq(q)) mcq++;
    difficulty[q.difficulty ?? "unrated"]++;
    if (q.year == null) {
      unknownYear++;
      continue;
    }
    const row = byYear.get(q.year) ?? { year: q.year, total: 0, mcq: 0, numerical: 0 };
    row.total++;
    if (isMcq(q)) row.mcq++;
    else row.numerical++;
    byYear.set(q.year, row);
  }
  return {
    total: qs.length,
    pyq: qs.length - unknownYear,
    years: [...byYear.values()].sort((a, b) => b.year - a.year),
    unknownYear,
    mcq,
    numerical: qs.length - mcq,
    difficulty,
  };
}

/**
 * Years as honest ranges: [2026, 2025, 2024, 2021, 2020] -> "2020–2021, 2024–2026". Never "2020–2026" when years in
 * between are missing.
 */
export function yearSpan(years: number[]): string {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < ys.length; ) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j]! + 1) j++;
    parts.push(i === j ? String(ys[i]) : `${ys[i]}–${ys[j]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

export const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "0%");

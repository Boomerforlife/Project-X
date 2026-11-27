import type { Difficulty, QuestionType } from "@/contracts";

export type ChapterRow = {
  id: string;
  slug: string;
  year: number | null;
  type: QuestionType;
  difficulty: Difficulty | null;
  topic: string | null;
  publicPage: boolean;
};

/** Filters a chapter's list can offer, from the questions actually in it (never an empty option). */
export function filterOptions(rows: ChapterRow[]) {
  const years = [...new Set(rows.map((r) => r.year).filter((y): y is number => y !== null))].sort((a, b) => b - a);
  const types = [...new Set(rows.map((r) => r.type))];
  const diffs = (["easy", "medium", "hard"] as Difficulty[]).filter((d) => rows.some((r) => r.difficulty === d));
  const topics = [...new Set(rows.map((r) => r.topic).filter((t): t is string => Boolean(t)))];
  return { years, types, diffs, topics };
}

export function applyFilters(rows: ChapterRow[], f: { year?: string | null; type?: string | null; difficulty?: string | null; topic?: string | null }, mine?: (id: string) => boolean) {
  return rows.filter(
    (r) =>
      (!f.year || String(r.year) === f.year) &&
      (!f.type || r.type === f.type) &&
      (!f.difficulty || r.difficulty === f.difficulty) &&
      (!f.topic || r.topic === f.topic) &&
      (!mine || mine(r.id)),
  );
}


import type { ExamId, SubjectId } from "@/contracts";

/**
 * A previous-year paper as public pages show it (PYQ hub, year and paper pages, landing counts). In API mode it comes
 * from GET /public/papers (every paper whose officially answered questions are all published); in mock mode from the
 * demo fixtures, flagged `isDemo` so no public page passes a sample off as a real sitting.
 */
export type PyqPaper = {
  slug: string;
  title: string;
  exam: ExamId;
  year: number;
  /** ISO date of the sitting (YYYY-MM-DD), when known. */
  examDate: string | null;
  shift: number | null;
  questionCount: number;
  durationMin: number;
  /** Only the best N numerical answers per subject count (JEE Main 2021–2024 pattern); null = all count. */
  numericalCounted: number | null;
  sections: { subject: SubjectId | null; name: string; questionCount: number }[];
  isDemo: boolean;
};

/** Years with papers, newest first, each with its papers ordered by date then shift. */
export function papersByYear(papers: PyqPaper[]): { year: number; papers: PyqPaper[] }[] {
  const by = new Map<number, PyqPaper[]>();
  for (const p of papers) by.set(p.year, [...(by.get(p.year) ?? []), p]);
  return [...by.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => ({
      year,
      papers: [...list].sort((a, b) => (a.examDate ?? "").localeCompare(b.examDate ?? "") || (a.shift ?? 0) - (b.shift ?? 0)),
    }));
}

/** "27 Jan 2024 · Shift 1" style label from a paper's own date and shift; never invents either. */
export function sittingLabel(p: Pick<PyqPaper, "examDate" | "shift">): string {
  const parts: string[] = [];
  if (p.examDate) {
    const d = new Date(`${p.examDate}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) parts.push(d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }));
  }
  if (p.shift) parts.push(`Shift ${p.shift}`);
  return parts.join(" · ");
}

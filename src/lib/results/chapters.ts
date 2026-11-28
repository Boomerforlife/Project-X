/**
 * Per-chapter breakdown of ONE attempt, computed from its own responses (no server data, no predictions).
 * "Missed" = wrong, partly right, or left unanswered.
 */
export type ChapterItem = { subject: string; chapter: string; outcome: "correct" | "incorrect" | "partial" | "unattempted" };

export type ChapterRow = {
  subject: string;
  chapter: string;
  total: number;
  wrong: number; // incorrect + partial
  unattempted: number;
  missed: number; // wrong + unattempted
};

export function chapterBreakdown(items: ChapterItem[]): ChapterRow[] {
  const map = new Map<string, ChapterRow>();
  for (const it of items) {
    const key = `${it.subject}/${it.chapter}`;
    const row = map.get(key) ?? { subject: it.subject, chapter: it.chapter, total: 0, wrong: 0, unattempted: 0, missed: 0 };
    row.total += 1;
    if (it.outcome === "incorrect" || it.outcome === "partial") row.wrong += 1;
    if (it.outcome === "unattempted") row.unattempted += 1;
    row.missed = row.wrong + row.unattempted;
    map.set(key, row);
  }
  return [...map.values()];
}

/** Chapters with at least one miss, worst first: wrong answers, then more misses, then higher miss share. */
export function chaptersToWorkOn(items: ChapterItem[], limit = 3): ChapterRow[] {
  return chapterBreakdown(items)
    .filter((r) => r.missed > 0)
    .sort((a, b) => b.wrong - a.wrong || b.missed - a.missed || b.missed / b.total - a.missed / a.total || a.chapter.localeCompare(b.chapter))
    .slice(0, limit);
}

/** "3 of 5 wrong", plus unanswered when there are any. */
export function chapterSummary(r: ChapterRow): string {
  const parts = [`${r.wrong} of ${r.total} wrong`];
  if (r.unattempted) parts.push(`${r.unattempted} unanswered`);
  return parts.join(" · ");
}

import { priority } from './schedule';
import type { ChapterEstimate, ChapterInfo, DiagnosticPick, Evidence } from './types';

export interface SubjectSummary {
  subjectId: string;
  correct: number;
  answered: number;
  skipped: number;
}

export interface DiagnosticReport {
  subjects: SubjectSummary[];
  /** Up to `focusCount` measured, non-strong chapters, highest priority first. */
  focus: string[];
  chapters: ChapterEstimate[];
}

/** Per-subject counts from the diagnostic's own answers, plus the chapters to focus on first. */
export function diagnosticReport(
  picks: readonly DiagnosticPick[],
  answers: readonly Evidence[],
  estimates: readonly ChapterEstimate[],
  chapters: readonly ChapterInfo[],
  focusCount = 3,
): DiagnosticReport {
  const subjectOf = new Map(picks.map((p) => [p.chapterId, p.subjectId]));
  const subjects = new Map<string, SubjectSummary>();
  for (const p of picks) if (!subjects.has(p.subjectId)) subjects.set(p.subjectId, { subjectId: p.subjectId, correct: 0, answered: 0, skipped: 0 });
  for (const a of answers) {
    if (a.source !== 'diagnostic') continue;
    const s = subjects.get(subjectOf.get(a.chapterId) ?? '');
    if (!s) continue;
    if (a.outcome === 'skipped') s.skipped++;
    else {
      s.answered++;
      if (a.outcome === 'correct') s.correct++;
    }
  }
  const info = new Map(chapters.map((c) => [c.chapterId, c]));
  const focus = estimates
    .filter((e) => (e.band === 'weak' || e.band === 'shaky') && info.has(e.chapterId))
    .sort((a, b) => priority(b, info.get(b.chapterId)!) - priority(a, info.get(a.chapterId)!) || a.mastery - b.mastery)
    .slice(0, focusCount)
    .map((e) => e.chapterId);
  return { subjects: [...subjects.values()], focus, chapters: [...estimates] };
}

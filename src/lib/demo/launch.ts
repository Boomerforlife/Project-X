"use client";

import type { ExamId, SubjectId } from "@/contracts";
import { catalog } from "@/lib/data/catalog";
import { DATA_SOURCE } from "@/lib/site";
import { NoQuestionsError, pickQuestions, startPractice } from "./store";

/**
 * One-tap practice: 10 mixed questions in Learning mode. Resolves to the attempt
 * id, or null if nothing matches. In API mode the server picks the questions
 * (unsolved first); null also covers "you have solved everything here".
 */
export async function quickPractice(
  exam: ExamId,
  opts: { subject?: SubjectId; chapter?: string; count?: number; mode?: "learning" | "test"; difficulty?: "easy" | "medium" | "hard"; includeSolved?: boolean; year?: number; title?: string } = {},
): Promise<string | null> {
  const count = opts.count ?? 10;
  const api = DATA_SOURCE === "api";
  const ids = api ? [] : pickQuestions({ exam, subject: opts.subject, chapter: opts.chapter, count, difficulty: opts.difficulty });
  if (!api && !ids.length) return null;
  const chapter = opts.subject && opts.chapter ? catalog.chapter(opts.subject, opts.chapter) : null;
  const subject = opts.subject ? catalog.subject(opts.subject) : null;
  const title = opts.title ?? (chapter ? chapter.name : subject ? `${subject.name} · quick practice` : "Quick practice · mixed");
  const mode = opts.mode ?? "learning";
  const n = api ? count : ids.length;
  try {
    return await startPractice({
      exam,
      mode,
      title,
      questionIds: ids,
      scope: { subject: opts.subject, chapter: opts.chapter, source: chapter ? "chapter" : subject ? "subject" : "quick" },
      durationSec: mode === "test" ? Math.max(5, n * 2) * 60 : null,
      count,
      difficulty: opts.difficulty,
      includeSolved: opts.includeSolved,
      ...(opts.year ? { yearFrom: opts.year, yearTo: opts.year } : {}),
    });
  } catch (e) {
    if (e instanceof NoQuestionsError) return null;
    throw e;
  }
}

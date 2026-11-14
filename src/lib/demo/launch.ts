"use client";

import type { ExamId, SubjectId } from "@/contracts";
import { catalog } from "@/lib/data/catalog";
import { pickQuestions, startPractice } from "./store";

/** One-tap practice: 10 mixed questions in Learning mode. Returns the attempt id, or null if nothing matches. */
export function quickPractice(exam: ExamId, opts: { subject?: SubjectId; chapter?: string; count?: number; mode?: "learning" | "test"; difficulty?: "easy" | "medium" | "hard" } = {}) {
  const count = opts.count ?? 10;
  const ids = pickQuestions({ exam, subject: opts.subject, chapter: opts.chapter, count, difficulty: opts.difficulty });
  if (!ids.length) return null;
  const chapter = opts.subject && opts.chapter ? catalog.chapter(opts.subject, opts.chapter) : null;
  const subject = opts.subject ? catalog.subject(opts.subject) : null;
  const title = chapter ? chapter.name : subject ? `${subject.name} · quick practice` : "Quick practice · mixed";
  const mode = opts.mode ?? "learning";
  return startPractice({
    exam,
    mode,
    title,
    questionIds: ids,
    scope: { subject: opts.subject, chapter: opts.chapter, source: chapter ? "chapter" : subject ? "subject" : "quick" },
    durationSec: mode === "test" ? Math.max(5, ids.length * 2) * 60 : null,
  });
}

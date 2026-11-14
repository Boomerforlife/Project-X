/**
 * Single source of truth for "should this public page be indexed?".
 * Used by page metadata (robots) AND the sitemap so the two never disagree.
 */
import type { Question } from "@/contracts";
import { MIN_QUESTIONS_TO_INDEX_CHAPTER } from "@/lib/seo";

export function isQuestionIndexable(q: Question) {
  return q.publicPage && q.hasSolution && q.verification.status !== "disputed";
}

export function isChapterIndexable(questionCount: number) {
  return questionCount >= MIN_QUESTIONS_TO_INDEX_CHAPTER;
}

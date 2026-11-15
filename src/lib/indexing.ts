/**
 * Single source of truth for "should this public page be indexed?".
 * Used by page metadata (robots) AND the sitemap so the two never disagree.
 */
import type { Question, QuestionCard } from "@/contracts";
import { MIN_QUESTIONS_TO_INDEX_CHAPTER } from "@/lib/seo";

/** Full questions carry `hasSolution`/`verification`; list cards carry only `indexable`/`publicPage`. */
export function isQuestionIndexable(q: Question) {
  return (q.indexable ?? true) && q.publicPage && q.hasSolution && q.verification.status !== "disputed";
}

/** Card-level check (sitemap / lists): the server's `indexable` flag plus public-page eligibility. */
export function isCardIndexable(q: Pick<QuestionCard, "indexable" | "publicPage">) {
  return (q.indexable ?? true) && q.publicPage;
}

export function isChapterIndexable(questionCount: number) {
  return questionCount >= MIN_QUESTIONS_TO_INDEX_CHAPTER;
}

# Content integrity — answers and difficulty (2026-11-22)

Read-only audit of the production question bank (Supabase, session forced read-only). No data was changed.

## Inventory

| Exam | Status | Verification | Count | Notes |
|---|---|---|---|---|
| JEE Main | PUBLISHED | OFFICIAL_KEY_MATCHED | 4,825 | public pages; 4,449 in sitemap |
| JEE Main | PUBLISHED | AUTOMATED_CHECKS_PASSED | 433 | AI-generated practice items, NOINDEX, no public page |
| JEE Main | DRAFT | PENDING / HUMAN_REVIEW_REQUIRED | 1,189 | 1,183 have no answer key |
| JEE Advanced | DRAFT | PENDING / HUMAN_REVIEW_REQUIRED | 1,053 | no chapter, no solution; 751 no key |
| NEET UG | DRAFT | PENDING | 290 | no chapter, key, solution or difficulty |

## Answers (T2)

Every published question has an answer key and a current solution. Checks on all 5,258 published questions:

- Key type matches question type: 0 mismatches.
- MCQ keys reference real options of the same question: 0 dangling ids. Every MCQ has 4 options.
- Numerical keys: every range parses, min <= max, display value present.
- Answer key equals the current solution's final answer: 0 mismatches.

Defect found and fixed in the web (commit c471bd3): 3 single-correct PYQs where NTA accepts two options, and 9 numerical
PYQs with several accepted values or an accepted range. Server grading was correct. The public question page showed
only one accepted value and its "check your answer" box marked the other officially accepted answers as wrong.

Not verifiable without new source material: the 1,183 + 751 + 290 drafts without keys. Their answers must come from
official keys (pxw-ingest key linking). Nothing was inferred or generated.

## Difficulty (T3)

All 4,825 published PYQs carry `difficulty_source = 'AI'`: Claude read the question image plus OCR text against a written
rubric (owner decisions 2026-11-20/21, apps/api/src/content/chapter-ai.ts). The 433 AI practice items have
difficulty with no source recorded.

| Subject | Easy | Medium | Hard |
|---|---|---|---|
| Chemistry (1,614) | 55.1% | 41.9% | 3.0% |
| Mathematics (1,605) | 8.8% | 80.3% | 10.9% |
| Physics (1,606) | 45.7% | 49.4% | 4.9% |

Assessment:
- The ordering matches the usual perception of JEE Main (Chemistry easiest, Mathematics hardest), but the scale is
  compressed: Hard is rare everywhere (3–11%), and Mathematics is almost all Medium. Treat ratings as coarse.
- Empirical validation is not possible yet: there are 8 attempts in total (2 users). The STATS path
  (`rate-difficulty` job, difficulty-stats.ts) will replace AI ratings as attempts accumulate. Its nightly Cloud Scheduler
  trigger still needs `run.invoker` on the job for the projectx-api service account (owner-only IAM change).
- UI honesty fix (this branch): the difficulty chip now says "Estimated difficulty, not an official rating" on hover and
  to screen readers. Exam bodies publish no difficulty, so every rating is an estimate.

Recommended next steps (Person 2):
1. Expose `difficulty_source` in public/practice DTOs so the UI can say "rated from student results" once STATS applies.
2. Grant the scheduler `run.invoker` so STATS ratings start replacing AI ones automatically.
3. Spot-check: sample 30 per subject × level and have a teacher re-rate. Agreement below ~70% means re-running with a
   calibrated rubric (e.g. target shares per subject).

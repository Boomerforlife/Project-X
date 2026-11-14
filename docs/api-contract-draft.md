# API contract — draft proposal from Person 1

**Status: PROPOSAL. Nothing here is agreed.** Person 2 owns the backend; this doc lists what the
frontend currently assumes so we can confirm, change, or replace it in the alignment meeting.

The executable version of these shapes is `src/contracts/index.ts` (Zod). Mock fixtures in
`src/fixtures/` are validated against it in `src/lib/data/index.ts` and `src/lib/core.test.ts`.
When the real schema/OpenAPI exists, it replaces that module, and fixtures and UI get updated together.

## What the public (SEO) pages need today

| Need | Proposed shape | Open question |
|---|---|---|
| Subjects | `Subject { id, name, summary }` | Is `summary` editorial content Person 2 stores, or frontend copy? |
| Chapters | `Chapter { slug, name, subject, grade, summary, topics[] }` | Who owns slugs? They become public URLs, so slug changes need redirects. |
| Questions | `Question { id, slug, exam, subject, chapter, topic?, type, stem, options[], assets[], difficulty?, source, verification, hasSolution, publicPage }` | See the questions below. |
| Solutions | `Solution { questionId, answer, answerProvenance, steps[], generatedBy, verification }` | Are solutions public on question pages, or gated by login/attempt? |
| Papers | `PaperSummary { id, exam, year, session, date, shift, questionCount, durationMinutes }` | Exam rules (marking, sections) should live on the paper, not in UI code. |

## Specific questions for Person 2

1. **Math representation.** The frontend currently assumes a string with `$…$` / `$$…$$` TeX, rendered server-side with KaTeX. Is that the stored format? Are figures referenced inline or only via `assets[]`?
2. **`publicPage` flag.** The frontend only creates `/jee/questions/[slug]/` for questions where the backend says the page is eligible (quality, deduplication, licensing). Can the backend own that decision?
3. **Verification vocabulary.** UI labels (proposed, in `src/components/ui/Badges.tsx`):
   - `extracted` / `processed` → "Unreviewed"
   - `ai_checked` → "AI-checked" (explicitly not human-verified)
   - `official_key_checked` → "Matches official key"
   - `human_reviewed` → "Reviewed"
   - `disputed` → "Under review"
   
   What does each status guarantee? Can a question be `official_key_checked` while its *explanation* is still AI-only? (That's why `Solution` has its own `verification` and `generatedBy`.)
4. **Answer provenance.** `answerProvenance: official_key | derived | unknown`. The UI never says "official" unless this is `official_key`.
5. **Numerical tolerance.** Per question, or per paper/exam rule?
6. **Source of PYQs.** `source.kind = "pyq"` includes year, session, date and shift. Is that granular enough? Paper IDs?
7. **Caching and revalidation.** Public pages are statically prerendered. We'd like a webhook or tag (`question:{id}`, `chapter:{slug}`) to revalidate when content changes.
8. **Slug stability and redirects.** If a slug changes or a question is merged as a duplicate, can the API expose `{ oldSlug → newSlug }` so the frontend can issue 308s?

## Not yet proposed (needed for Stages 3–5)
Auth and session, attempts (create/autosave/resume/submit/retry), responses per question type, scoring and negative marking, hints, bookmarks/review/mistakes, analytics. See `docs/PERSON-1-PERSON-2-INTEGRATION.md`. The frontend will build these against typed fixtures and won't wire guessed endpoints.

## Demo build (Nov 2026): what the frontend now assumes

The whole app runs as a clickable demo on mock data. Everything below is a **proposal** shaped by building the screens. None of it is wired to an endpoint.

### Content changes to the draft schemas (`src/contracts/index.ts`)
- `ExamId` now covers `jee-main`, `jee-advanced` and `neet`. `SubjectId` adds `biology`.
- `Question.exam` became `Question.exams: ExamId[]`, because one Physics item can serve JEE and NEET. Is that how you want to model it, or should there be one row per exam?
- `Chapter.exams: ExamId[]` (syllabus membership) and an optional `Chapter.group` (NEET Biology → `"Botany"` / `"Zoology"`).
- `Hint { questionId, body, generatedBy }` is served separately from `Solution`, and only in Learning mode.
- `Paper` extends `PaperSummary` with `kind: "pyq" | "mock"`, `title`, nullable `year/session/shift/date`, `isDemo`, `sections[]` and `instructions[]`. Each `PaperSection` carries its own `marking: MarkingScheme` (`{ correct, incorrect, unattempted, partial }` per question type). **Exam rules live on the paper, never in UI code.**
- `date` is nullable on purpose. The demo never invents sitting dates.

### Attempt model the screens need (today in `src/lib/demo/`, localStorage only)
- `Attempt { id, exam, mode: learning | test | cbt, kind: practice | paper, paperId?, retryOf?, questionIds, sections, durationSec, startedAt, submittedAt, status, current, elapsedSec, responses }`
- `Response { questionId, answer: { optionIds? , value? } | null, checked, markedForReview, visited, timeSpentSec, savedAt }`
- A retry is always a new attempt with `retryOf` pointing at the original. The original is never modified.
- Learning mode records an outcome when the student presses **Check**. Test mode and CBT record outcomes only on submit.
- The demo computes scores in the browser (`src/lib/demo/scoring.ts`) only so results can be shown. **In production the server must score.**

### Proposed product rules to confirm
- **Streak day:** at least 5 answered questions that day.
- **XP:** +10 correct, +5 partial (multi-correct), +2 genuine wrong attempt, +15 for clearing a mistake, +50 for finishing a paper (at least half the paper attempted).
- **Mistake notebook:** an incorrect or partial answer opens a record; answering the same question correctly later marks it cleared.
- **Leaderboard:** weekly practice XP within the same exam, first name plus initial, with an opt-out. It is never presented as a rank or percentile.

### Endpoints the UI will need (names are placeholders until agreed)
Session/auth; content (subjects, chapters, questions, papers); `POST /attempts`, autosave of responses, submit, results; hints; bookmarks, review list and mistakes (including the category tag); analytics summary (totals, streaks, activity by day, subject/chapter accuracy, weekly trend); leaderboard.

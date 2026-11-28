# Backend contracts the UX overhaul still needs (for Owner B)

The UX/IA overhaul (branch `feat/ux-ia-overhaul`, audit 2026-11-28) shipped everything the existing API already
supports. Verified during implementation, so these are **not** needed:

- Public paper list with slugs, years and shifts: `GET /public/papers` (PYQ hub, year and paper pages use it).
- Chapter filters by year, type, difficulty and topic: `GET /public/chapters/{slug}` and `GET /practice/questions`.
- Recording an answer outside a session: `POST /practice/attempts` without `session_id` (public question pages and the
  client-side list sessions use it).
- Year filters for sessions: `CreateSessionBody.filters.year_from` / `year_to` (the chapter Practise sheet uses them).

What remains needs new backend work. Each item says what the frontend does today, so nothing is blocked.

## K5 — Save answers during timed attempts (CBT, timed tests)

- **Today:** answers live in browser storage until Submit, then post one by one. The CBT now says so honestly ("Saved on
  this device") and Submit waits for every answer with a Retry dialog, but clearing site data or switching device before
  Submit still loses a paper.
- **Ask:** `PUT /practice/sessions/{id}/draft` storing `{ responses: { [question_id]: { response | null, marked_for_review,
  time_spent_ms } }, current_index, elapsed_sec }`, idempotent, last-write-wins by a client sequence number; returned by
  `GET /practice/sessions/{id}` so another device can resume. No grading, no answers in the reply.
- **Frontend after:** keep the local draft as a cache, save to the server on each change (debounced), show "Saved"
  only when the server confirmed it.

## K6 — Review list, mistake reasons and the latest diagnostic on the server

- **Today:** the review list, mistake reasons and the pointer to the last diagnostic are browser-only (labelled "Saved on
  this device"). A second device can't build a plan without retaking the diagnostic.
- **Ask:** `GET/PUT/DELETE /users/me/review` (like bookmarks), `PATCH /users/me/mistakes/{question_id}` with
  `{ reason }` (conceptual gap, calculation error, formula recall, misread, time pressure), and
  `GET /plans/diagnostic/latest`.

## Paper question list

- **Ask:** an optional `paper` (slug) filter on `GET /practice/questions`, returning the paper's questions in paper order.
- **Frontend after:** the paper page lists its questions and "Solve untimed" can start at any question.

## K7 — Crop the paper header out of scanned question images

- **Today:** some stems still show NTA's banner (e.g. "Orientation: Vertical"). The web dims white scans in the dark theme
  and offers tap-to-zoom, but it can't remove printed text.
- **Ask:** crop at ingestion (or store a cropped variant) for affected images.

## Analytics event (optional)

- The web records public-page answers but has no analytics event for them, because `AnalyticsEvent` is a fixed list.
  Add `public_attempt_recorded` if you want it counted.

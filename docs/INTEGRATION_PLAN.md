# ProjectX: Web ↔ API integration plan (binding for this pass)

Status: written 2026-11-15 by the lead architect on `integration/web-api`. Audience: Sonnet workers W-A, W-B, W-C.
Inputs read: `CLAUDE.md` (Owner A's frontend conventions), `src/contracts/index.ts`, `src/lib/data/*`, `src/lib/demo/*`,
`docs/api-contract-draft.md`, `docs/PERSON-1-PERSON-2-INTEGRATION.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACTS.md`,
`docs/DATABASE_SCHEMA.md`, `docs/STATUS.md`, `packages/contracts/src/**`, `apps/api/src/**`, `supabase/**`.

Precedence when documents disagree: wire shapes = `API_CONTRACTS.md` + `packages/contracts`; UX and URLs = `CLAUDE.md`;
everything about *how we wire the two together* = this file.

---

## 0. Ground rules (read first)

1. **Owner A's URLs, layouts and copy stay.** Public URLs remain `/{track}/{subject}/{chapter}/` and
   `/{track}/questions/{slug}/` (trailing slash). The backend's `canonical_path`, `seo.*` and `breadcrumbs` are **not** used
   for URLs; the frontend computes its own. `seo.robots` / `indexable` **is** used for the noindex decision.
2. **Mock mode is whole-app, never per entity.** If the API is not configured, everything runs on fixtures exactly as today.
   If the API is configured, public pages never fall back to fixtures (an API failure is an error page or stale cache, never
   sample content that could be indexed). The only fixture-backed surfaces in API mode are explicitly flagged demo features
   (section 3.4), all private and noindex.
3. **The server is authoritative** for identity, grading, correctness, streaks, mistakes and progress. The browser never
   computes a score it presents as real in API mode.
4. **Additive-only backend changes** in v1 (new optional fields, new endpoints). Every backend change in this plan is
   additive; each one updates `packages/contracts`, regenerates `packages/contracts/openapi/openapi.json`, and adds a
   `packages/contracts/CHANGELOG.md` entry.
5. Zod response parsing strips unknown keys (Zod default), so additive backend fields never break the web.
6. npm workspaces is the package manager (ARCHITECTURE section 2). `pnpm-lock.yaml` is stale and is deleted by W-A.
7. Next 16.4.6 is not the Next.js in your training data. Read `node_modules/next/dist/docs/` before using any Next API
   (see `node_modules/next/AGENTS.md`). Facts verified for this plan:
   * With `cacheComponents: true`, `generateStaticParams` on a dynamic route **must return at least one param**; an empty
     array is a build error (`generate-static-params.md`).
   * Uncached data access outside `<Suspense>` fails prerender, so every API-backed server data function uses
     `"use cache"` + `cacheLife({...})` + `cacheTag(...)`.
   * `revalidateTag(tag, profile)` takes two arguments (one-argument form is deprecated). From a webhook route handler use
     `revalidateTag(tag, { expire: 0 })`.
   * `cacheTag` accepts up to 128 tags per call, 256 chars each.
   * `server-only` is optional; do not import it in modules that vitest loads.

---

## 1. Field-by-field mapping and decisions

Legend for the decision column: **ADAPT** = frontend adapter in `src/lib/api/adapters/**` (no backend change);
**EXTEND-Bn** = backend change `Bn` from section 1.9 (this pass); **LATER-Ln** = backend change specified in 1.10, not this
pass, frontend keeps current behaviour behind a flag; **DEMO** = stays on fixtures/local state behind a flag.

### 1.1 Identifiers

| Frontend | Backend | Decision |
|---|---|---|
| `ExamId` `jee-main` | exam slug `jee-main` (active) | ADAPT identity |
| `ExamId` `jee-advanced` | `jee-advanced` (seeded, `is_active=false`) | ADAPT identity. Inactive exams return 404 / are absent from `/taxonomy/exams`; adapter treats them as "no content". |
| `ExamId` `neet` | `neet-ug` (seeded, inactive) | ADAPT: `neet ↔ neet-ug` in `adapters/ids.ts`. Never rename either side. |
| `Track` `jee` / `neet` | no concept | ADAPT: track → exams via `TRACK_INFO`; intersect with active exams from `GET /taxonomy/exams`. |
| `SubjectId` `physics`/`chemistry`/`mathematics` | per-exam subject, `segment` = same word, `slug` = `{exam}-{segment}`, `code` | ADAPT: `SubjectId = segment`. Keep a `(exam, SubjectId) → subject slug/uuid` map from the taxonomy tree. |
| `SubjectId` `biology` | NEET has `botany` + `zoology` (codes BOTANY/ZOOLOGY) | ADAPT: both map to `biology`; chapter `group = "Botany" \| "Zoology"` from the backend subject name. NEET is inactive, so this is code + unit test only. |
| `Chapter.slug` (e.g. `kinematics`) | `ChapterRef.segment` (same slugify), `ChapterRef.slug` = `jee-main-physics-kinematics` | ADAPT: frontend slug = `segment`; backend calls use `slug` looked up from the tree. |
| `Topic.slug` | `TopicRef.segment` | ADAPT. |
| `Question.id` | uuid | identity (stable). |
| `Question.slug` | slug (with `slug_redirects` → 301) | identity; handle 301 (1.3). |
| `Option.id` = `"A"`.."E"` (UI renders it as the label) | `PublicOption.id` uuid + `label` A–E | ADAPT: `Option.id = label`; **new optional `Option.ref = uuid`** (src/contracts, W-A). Submissions map label → ref. |
| `Attempt.id` (`att_…`) | `practice_sessions.id` uuid | ADAPT: in API mode `Attempt.id = session.id` (single-question practice without a session uses a local `single_<questionId>` id). |
| `Paper.id` | `exam_papers.slug` (no public endpoint) | DEMO (1.6). |

### 1.2 Subject / Chapter / Topic

| Frontend field | Source in API mode | Decision |
|---|---|---|
| `Subject.id` | `SubjectRef.segment` | ADAPT |
| `Subject.name` | `SubjectRef.name` | ADAPT |
| `Subject.summary` | none | ADAPT: **editorial overlay** = Owner A's `src/fixtures/syllabus.ts` `subjects[].summary` (frontend copy, not data). Missing → `""`. |
| `Chapter.name` | `ChapterRef.name` | ADAPT (backend wins over fixture names). |
| `Chapter.subject` | parent subject segment | ADAPT |
| `Chapter.exams[]` | exams whose tree contains the same `(subject segment, chapter segment)` | ADAPT (union across active exams in the track). |
| `Chapter.group` | NEET subject name (Botany/Zoology) | ADAPT |
| `Chapter.grade` | DB has `chapters.class_level` but it is not in any DTO and is null in seeds | ADAPT: overlay from `syllabus.ts` by `(subject, slug)`; **make `Chapter.grade` optional** in `src/contracts` (W-A); chapter page renders "Class N" only when present (W-B). |
| `Chapter.summary` | `PublicChapter.chapter.description` (null today) | ADAPT: `description ?? overlay.summary ?? ""`. |
| `Chapter.topics[]` | `TaxonomyTree … chapters[].topics[]` | ADAPT (backend authoritative; overlay topics ignored in API mode). |
| ordering | `unit_number` / tree order | ADAPT: keep tree order. |
| chapter list for a track | `GET /taxonomy/tree?exam=` per active exam | ADAPT |
| question counts | `GET /public/exams/:slug` (`subjects[].published_question_count`), `GET /public/subjects/:slug` (`chapters[].published_question_count`) | ADAPT: `getQuestionCounts(track)` keeps its return shape `{bySubject, byChapter, total}`. |

### 1.3 Question

| Frontend `Question` | Backend (`PublicQuestion` / `PracticeQuestion` / `QuestionSummary`) | Decision |
|---|---|---|
| `id`, `slug` | same | ADAPT |
| `exams[]` | single `exam` | ADAPT: `[mapExam(exam.slug)]`. Backend models one row per exam; the frontend array stays (Owner A's open question is answered: one row per exam). |
| `subject`, `chapter`, `topic` | `subject.segment`, `chapter.segment`, `topic?.segment` | ADAPT |
| `type` `single_correct`/`multiple_correct`/`numerical` | `SINGLE_MCQ`/`MULTI_MCQ`/`NUMERICAL` | ADAPT |
| `difficulty` lowercase | `EASY/MEDIUM/HARD \| null` | ADAPT (`null → undefined`). |
| `stem: RichText` (`$…$`, `$$…$$`) | `content: PublicContentBlock[]` (paragraph with inline `$…$` + markdown-lite `**b**`/`*i*`, `math` = display, `image`, `table`, `list`) | ADAPT + small frontend extension: **new optional `Question.blocks`, `Option.blocks`, `Solution.steps[].blocks`** typed as `PublicContentBlock[]` re-exported from `@projectx/contracts`. `stem`/`body` stay as a lossy RichText serialization (`blocksToRichText`: paragraphs joined by blank line, math → `$$…$$`, list items → lines, tables → tab-separated rows, images dropped) used for excerpts, metadata and fallback. W-B adds `<Blocks>` renderer that prefers `blocks` and falls back to `RichText`. |
| `assets[]` | image blocks (`url`, `alt`, `width?`, `height?`) | ADAPT: only images with non-null width and height go into `assets` (schema requires positive ints); `<Blocks>` renders all images with `alt`. |
| `options[]` | `options[]` (`label`, `content`) | ADAPT (`id=label`, `ref=uuid`, `body=blocksToRichText`, `blocks`). Empty for NUMERICAL. |
| `source` `{kind:"pyq", exam, year, session, date, shift}` | `attribution.origin` + `attribution.paper {year, session_label, exam_date, shift}` | ADAPT: `PYQ` → `pyq` with **nullable `session`/`date`/`shift`** (W-A relaxes the contract; W-B makes `SourceLabel` skip missing parts and use the exam name instead of the hard-coded "JEE Main"). `EDITORIAL`/`AI_GENERATED` → `original`. Never `sample` in API mode. |
| `verification.status` | `verification.status ∈ {OFFICIAL_KEY_MATCHED, HUMAN_VERIFIED}` on public DTOs | ADAPT: `OFFICIAL_KEY_MATCHED → official_key_checked`, `HUMAN_VERIFIED → human_reviewed`. Full table in 1.5. |
| `verification.note` | `verification.label` | not mapped; UI keeps `VERIFICATION_COPY`. |
| `hasSolution` | public DTO always carries a solution | ADAPT: `true` for `PublicQuestion`. Not known for `PracticeQuestion`/summaries → `true` (published implies approved solution per publication guard 0013/0014). |
| `publicPage` | every PUBLISHED question has a public page | ADAPT: `true` for anything returned by public endpoints. |
| *(new)* `indexable?: boolean` | `indexable` / `seo.robots` | ADAPT: add optional field (W-A). `isQuestionIndexable(q)` becomes `(q.indexable ?? true) && q.publicPage && q.hasSolution && status !== "disputed"` (W-B). |
| list items on chapter pages / related | `QuestionSummary` (`excerpt` ≤200 chars, may contain TeX, can be cut mid-formula) | ADAPT to a **new `QuestionCard` type** (1.3.1). |
| `year` (not in `Question`) | `year` | carried on `QuestionCard` and `source`. |
| `marks`, `negative_marks` | dec strings | ADAPT into `PracticeItem.marking` for Phase 2 results only; not added to `Question`. |
| slug change | 301 `MOVED_PERMANENTLY`, `details.slug` | ADAPT: `getQuestionPage` returns `{status:"moved", slug}`; page calls `permanentRedirect('/{track}/questions/{slug}/')`. |

#### 1.3.1 `QuestionCard` (new, W-A in `src/contracts/index.ts`)

```ts
export type QuestionCard = Pick<Question, "id" | "slug" | "exams" | "subject" | "chapter" | "topic" | "type" | "difficulty" | "publicPage"> & {
  stem: RichText;            // full stem in mock mode, backend `excerpt` in API mode
  year?: number | null;
  indexable?: boolean;
};
```
A fixture `Question` is structurally assignable to `QuestionCard`, so mock mode needs no mapping. `getQuestions()` and
`getPublicQuestions()` return `QuestionCard[]` (names and parameters unchanged). Consumers that only read card fields
(QuestionList, chapter page, sitemap, question-page related list) compile unchanged; W-B fixes the rest.

### 1.4 Solution, answer key, gating

| Frontend `Solution` | Backend `PublicSolution` | Decision |
|---|---|---|
| `questionId` | parent question id | ADAPT |
| `answer` single | `final_answer {type:SINGLE_MCQ, correct_option_ids, correct_labels}` | ADAPT: `optionId = correct_labels[0]` (fallback: map uuid → label via options). |
| `answer` multiple | `MULTI_MCQ` | ADAPT: `optionIds = correct_labels`. |
| `answer` numerical `{value, tolerance}` | `{accepted_ranges[{min,max}], display_value}` decimal strings | ADAPT: `value = Number(display_value)`, `tolerance = 0`, **new optional `display?: string`** (= `display_value`, W-A). `answerText()` prefers `display`. Grading never happens in the browser in API mode. |
| `answerProvenance` `official_key`/`derived`/`unknown` | not exposed (DB has `answer_key_source`) | ADAPT conservatively: `OFFICIAL_KEY_MATCHED → official_key`, otherwise `derived`. Never claim "official" without evidence (CLAUDE.md section 7). LATER-L8 exposes `answer_key_source`. |
| `steps[]{title?, body}` | `steps[]{index, title, blocks}` | ADAPT (`body = blocksToRichText(blocks)`, `blocks` kept). |
| `generatedBy` `human`/`ai`/`ai_human_edited` | `provenance` `HUMAN_AUTHORED`/`AI_GENERATED`/`AI_HUMAN_EDITED`/`OFFICIAL` | ADAPT; **add `"official"` to the frontend enum** (W-A) with copy "From the official source" (W-B, question page `AUTHOR`). |
| `verification` | none per solution | ADAPT: copy the question's mapped status (approved solution is part of what HUMAN_VERIFIED / OFFICIAL_KEY_MATCHED means). |
| extras: `summary`, `formulas`, `concepts`, `alternatives`, `shortcuts`, `common_mistakes`, `approved_at` | present | ADAPT: carried on an optional `Solution.extras` object (W-A). Rendering them is Owner A's design call; W-B renders `summary` above steps only if non-null. |
| **Gating: public page** | `GET /public/questions/:slug` includes the solution | Keep Owner A's behaviour: solution in server HTML inside a collapsed `<details>`. |
| **Gating: practice** | `PracticeQuestion` never contains answers (contract test); answer + solution arrive only in `AttemptResult` after the attempt is stored | Learning mode: "Check" = `POST /practice/attempts`, then show `correct_answer` + `solution`. Test mode: nothing is posted until submit, so nothing can leak. Integrity holds because revealing an answer *requires* a recorded attempt. |

### 1.5 Verification vocabulary

| Backend `VerificationStatus` | Visible on public DTOs? | Frontend status | Badge copy (existing `VERIFICATION_COPY`) |
|---|---|---|---|
| `PENDING` | no | `processed` | Unreviewed |
| `AUTOMATED_CHECKS_PASSED` | no | `ai_checked` | AI-checked |
| `OFFICIAL_KEY_MATCHED` | **yes** | `official_key_checked` | Matches official key |
| `HUMAN_REVIEW_REQUIRED` | no | `processed` | Unreviewed |
| `HUMAN_VERIFIED` | **yes** | `human_reviewed` | Reviewed |
| `DISPUTED` | no (auto-unpublished) | `disputed` | Under review |
| *(none)* | | `extracted` | unused in API mode |

Meaning (agreed by reading the publication guard, migrations 0013/0014): a published question is either
human-verified (reviewer approved question + solution) or its answer matched the official key. The *explanation* may still
be AI-authored in the second case; the solution's `generatedBy` says so. Only the two public statuses ever render in API mode.

### 1.6 Papers, mock tests, CBT

Backend has `exam_papers` and session mode `PYQ_PAPER`, but no paper list/detail endpoint, no sections, duration,
instructions or per-section marking, session size is capped at 50 (JEE Main is 75), and no PYQs are licensed yet.
**Decision: DEMO behind `NEXT_PUBLIC_FEATURE_PAPERS`.** `getPapers`/`getPaper` stay fixture-backed in every mode (keeps
`/tests/[paperId]` `generateStaticParams` non-empty). In API mode:
* `NEXT_PUBLIC_FEATURE_PAPERS` unset/`off` (default): `/tests/` and the CBT entry points render a "Full papers are coming
  soon" empty state; dashboard/achievement items about papers/CBT are hidden.
* `=demo`: current demo behaviour, attempts stay in localStorage, every screen shows the demo label (`Paper.isDemo`).
* Public `/{track}/pyq/` pages filter to `!isDemo` in API mode (so they show the empty state and are noindex).
Backend work is LATER-L4/L5.

### 1.7 Attempts and responses

| Frontend (`src/lib/demo/types.ts`) | Backend | Decision |
|---|---|---|
| `Attempt` (practice) | `practice_sessions` + `attempts` | ADAPT (Phase 2). `Attempt.id = session.id`, `questionIds = session question order`, `sections` built client-side by subject with marking from each question's `marks`/`negative_marks` (`MarkingRule {correct:+marks, incorrect:-negative_marks}`). |
| `Attempt.mode` `learning`/`test` | sessions have only a selection mode | EXTEND-B4: `ui_mode` + `time_limit_sec` stored on the session so resume works on another device. |
| `Attempt.kind` `paper` / `cbt` mode | — | DEMO (1.6). |
| `scope.source` → session mode | `PracticeMode` | ADAPT: `chapter→CHAPTER`, `subject→SUBJECT`, `quick→MIXED` (or `SUBJECT` when a subject is chosen), `mistakes→MISTAKES`, `bookmarks→BOOKMARKS`, `single→` no session (attempt without `session_id`), `review→` not supported in API mode (button hidden until LATER-L2). |
| question selection (`pickQuestions`) | server-side random, `exclude_correct` default true | ADAPT: the browser no longer picks ids in API mode. `422 {reason:'NO_QUESTIONS'}` → empty state "You have solved everything here; include solved questions?" → retry with `filters.exclude_correct=false`. |
| `difficulty` single | `filters.difficulty[]` | ADAPT. |
| count 5/10/20 | `size` 1..50 | ADAPT. |
| `Response.answer {optionIds?, value?}` | `AnswerResponse` by type, option **uuids**, numerical `value` decimal string | ADAPT in `adapters/practice.ts`: `toAnswerResponse(question, answer)`; numerical value validated against `/^-?\d+(\.\d+)?$/` before submit (UI shows inline error otherwise). |
| `checked` (learning) | attempt stored | learning "Check" → `POST /practice/attempts` (with `session_id`), outcome from `is_correct`. Locked after check (backend `ALREADY_ATTEMPTED` enforces). |
| `markedForReview`, `visited`, `current`, `elapsedSec` | none | local draft (below) until LATER-L3. |
| `timeSpentSec` | `time_spent_ms` | ADAPT (×1000, clamp 0..10 800 000). |
| `savedAt` | `submitted_at` | ADAPT. |
| **autosave** (test mode, before submit) | none | **Local draft only this pass**: `localStorage["projectx-drafts-v1:{userId}:{sessionId}"]` holds answers, flags, current index, elapsed time and the `client_attempt_id` reserved per question. Clearly labelled "Saved on this device" in the UI. LATER-L3 moves it server-side. |
| **submit** (test mode) | per-question `POST /practice/attempts`, then session complete | ADAPT + EXTEND-B5. Sequential posts, each with a `client_attempt_id` written to the draft *before* the request (idempotent retry). `429` → wait `Retry-After`, continue; `409 ALREADY_ATTEMPTED` → treat as done; network loss → "Submitting 7/20, will retry" with a Retry button; the draft is deleted only after `POST …/complete` succeeds. Unanswered questions are not posted. Max 20 questions (≤ RL_ATTEMPTS 60/min). |
| **resume** | `GET /practice/sessions/:id` (items + attempts) | ADAPT + EXTEND-B3 (list ACTIVE sessions) + EXTEND-B2 (response echoed in `AttemptResult`). Merge server attempts over the local draft; server wins on conflict. |
| retry = new attempt | new session | ADAPT: "Retry" creates a new session with the same scope; old one untouched. |
| `discardAttempt` | `POST /practice/sessions/:id/abandon` | ADAPT. |
| results / `scoreAttempt` | `AttemptResult.is_correct`, `score`; `SessionProgress.score` | ADAPT: in API mode results come only from server data. `partial` outcome never occurs (`PARTIAL_MULTI` is reserved server-side; treated as STANDARD). |

### 1.8 Profile, onboarding, lists, progress, gamification

| Frontend | Backend | Decision |
|---|---|---|
| `DemoUser.name` | `Me.display_name` | ADAPT; signup sends `options.data.display_name` (the `handle_new_user` trigger reads it). |
| `DemoUser.exam` | `Me.target_exam` | ADAPT (`PATCH /users/me {target_exam}` + `PUT /users/me/exam-preferences` primary). |
| `DemoUser.classLevel` `11`/`12`/`dropper` | none | EXTEND-B1 (`profiles.class_level`). |
| `DemoUser.dailyGoal` | `daily_goal_attempts` (1..500) | ADAPT |
| `DemoUser.onboarded` | `PATCH {onboarding_completed:true}` exists but `Me` does not return it | EXTEND-B1 (`Me.onboarding_completed`). |
| `DemoUser.joinedAt` | `Me.created_at` | ADAPT |
| timezone | `Me.timezone` (default Asia/Kolkata) | onboarding PATCHes `Intl.DateTimeFormat().resolvedOptions().timeZone`. |
| `showOnLeaderboard`, `cosmetic` | none | local per-device preference (`projectx-prefs-v1:{userId}`). |
| bookmarks | `GET/POST/DELETE /users/me/bookmarks` | ADAPT, optimistic toggle with rollback + toast on failure. |
| review list | none | DEMO (local per-device list, labelled) → LATER-L2. |
| mistakes list | `GET /users/me/mistakes?status=all`, `DELETE …/:questionId` | ADAPT: `status = resolved_at ? "resolved" : "open"`, `at = last_wrong_at`, `reattempts = wrong_count - 1`, `attemptId = ""`. Opening/resolving is done by DB triggers on attempts (same rule as the demo: wrong opens, correct resolves). |
| mistake `category` | none | local overlay keyed by question id (per device, labelled) → LATER-L1. |
| `activity` by day (heatmap, weekly trend) | `streak.last_7_days` only | EXTEND-B6 `GET /users/me/activity`. Per-day subject split is not available: `DayActivity.subjects` stays `{}` in API mode; subject breakdowns use `GET /users/me/progress`. |
| subject/chapter stats, weak chapter | `GET /users/me/progress` (`weak_areas`: ≥5 attempts and accuracy < 0.5) | ADAPT: `subjectStats`/`chapterStats` read `progress`; `recommendation()` uses `weak_areas[0]` else first untouched chapter with `published_question_count ≥ 6`. |
| **streak** (demo: day counts at ≥5 answers) | server: a day counts with ≥1 graded attempt, in the user's timezone | **Server rule wins.** `streaks()` returns `{current: current_streak, longest: longest_streak, todayDone: today_attempts ≥ 1}`; copy that mentions "5 questions" is changed to "answer at least one question". Product may ask for a threshold later (blocking question Q3). |
| daily goal met | `goal_met_today` | ADAPT |
| **XP / level / cosmetics unlocks** | none | ADAPT (display-only, derived from server truth): `xp(day) = 10·correct + 2·(attempts − correct)` from B6 rows. Paper bonus and mistake-cleared bonus are dropped in API mode. Documented as a derived display metric, not stored. Server-owned XP is LATER-L6. |
| achievements, weekly challenges | none | ADAPT from the derived state; paper/CBT achievements and challenges hidden when papers are off. |
| **leaderboard** (mock peers) | none | **Hidden in API mode** (`NEXT_PUBLIC_FEATURE_LEADERBOARD` default off): mock peers are fake data and must not ship as real (CLAUDE.md section 14). LATER-L6. |
| hints | none | Hidden in API mode (`catalog.hint()` returns `null`; the player already hides the button when null). LATER-L7. |
| report question | none | ADAPT: `POST /doubts {body: "[REPORT:<reason>] <text>", question_id}` (exists, optional auth, staff-only, rate limited). LATER-L9 adds a proper reports endpoint. |
| analytics summary (totals) | `progress.totals` | ADAPT |

### 1.9 Backend extensions in THIS pass (owner: W-A)

All additive. Each needs: contract schema change, route/service change, **both** repositories
(`apps/api/src/repositories/memory/store.ts` and `sql/store.ts`), tests in `apps/api/test/routes.memory.test.ts` and
`sql.integration.test.ts`, `npm run openapi`, CHANGELOG entry.

| Id | Phase | Change |
|---|---|---|
| **B0** | 1 | `SitemapEntrySchema` += `slug: SlugSchema`, `exam_slug: SlugSchema` (the web needs the track to build `/{track}/questions/{slug}/`). |
| **B7** | 1 | Web revalidation webhook. `@projectx/edge`: `createWebhookInvalidator({ url, secret, fetch? })` → `purgeTags(tags)` does `POST url` with `Authorization: Bearer <secret>`, body `{"tags": [...]}`, 3 s timeout, never throws (logs). `apps/api` config: optional `WEB_REVALIDATE_URL`, `WEB_REVALIDATE_SECRET` (secret ≥ 32 chars when URL set). `worker.ts` and `node.ts` append it to the invalidator list when both are set (node.ts today uses noop; it becomes composite(noop-or-list + webhook)). Add both vars to `.env.example` and ARCHITECTURE section 9 (the edge env test enforces this). |
| **B1** | 2 | Migration `supabase/migrations/0015_profile_class_level_session_ui.sql`: `alter table profiles add column class_level text check (class_level in ('11','12','dropper'));` plus the column grant used for other editable profile columns (`grant update (class_level) on profiles to authenticated;`, follow the pattern in 0012). `MeSchema` += `class_level: enum|null`, `onboarding_completed: boolean` (`onboarding_completed_at is not null`). `PatchMeBody` += `class_level?: enum|null`. |
| **B4** | 2 | Same migration: `alter table practice_sessions add column ui_mode text not null default 'learning' check (ui_mode in ('learning','test')), add column time_limit_sec int check (time_limit_sec between 60 and 21600);`. `CreateSessionBody` += `ui_mode?: 'learning'\|'test'` (default learning), `time_limit_sec?: int`. `SessionSummarySchema` += `ui_mode`, `time_limit_sec: int\|null`. `request_hash`/replay semantics unchanged (same `client_request_id` replays). |
| **B2** | 2 | `AttemptResultSchema` += `response: AnswerResponseSchema`, `time_spent_ms: int\|null` (from the stored row; needed for resume and results). Contract test: `PRACTICE_FORBIDDEN_KEYS` does not apply to `AttemptResult`; keep the practice DTO test green. |
| **B3** | 2 | `GET /practice/sessions` (auth `user`, PRIVATE): query `status?` csv of `SessionStatus`, `cursor`, `limit` ≤ 50 → `(SessionSummary & { completed_at: ts\|null, last_activity_at: ts, exam: ExamRef, subject: SubjectRef\|null, chapter: ChapterRef\|null })[]`, order `last_activity_at desc, id`. Schema name `SessionListItem`. |
| **B5** | 2 | `POST /practice/sessions/:id/complete` (auth `user`, RL_WRITE): ACTIVE → COMPLETED (`completed_at = now()`); already COMPLETED → 200 same body (idempotent); ABANDONED → 409 INVALID_STATE_TRANSITION. Returns `SessionProgress`. |
| **B6** | 2 | `GET /users/me/activity?from=YYYY-MM-DD&to=YYYY-MM-DD` (auth `user`, PRIVATE; default last 120 days; max span 400 days, else 400 VALIDATION_ERROR) → `{ date, attempts, correct, total_time_ms }[]` from `daily_activity` via `withUser` (RLS owner-select already exists), ascending by date. Schema `ActivityDay`. |
| **B8** | 2 | Dev-only fixture `supabase/fixtures/0002_dev_users.sql` (fixtures never run in production): `insert into auth.users (id, email, raw_user_meta_data) values ('e0000000-0000-4000-8000-000000000001','dev1@projectx.local','{"display_name":"Dev One"}'), ('e0000000-0000-4000-8000-000000000002','dev2@projectx.local','{"display_name":"Dev Two"}'), ('e0000000-0000-4000-8000-0000000000a1','admin@projectx.local','{"display_name":"Dev Admin"}') on conflict (id) do nothing;` then `insert into public.user_roles (user_id, role) values ('e0000000-0000-4000-8000-0000000000a1','ADMIN') on conflict do nothing;`. The `handle_new_user` trigger creates profiles and streak rows. Without this, `AUTH_MODE=test` tokens for made-up users get `404 Profile` / FK errors. |

CORS needs no code change: `CORS_ALLOWED_ORIGINS` already defaults to `http://localhost:3000`; production gets the exact web
origins. Browser calls send `Authorization` and `Idempotency-Key`, both already allowed.

### 1.10 Backend extensions specified for LATER (not this pass)

| Id | What | Shape |
|---|---|---|
| L1 | Mistake category | migration: `mistakes.category text check (category in ('concept','calculation','formula','misread','time'))`, column grant update(category); `PATCH /users/me/mistakes/:questionId {category: enum\|null}` → `MistakeItem` (+`category`). |
| L2 | Review list | table `review_items(user_id, question_id, created_at, pk(user_id,question_id))` with owner RLS like bookmarks; `GET/POST/DELETE /users/me/review`; `alter type practice_mode add value 'REVIEW'`. |
| L3 | Server-side test autosave | table `practice_session_drafts(session_id pk fk, user_id, responses jsonb, current_index int, elapsed_ms int, row_version int, updated_at)`; `PUT /practice/sessions/:id/draft {expected_row_version, …}` (409 VERSION_CONFLICT); draft returned in `GET /practice/sessions/:id`. |
| L4 | Batch submit | `POST /practice/sessions/:id/submit {responses: {client_attempt_id, question_id, response, time_spent_ms}[]}` → all `AttemptResult`s, one transaction, idempotent per item; removes the 20-question limit. |
| L5 | Papers + CBT | `exam_papers` += `duration_minutes`, `instructions jsonb`; `GET /public/papers?exam=` and `GET /public/papers/:slug` with sections derived from `questions(paper_id, question_number, subject)` and marking from `marks/negative_marks/marking_scheme`; raise `practice_sessions.question_ids` cardinality limit for `PYQ_PAPER`; implement `PARTIAL_MULTI`. |
| L6 | XP + leaderboard | server-owned XP ledger, weekly per-exam leaderboard with `profiles.show_on_leaderboard` opt-in and first-name+initial display. |
| L7 | Hints | `question_hints` table filled by a new AI task; `GET /practice/questions/:id/hint` (user). |
| L8 | Answer provenance | `PublicSolution.answer_source: AnswerKeySource\|null`. |
| L9 | Reports | `POST /questions/:id/reports {reason, body}`. |
| L10 | Internal SSR path | service binding from web Worker to API Worker + trusted internal header exempt from per-IP `RL_PUBLIC` (see risk R4). |

---

## 2. Architecture for the swap

### 2.1 Modes and environment

| Variable | Where | Meaning |
|---|---|---|
| `NEXT_PUBLIC_DATA_SOURCE` | build-time, both | existing; `api` enables API mode **only if** a base URL is also set. |
| `NEXT_PUBLIC_API_BASE_URL` | browser + server | e.g. `http://localhost:8787/api/v1`, prod `https://api.<domain>/api/v1`. |
| `API_BASE_URL` | server only (optional) | overrides the base URL for server components (same value in dev). |
| `NEXT_PUBLIC_AUTH_MODE` | build-time | `supabase` (default when Supabase vars are set) or `dev` (offline). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | build-time | public by design. Never put a service-role key in the web app. |
| `DEV_TEST_JWT_SECRET` | server only, dev | must equal the API's `TEST_JWT_SECRET` (API `node.ts` default: `dev-test-secret-change-me-32-chars-min`). |
| `REVALIDATE_SECRET` | server only | shared with API `WEB_REVALIDATE_SECRET`. |
| `NEXT_PUBLIC_FEATURE_PAPERS` | build-time | `off` (default in API mode) / `demo`. |
| `NEXT_PUBLIC_FEATURE_LEADERBOARD` | build-time | `off` (default in API mode) / `demo`. |

`src/lib/site.ts`: `DATA_SOURCE = NEXT_PUBLIC_DATA_SOURCE === "api" && NEXT_PUBLIC_API_BASE_URL ? "api" : "mock"`.
`INDEXABLE` keeps its rule (needs `NEXT_PUBLIC_ALLOW_INDEXING=true` and API mode). `NEXT_PUBLIC_*` values are inlined at build
time, so staging and production are separate builds.

### 2.2 Module layout and frozen interfaces (W-A writes these first; W-B and W-C code against them)

```
src/lib/api/
  env.ts            apiEnabled(): boolean; serverBaseUrl(): string; browserBaseUrl(): string; flags: { papers: "off"|"demo"; leaderboard: "off"|"demo" }
  errors.ts         class ApiError extends Error { status; code: ErrorCode | "NETWORK" | "BAD_RESPONSE"; details?; requestId?; retryAfterSec? }
  http.ts           apiFetch<S extends z.ZodType>(path, opts: { schema: S; method?; body?; token?: string | null;
                      idempotencyKey?; signal?; base?: "server" | "browser"; retry?: number })
                      : Promise<{ data: z.output<S>; meta?: Meta; tags: string[]; status: number }>
                    - parses the success envelope with `envelope(schema)` semantics and errors with ErrorEnvelopeSchema
                    - `tags` = `X-Cache-Tags` split on ","
                    - GET retries on 429/503/network up to `retry` (default 2) honouring Retry-After ≤ 5 s; non-GET never auto-retries
                    - 301 MOVED_PERMANENTLY surfaces as ApiError code "MOVED_PERMANENTLY" with details.slug
                    - 204 → data undefined (schema z.undefined())
  schemas.ts        re-exports the DTO schemas used by the web from "@projectx/contracts" (single import point)
  auth.ts           type TokenProvider = () => Promise<string | null>; setTokenProvider(p); getToken()
  public.ts         server-safe, no auth header ever (public responses must stay edge-cacheable):
                      taxonomyExams(), taxonomyTree(exam), publicExam(slug), publicSubject(slug),
                      publicChapter(slug, {cursor?, limit?}), publicQuestion(slug) → {status:"ok", data, tags} | {status:"moved", slug} | {status:"missing"},
                      related(slug, limit), sitemapQuestions(cursor?), practiceQuestions(params)
  student.ts        browser, uses getToken(): me, patchMe, putExamPreferences, progress, streak, activity, attempts,
                      listBookmarks, addBookmark, removeBookmark, listMistakes, dismissMistake,
                      createSession, getSession, listSessions, abandonSession, completeSession, submitAttempt, postDoubt
  adapters/
    ids.ts          examToApi/examFromApi, subjectFromApi(segment, subjectName) → {subject, group?}, typeFromApi/ToApi, difficultyFromApi
    blocks.ts       blocksToRichText(blocks), imageAssets(blocks)
    content.ts      toSubject, toChapters(trees, overlay), toQuestion(PublicQuestion), toSolution(PublicQuestion),
                    toQuestionCard(QuestionSummary | PracticeQuestion, exam), toCounts(...)
    practice.ts     toPracticeQuestion(PracticeQuestion) → Question (verification omitted → see note), toAnswerResponse(q, ResponseValue),
                    fromAttemptResult(...) → { outcome, solution, answer }, sectionsFor(questions)
    student.ts      toDemoUser(Me, prefs), toMistakeRecords, toBookmarks, toDayActivity(ActivityDay[])
  *.test.ts         vitest, node env, no network: adapters tested against JSON fixtures in src/lib/api/__fixtures__/
                    (record them once from the dev API with curl; they must parse with the contracts schemas)
```
Note on `toPracticeQuestion`: `PracticeQuestion` has no verification field. The practice player does not render a
verification badge before the attempt; `Question.verification` for these is set to `{ status: "processed" }` **only inside
the client registry** and must never be rendered. W-C makes the player read verification from the `AttemptResult` flow
(solution) instead. If that proves awkward, W-A adds `verification` to `PracticeQuestion` (additive) instead of guessing.

Validation: both server and browser parse responses with the `@projectx/contracts` schemas (they typecheck under the web
tsconfig; verified). Root `package.json` gets `"@projectx/contracts": "*"` and `next.config.ts` gets
`transpilePackages: ["@projectx/contracts"]`. Bundle check: contracts import `z` from `@hono/zod-openapi`; record
`(app)` First Load JS before/after in the W-A PR. If it grows by more than 60 kB gzip, W-A adds a
`@projectx/contracts/web` entry that builds the same schemas on plain `zod` (follow-up, not a blocker).

### 2.3 Server data layer (W-B): `src/lib/data/index.ts`

Every exported function keeps its name and parameters and dispatches on `DATA_SOURCE`:
* `mock` → today's catalog code, byte-for-byte behaviour (`src/lib/core.test.ts` must stay green unchanged).
* `api` → wrappers in `src/lib/data/api.ts`, each one:
  ```ts
  async function apiChapterPage(slug: string) {
    "use cache";
    cacheLife({ stale: 60, revalidate: 3600, expire: 86400 });   // PUBLIC_CONTENT; taxonomy uses { stale: 300, revalidate: 86400, expire: 604800 }
    const r = await publicChapter(slug, { limit: 100 });
    cacheTag("web", ...r.tags.slice(0, 120));                     // backend tags verbatim: q-*, qslug-*, ch-*, sub-*, exam-*, tax, sitemap ...
    return toChapter…(r.data);
  }
  ```
Return-type changes (deliberate): `getQuestions`, `getPublicQuestions` → `QuestionCard[]`. New functions:
`getQuestionPage(slug)` → `{status:"ok", question, solution} | {status:"moved", slug} | {status:"missing"}`,
`getRelatedQuestions(slug, limit=4)` → `QuestionCard[]`, `getSitemapQuestions()` → `{track, slug, updatedAt}[]`.
`getSolution(questionId)` stays fixture-only (API mode returns `null`; the question page uses `getQuestionPage`).
`getPublicQuestions()` in API mode pages `GET /practice/questions?exam=<active exam>` (limit 50, hard cap 200 items) to feed
`generateStaticParams`; every `generateStaticParams` returns at least one param (fallback: the first item from another source,
or a sentinel param whose page calls `notFound()`).

### 2.4 Client catalog and registry (W-C): `src/lib/data/catalog.ts`

`catalog` keeps its exported API (it is imported by 14 client modules). In API mode it reads from a client registry
(`src/lib/session/registry.ts`) filled by session loads, attempt results, bookmark/mistake lists and a
`useTaxonomy(exam)` hook (`/taxonomy/tree` + `/public/subjects/:slug` counts; public, CORS-allowed). `catalog.solution(id)`
returns a solution only after an `AttemptResult` for that question is known. `catalog.hint()` returns `null`. Mock mode
behaviour must not change.

### 2.5 Cache tags and revalidation

* Server fetches carry no `Authorization` header (ARCHITECTURE section 8), so API responses stay edge-cacheable and their
  `X-Cache-Tags` are copied into Next's cache with `cacheTag`.
* `src/app/api/revalidate/route.ts` (W-B): `POST` only; `Authorization: Bearer ${REVALIDATE_SECRET}` compared in constant time
  (401 otherwise, 404 if the secret is unset); body `{ tags: string[] }` validated with Zod (1..200 tags, `/^[a-z0-9:_-]{1,256}$/i`);
  calls `revalidateTag(tag, { expire: 0 })` for each; returns `{ revalidated: n }`. Route path is `/api/revalidate/` (trailing
  slash config applies).
* The API calls it through B7 whenever it purges tags (publish, unpublish, edits, disputes). Taxonomy edits: the operator
  POSTs `{"tags":["tax"]}` manually.

### 2.6 Auth

Decision: **`@supabase/supabase-js` 2.118.0 in the browser only. No `@supabase/ssr`.** Reasons: the API takes Bearer tokens
and never cookies; public server components must not vary by user; every private page is already client-rendered behind
`DemoGate`, so no server code needs the session. `@supabase/ssr` would add cookie plumbing with no consumer.
(`@supabase/ssr` 0.12.7 needs `supabase-js ^2.114`; keep it in mind if SSR personalisation is ever needed.)

* `src/lib/auth/supabase.ts` (W-C): singleton `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)`
  with default browser storage, `autoRefreshToken`, `persistSession`. Token provider = `(await supabase.auth.getSession()).data.session?.access_token ?? null`.
  Before first live use, confirm in the Supabase docs that the publishable key format is accepted by `createClient` (Q2).
* Email + password sign-up/sign-in (`signUp({email, password, options: {data: {display_name}, emailRedirectTo: <origin>/onboarding/}})`),
  "check your email" state when confirmation is on, `signOut()`. Anonymous Supabase users are not used (API returns
  `ACCOUNT_REQUIRED`).
* **Dev mode** (`NEXT_PUBLIC_AUTH_MODE=dev`, offline): `src/app/api/dev/token/route.ts` (W-C) returns 404 unless
  `NODE_ENV !== "production"` and `NEXT_PUBLIC_AUTH_MODE === "dev"`; `POST {user: "dev1"|"dev2"|"admin"}` returns an HS256 JWT
  (`jose` 6.2.14, same as the API) with `sub` = the B8 uuid, `role:"authenticated"`, `aud:"authenticated"`, 12 h expiry, signed
  with `DEV_TEST_JWT_SECRET`. The login screen shows "Continue as Dev One / Dev Two" buttons in dev mode only. Tokens live in
  memory plus `sessionStorage`.
* Route guards stay client-side (`DemoGate` → `AuthGate`): no session → `/login/`; `Me.onboarding_completed === false` →
  `/onboarding/`. Guards are UX only; the API enforces.
* API error handling in the store: 401 → sign out locally and route to `/login/?next=…`; 403 `ACCOUNT_REQUIRED` → sign-up prompt;
  429 → toast with `Retry-After`.

### 2.7 Dependencies to add (W-A, in its first commit, all published ≥ 2 weeks before 2026-11-15)

| Package | Version | Where | Why |
|---|---|---|---|
| `@projectx/contracts` | `*` (workspace) | dependencies | schemas + types |
| `@supabase/supabase-js` | `2.118.0` (2026-10-15) | dependencies | browser auth |
| `jose` | `6.2.14` (2026-10-29, already in the lockfile via the API) | dependencies | dev token route |
| `@opennextjs/cloudflare` | `1.20.15` (2026-10-30; peer `next >=16.4.1`, `wrangler ^4.148.0`) | devDependencies | Phase D hosting only; add when Phase D starts, not in this pass |

Also: delete `pnpm-lock.yaml`; run `npm install` so `package-lock.json` is the only lockfile.

---

## 3. Phases, scope and acceptance

### 3.1 Phase 1: public content through the API (W-A + W-B)

In scope: subjects, chapters, topics, counts, chapter question lists, question pages (content, options, solution,
verification, 301 handling), related questions, sitemap, robots decision, revalidation endpoint, B0, B7.
Out of scope: anything private, papers (demo only), search UI.

Acceptance (offline, Git Bash, repo root):
```bash
# T1: API with in-process PGlite + dev fixtures on :8787 (do NOT also run db:serve; they share .local/pglite)
WEB_REVALIDATE_URL=http://localhost:3000/api/revalidate/ WEB_REVALIDATE_SECRET=dev-only-revalidate-secret-0123456789abcd npm run dev:api
# T2: web against it
NEXT_PUBLIC_DATA_SOURCE=api NEXT_PUBLIC_API_BASE_URL=http://localhost:8787/api/v1 API_BASE_URL=http://localhost:8787/api/v1 \
REVALIDATE_SECRET=dev-only-revalidate-secret-0123456789abcd npm run dev:web
```
1. `curl -s localhost:3000/jee/physics/kinematics/` contains `[DEMO] A particle starts from rest` and KaTeX markup; does not
   contain any fixture-bank stem.
2. `/jee/questions/demo-constant-acceleration-distance/` → 200, options A–D, collapsed solution with answer "Option B",
   badge "Reviewed"; `/jee/questions/demo-draft-unreviewed-question/` and `/jee/questions/demo-disputed-question/` → 404.
3. `/jee/physics/` shows only API chapters with API counts; `/neet/` renders the empty "coming soon" state (inactive exam) and is noindex.
4. Robots: with `NEXT_PUBLIC_ALLOW_INDEXING` unset every page is noindex and `sitemap.xml` is empty; with it `=true` the
   sitemap lists hub/subject pages and only questions from `/public/sitemap/questions` (fixtures have `sitemap_include=false`,
   so zero question URLs is the correct result).
5. Revalidation: `curl -X POST localhost:3000/api/revalidate/ -H 'Authorization: Bearer wrong' -d '{"tags":["tax"]}'` → 401;
   with the right secret → 200. End to end: unpublish `demo-modulus-of-3-plus-4i` with an admin dev token
   (`npm run token -w @projectx/api -- --user e0000000-0000-4000-8000-0000000000a1`, then `POST /api/v1/admin/questions/<id>/unpublish`
   with `expected_row_version` from `GET /admin/questions/<id>`), reload its page → 404, and it is gone from its chapter page.
6. Stop the API: an uncached public page shows the route error boundary, never fixture content.
7. Build in API mode with the API running: `NEXT_PUBLIC_DATA_SOURCE=api NEXT_PUBLIC_API_BASE_URL=http://localhost:8787/api/v1 npm run build:web` succeeds.
8. Mock mode untouched: unset all API vars; `npm run build:web`, `npx vitest run src`, and a click-through of the demo all behave as before.

### 3.2 Phase 2: auth, onboarding, practice, lists, progress (W-A backend B1–B6, B8 + W-C)

In scope where the backend supports it (after B1–B8): dev/Supabase login, sign-up, onboarding (exam, class level, daily goal,
timezone), dashboard (streak, goal, in-progress sessions, derived XP/level), practice launcher, learning mode with
server-graded Check, test mode with local draft and server submit, results from server data, resume, abandon, retry,
bookmarks, mistakes (list, reattempt via MISTAKES session, dismiss), progress page (progress + activity + streak), report
question via `/doubts`.

Stays demo/local in API mode (labelled, flagged): papers and CBT (`FEATURE_PAPERS`), leaderboard (`FEATURE_LEADERBOARD`),
review list (local), mistake categories (local overlay), hints (hidden), cosmetics equip state (local), test-mode
autosave (local draft until L3).

Acceptance (offline; same T1 plus `NEXT_PUBLIC_AUTH_MODE=dev DEV_TEST_JWT_SECRET=dev-test-secret-change-me-32-chars-min` on T2):
1. Login as Dev One → onboarding → choose JEE Main, class 12, goal 10 → `GET /api/v1/users/me` (dev token) shows
   `onboarding_completed: true`, `class_level: "12"`, `timezone` = browser tz. Reload → dashboard, not onboarding.
2. Chapter practice (Kinematics, learning, 5): session created (422 NO_QUESTIONS path also tested by repeating until solved);
   answer wrong → Check shows correct answer + solution; `GET /users/me/attempts` has the row; `/mistakes/` lists it.
   Answer the same question right in a new session → mistake shows as resolved.
3. Bookmark a question, reload, then open the app as the same user in a second browser profile → bookmark present.
4. Test mode (mixed, 5): answer 3, mark 1 for review, reload mid-test → draft restored with "Saved on this device";
   submit → results list per-question correctness from the server; session `COMPLETED` (B5); progress and streak updated
   (`current_streak` 1, `goal_met_today` false with goal 10).
5. Start a learning session, answer 1, open the dashboard in the second profile → session listed as in progress (B3) and
   resumes with the answered item locked (B2 response shown).
6. Kill the API during test submit → UI shows "Submitting n/m" with Retry; restart API; Retry finishes without duplicates
   (same `client_attempt_id`; `GET /users/me/attempts?session_id=` count equals answered count).
7. With `FEATURE_PAPERS` and `FEATURE_LEADERBOARD` unset: no paper, CBT or leaderboard entry points; no mock peers anywhere.
8. `localStorage` in API mode holds only `projectx-drafts-v1:*`, `projectx-prefs-v1:*`, the local review/category overlays and
   Supabase/dev session keys; `tabby-demo-v2` is not written.
9. Mock mode (no API vars): the original demo flows (CLAUDE.md section 16 list) still work.

### 3.3 Phase D (after this pass): hosting

See section 5. Starts only when Phases 1–2 are merged and the owner approves Cloudflare changes.

### 3.4 Flags summary in API mode

| Surface | Default in API mode |
|---|---|
| Public pages | API only |
| Papers, PYQ papers, CBT | off (`FEATURE_PAPERS=demo` to show the demo) |
| Leaderboard | off |
| Hints | hidden |
| Review list, mistake categories, cosmetics | local, labelled per-device |

---

## 4. WORK_SPLIT for this pass (three Sonnet workers)

Branches off `integration/web-api`: `int/w-a-api-client`, `int/w-b-public-data`, `int/w-c-auth-practice`.
Merge order: W-A (A1) → W-B → W-A (A2) → W-C. No worker edits files owned by another; if you need a change in someone
else's file, write it in your PR description and ping the lead. Nobody edits this plan except the lead.

### W-A: API client, adapters, contracts, backend additions, config

Owns: `src/lib/api/**`, `src/contracts/index.ts`, `src/lib/site.ts`, `package.json`, `package-lock.json`, `pnpm-lock.yaml`
(delete), `next.config.ts`, `vitest.config.mts`, `.env.example`, `docs/ARCHITECTURE.md` section 9 table rows only,
`apps/api/**`, `packages/contracts/**`, `packages/edge/**`, `supabase/migrations/0015_*`, `supabase/fixtures/0002_*`.

* **A0 (first commit, within the first hour, unblocks others):** deps (2.7), `transpilePackages`, `src/contracts` additions
  (`QuestionCard`, `Option.ref`, `blocks` fields, optional `Chapter.grade`, nullable PYQ source fields, `indexable`,
  `display`, `generatedBy: "official"`, `Solution.extras`), `src/lib/api/{env,errors,http,auth,schemas}.ts` with the exact
  signatures in 2.2 (bodies may be TODO for public/student calls), web section in `.env.example`.
  Fixtures must still validate after the contract changes (all changes are optional/widening).
* **A1 (Phase 1):** `public.ts`, `adapters/{ids,blocks,content}.ts` + tests; B0; B7.
* **A2 (Phase 2):** B1–B6, B8; `student.ts`, `adapters/{practice,student}.ts` + tests.

Must pass before each PR:
```bash
npm run typecheck                    # all workspaces (contracts, api, edge, db, shared, ai)
npm test                             # all backend suites incl. supabase/tests, api memory + sql, edge env-example
npm run openapi && git diff --stat packages/contracts/openapi/openapi.json   # regenerated and committed; additive only
npm run deploy:dry -w @projectx/api
npm run typecheck:web
npx vitest run src
npm run build:web                    # mock mode
```

### W-B: server data swap and public pages

Owns: `src/lib/data/index.ts`, new `src/lib/data/api.ts`, `src/app/(site)/**`, `src/app/sitemap.ts`, `src/app/robots.ts`,
`src/app/api/revalidate/route.ts`, `src/components/content/**` (incl. new `Blocks.tsx`), `src/components/seo/**`,
`src/components/ui/Badges.tsx`, `src/components/layout/SiteFooter.tsx`, `src/lib/indexing.ts`, `src/lib/seo.ts`,
`src/lib/core.test.ts` (may only add tests).

Tasks: 2.3 dispatch layer; `"use cache"` + `cacheLife` + `cacheTag` on every API wrapper; question page on
`getQuestionPage` with `permanentRedirect` for moved slugs; related list via `getRelatedQuestions`; `<Blocks>` renderer
(paragraph with inline TeX and `**b**`/`*i*`, display math, image with alt/width/height and `loading="lazy"`, table with
overflow scroll, list); SourceLabel/AUTHOR/answerText updates (1.3, 1.4); chapter "Class N" only when known; PYQ pages
filter demo papers in API mode; sitemap from `getSitemapQuestions`; non-empty `generateStaticParams` everywhere; empty
states for inactive exams; revalidate route (2.5). Change the question page's "Try it in practice" link to
`/practice/new/?slug=<slug>` (W-C reads `slug`, keeps accepting `q` in mock mode).

Must pass:
```bash
npm run typecheck:web && npm run lint:web && npx vitest run src
npm run build:web                                         # mock mode
# with `npm run dev:api` running in another terminal:
NEXT_PUBLIC_DATA_SOURCE=api NEXT_PUBLIC_API_BASE_URL=http://localhost:8787/api/v1 npm run build:web
```
plus Phase 1 acceptance 1–8.

### W-C: auth, session store, private app wiring

Owns: `src/lib/demo/**` (kept for mock mode), new `src/lib/session/**` (API store, registry, drafts), new `src/lib/auth/**`,
`src/lib/data/catalog.ts`, `src/lib/exams.ts` (read-only unless a mapping helper is needed), `src/app/(app)/**`,
`src/app/(auth)/**`, `src/app/(focus)/**`, `src/app/(exam)/**`, `src/app/api/dev/token/route.ts`, `src/components/app/**`,
`src/components/practice/**`, `src/components/cbt/**`, `src/components/results/**`, `src/components/charts/**`,
`src/components/layout/{NavLinks,AppChrome}.tsx`, `src/lib/bank.test.ts` (add only).

Tasks: auth (2.6); API-mode store that exposes the same hooks/actions as `src/lib/demo/store.ts`
(`useDemo`, `startPractice` (now returns `Promise<string>`), `setResponse`, `checkAnswer`, `submitAttempt`,
`toggleBookmark`, …) backed by `src/lib/api/student.ts`, selected by `DATA_SOURCE`, so screens change only where
an action became async or a demo-only surface is flagged off; registry (2.4); drafts and the submit state machine (1.7);
progress/streak/XP derivations (1.8); flags (3.4); onboarding PATCHes; report → `/doubts`. Never write
`tabby-demo-v2` in API mode. Until A2 merges, code against the A0 signatures and the B-shapes in 1.9.

Must pass:
```bash
npm run typecheck:web && npm run lint:web && npx vitest run src
npm run build:web                                         # mock mode
NEXT_PUBLIC_DATA_SOURCE=api NEXT_PUBLIC_API_BASE_URL=http://localhost:8787/api/v1 NEXT_PUBLIC_AUTH_MODE=dev npm run build:web   # API running
```
plus Phase 2 acceptance 1–9 (manual, report results in the PR).

### Shared rules for all workers

* Commit trailers per the session reminder. No `--no-verify`.
* No new runtime dependency beyond 2.7 without the lead.
* No remote Supabase/Cloudflare actions (everything is offline in this pass).
* Every UI state you add needs loading, empty, error and retry handling (CLAUDE.md section 9) and must not use colour alone.

---

## 5. Hosting decision for the Next.js app

### 5.1 Facts checked (Cloudflare docs, npm registry, 2026-11-15)

* Cloudflare's docs recommend **vinext** for new Next.js apps and keep the **OpenNext adapter** for existing apps that
  cannot migrate yet. vinext is **beta**; its compatibility dashboard runs the Next.js deploy suite against **Next 16.2.6**
  (we are on 16.4.6); Partial Prerendering is "in progress" (large `ppr` suites skipped, one PPR suite failing).
  `vinext@1.4.5` peers on `react ^19.3.1` and `vite ^8` (we are on React 19.3.0). It replaces `next build` with Vite.
* OpenNext on Workers supports App Router, RSC, SSG/SSR/ISR, route handlers, middleware, streaming, `after`, PPR and
  Composable Caching (`"use cache"`, both marked experimental in Next). `@opennextjs/cloudflare@1.20.15` peers on
  `next >=16.4.1` and `wrangler ^4.148.0`. Caching needs: R2 incremental cache (`NEXT_INC_CACHE_R2_BUCKET`), tag cache
  D1 (`NEXT_TAG_CACHE_D1`) or sharded Durable Objects, DO queue (`NEXT_CACHE_DO_QUEUE`), optional cache purge. Cache
  interception does not work with PPR (it is off by default; keep it off).
* Workers limits: Free = 100 000 requests/day, **10 ms CPU per request**, 50 external subrequests; Paid ($5/month) =
  30 s default CPU, 10 000 subrequests. Worker size 64 MiB on both; startup must finish in 1 s. Cloudflare's own migration
  guide says SSR apps usually need the Paid plan because of the 10 ms CPU limit.
* A Worker can `fetch()` another Worker on the same zone only if the target is on a **Custom Domain** (or via a service
  binding). WAF rules are not evaluated for same-zone subrequests. Service-binding calls are not billed as extra requests.
* "Workers static assets only" (static export) is not viable: the app uses `cacheComponents`, route handlers, dynamic
  question pages and on-demand revalidation.

### 5.2 Recommendation

**OpenNext (`@opennextjs/cloudflare` 1.20.15) on Cloudflare Workers, Workers Paid plan.** It is the only Cloudflare path
that supports what this app already depends on (Next 16.4 build output, `cacheComponents`/PPR, `"use cache"` with tag
revalidation) without replacing the toolchain. vinext is the long-term Cloudflare default; re-evaluate when its
compatibility dashboard covers 16.4 and PPR (run `npx vinext check` then).
Fallback if the OpenNext preview fails Phase 1/2 acceptance: Vercel Pro for the web app only (native Next 16 support); the
API, Supabase and R2 topology below is unchanged because the web already talks to the API over HTTPS.

Changes when Phase D starts (owner: lead or a W-A follow-up):
* `next.config.ts`: keep `cacheComponents`, `partialPrerendering`, `trailingSlash`; keep `transpilePackages`. No
  `output` setting. `next/image` is not used, so no image loader is needed. Optionally call `initOpenNextCloudflareForDev()`
  only if bindings are needed in `next dev` (they are not today).
* `open-next.config.ts`: `defineCloudflareConfig({ incrementalCache: r2IncrementalCache, tagCache: d1NextTagCache, queue: doQueue })`
  (import paths `@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache`,
  `…/tag-cache/d1-next-tag-cache`, `…/queue/do-queue`); `enableCacheInterception` stays false (PPR).
* Root `wrangler.jsonc` for the web Worker `projectx-web` (the API keeps `apps/api/wrangler.toml`): `main` and
  `assets.directory = ".open-next/assets"` per the OpenNext guide, `compatibility_flags = ["nodejs_compat"]`, bindings
  above, DO migration for `DOQueueHandler` under `new_sqlite_classes`, `WORKER_SELF_REFERENCE` service binding, env vars
  from 2.1, secret `REVALIDATE_SECRET`.
* Scripts: `"preview:web": "opennextjs-cloudflare build && opennextjs-cloudflare preview"`,
  `"deploy:web": "opennextjs-cloudflare build && opennextjs-cloudflare deploy"` (deploy requires approval).
  Add `.open-next/` to `.gitignore` and ESLint ignores.
* Acceptance: Phase 1 and 2 acceptance re-run against `npm run preview:web` (workerd locally), plus `wrangler deploy --dry-run`
  bundle size and startup time recorded.

### 5.3 Deployment topology

```
Browser ──▶ <domain> (apex; www → 301 apex)     Worker "projectx-web" (OpenNext)   Custom Domain
              │  bindings: ASSETS, R2 projectx-web-cache (incremental cache), D1 projectx-web-tags (tag cache),
              │            DO DOQueueHandler, WORKER_SELF_REFERENCE; secret REVALIDATE_SECRET
              │  SSR: fetch https://api.<domain>/api/v1/public/* (no auth, edge-cached by the API)
              ▼
         api.<domain>                           Worker "projectx-api" (Hono)        Custom Domain (must be, for same-zone fetch)
              │  Workers Caching + Cache-Tag purge; B7 webhook → https://<domain>/api/revalidate/
              ├─▶ Supabase Postgres (Supavisor txn pooler :6543 or Hyperdrive), ap-south-1
              └─▶ R2: projectx-source-docs (private), projectx-user-uploads (private), projectx-public-assets
         assets.<domain>                        R2 projectx-public-assets custom domain (question images)
         Supabase Auth                          JWKS signing keys; Site URL https://<domain>; redirect allow-list
                                                https://<domain>/onboarding/, https://staging.<domain>/onboarding/, http://localhost:3000/*
Staging: staging.<domain> (projectx-web-staging) → api-staging.<domain> (projectx-api-staging), separate Supabase project,
         *-staging R2 buckets, separate D1. API CORS_ALLOWED_ORIGINS = exact web origins per environment.
```

### 5.4 Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | OpenNext support for PPR / `"use cache"` is experimental upstream | Gate Phase D on preview acceptance; Vercel Pro fallback for the web only. |
| R2 | Free plan 10 ms CPU fails SSR (KaTeX server rendering, RSC) | Budget Workers Paid ($5/month covers both Workers). |
| R3 | Fixture bank is bundled into the web Worker and client bundles in API mode | Flags keep it off public pages; follow-up: dynamic `import()` of fixtures only in mock/demo paths. |
| R4 | SSR calls from the web Worker share an egress identity, so per-IP `RL_PUBLIC` (300/min) can throttle SSR or `next build` | Next `"use cache"` keeps call volume low; client retries honour `Retry-After`; L10 service binding + internal key exemption before launch traffic. |
| R5 | `next build` in API mode needs a reachable API (prerender fetches) | CI builds against staging API; `generateStaticParams` capped at 200 questions, rest render on demand. |
| R6 | Same-zone fetch fails if the API is attached by Route instead of Custom Domain | API must use a Custom Domain (already the plan in DEPLOYMENT.md). |
| R7 | `NEXT_PUBLIC_*` inlined at build time | One build per environment; never reuse a staging build in production. |
| R8 | Contracts pull `@hono/zod-openapi` into browser bundles | Measure in W-A PR; `@projectx/contracts/web` entry if > 60 kB gzip. |

---

## 6. Blocking questions for the owners

* **Q1 (owner, Phase D):** production domain and Cloudflare account/plan (Workers Paid?), and approval to create
  `projectx-web` resources (R2 bucket, D1, DO). Not blocking this pass.
* **Q2 (Owner B, Phase 2 live auth):** Supabase project ref, publishable key, and whether email confirmation is on. Offline
  work uses dev auth and is not blocked.
* **Q3 (Owner A, product):** accept the server streak rule (≥1 graded attempt per day) or require a threshold (Owner A
  proposed 5)? A threshold needs a migration to `app_private.recompute_streak`. This plan ships the server rule.
* **Q4 (Owner A):** OK to drop the paper-completion and mistake-cleared XP bonuses in API mode until server XP (L6)?
* **Q5 (both):** delete `pnpm-lock.yaml` and standardise on npm (this plan assumes yes).

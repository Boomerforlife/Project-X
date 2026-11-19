# ProjectX — API Contracts v1 (binding)

Base: `https://projectx-api-989800061583.asia-south1.run.app/api/v1` (Cloud Run; no `api.` custom domain yet). JSON only (`application/json; charset=utf-8`) except `POST /uploads` (raw image body).
OpenAPI 3.1 generated from `@hono/zod-openapi` routes → `GET /api/v1/openapi.json` and committed to
`packages/contracts/openapi/openapi.json`. All schemas below live in `packages/contracts/src/**` with the exact names shown
(`XxxSchema` Zod value + `type Xxx = z.infer<…>`). Zod notation: `uuid` = `z.uuid()`, `dec` = decimal string
`z.string().regex(/^-?\d+(\.\d+)?$/).max(20)`, `date` = `YYYY-MM-DD` string, `ts` = ISO-8601 UTC string, `slug` = `/^[a-z0-9]+(-[a-z0-9]+)*$/`.

## 1. Conventions

**Envelope.** Success: `{ "data": T, "meta"?: Meta }`. Error: `{ "error": { "code": ErrorCode, "message": string, "details"?: unknown, "request_id": string } }`.
`Meta = { page?: { next_cursor: string|null, limit: number }, replayed?: boolean }`. Every response has `X-Request-Id`.

**Pagination.** Cursor-based: query `cursor` (opaque base64url of `{k: sortKey[], id}`, produced by `encodeCursor`) and `limit`
(int, default 20, max 100; sitemap max 1000). Invalid cursor → 400 `VALIDATION_ERROR`. Lists are stable-ordered with id tiebreak.

**Errors (`ErrorCodeSchema`)** → HTTP:
`VALIDATION_ERROR` 400 (details = zod `issues` flattened `{path, message}[]`) · `UNAUTHENTICATED` 401 · `ACCOUNT_REQUIRED` 403 (anonymous Supabase user) ·
`FORBIDDEN` 403 · `NOT_FOUND` 404 · `MOVED_PERMANENTLY` 301 (details `{slug, canonical_path}`, header `Location` = API path of new slug) ·
`CONFLICT` 409 · `IDEMPOTENCY_CONFLICT` 409 · `VERSION_CONFLICT` 409 (details `{current_row_version}`) · `ALREADY_ATTEMPTED` 409 ·
`INVALID_STATE_TRANSITION` 409 (details `{from, action}`) · `PAYLOAD_TOO_LARGE` 413 · `UNSUPPORTED_MEDIA_TYPE` 415 ·
`PUBLISH_REQUIREMENTS_NOT_MET` 422 (details `{unmet: string[]}`) · `RATE_LIMITED` 429 (`Retry-After` seconds) · `INTERNAL` 500 · `SERVICE_UNAVAILABLE` 503.
DB raise messages from triggers (`SLUG_LOCKED`, `TAXONOMY_MISMATCH`, `PUBLISH_REQUIREMENTS_NOT_MET: …`, `SOURCE_NOT_APPROVED`,
`INVALID_TIMEZONE`) are mapped to 409/422/400 respectively by the error middleware; raw DB errors never reach clients.
Validation failures use `defaultHook` on `OpenAPIHono` to produce the envelope.

**Auth levels:** `public` (no token; token ignored and **must not** change the response), `optional` (token used if present),
`user` (valid non-anonymous Supabase JWT), `reviewer` (user_roles REVIEWER or ADMIN), `admin` (ADMIN). Security scheme
`Bearer` registered via `openAPIRegistry.registerComponent('securitySchemes','Bearer',{type:'http',scheme:'bearer',bearerFormat:'JWT'})`.

**Cache classes** (header values exact; implemented by `@projectx/edge` `cachePolicies`):

| Class | Cache-Control | Notes |
|---|---|---|
| `TAXONOMY` | `public, max-age=300, s-maxage=86400, stale-while-revalidate=86400` | tags `tax`, `exam-{id}` |
| `PUBLIC_CONTENT` | `public, max-age=60, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400` | question/subject/chapter/related |
| `PUBLIC_LIST` | `public, max-age=0, s-maxage=300, stale-while-revalidate=600` | practice question list, search, sitemap |
| `PUBLIC_NOT_FOUND` | `public, max-age=30, s-maxage=300` | 404/301 on public slug routes, tag `qslug-{slug}` / `chslug-{slug}` |
| `PRIVATE` | `private, no-store` | every `user`/`reviewer`/`admin`/`optional` route and all non-GET |
| `NONE` | `no-store` | health, openapi in prod |

Public responses also carry `Cache-Tag` and `X-Cache-Tags` (same comma list, ASCII, ≤ 1000 tags) and never `Set-Cookie` or `Vary`
other than `Accept-Encoding`. Tags: `q-{questionId}`, `qslug-{slug}`, `ch-{chapterId}`, `chslug-{chapterSlug}`, `sub-{subjectId}`,
`exam-{examId}`, `tax`, `qlist`, `sitemap`, `search`.

**Invalidation (admin mutations → `CacheInvalidator.purgeTags`, via `waitUntil`)**: publish/unpublish/archive/restore/solution
change/indexability or sitemap change/content or metadata edit of question Q in chapter C, subject S, exam E →
`q-{Q}, qslug-{slug}, qslug-{oldSlug?}, ch-{C}, sub-{S}, qlist, sitemap, search` (+ old chapter/subject tags if taxonomy changed).
Taxonomy edits (migrations/seed) → manual `npm run cache:purge -w @projectx/edge -- --tags tax`.

**Rate-limit classes** (binding: limit/60 s): `RL_PUBLIC` 300/IP, `RL_SEARCH` 30/IP, `RL_WRITE` 30/user, `RL_ATTEMPTS` 60/user,
`RL_DOUBTS` 5/user-or-IP (+ DB cap 20 doubts/24 h per user or ip_hash), `RL_ADMIN` 120/user. Keys: `{class}:{userId|ipHash}`.

**CORS:** origins from `CORS_ALLOWED_ORIGINS`; methods GET,POST,PATCH,PUT,DELETE,OPTIONS; headers `Authorization, Content-Type,
Idempotency-Key, X-Upload-Purpose`; expose `X-Request-Id, Retry-After`; max-age 600; no credentials.

## 2. Shared schemas (`packages/contracts/src/domain/*`, `src/enums.ts`)

### 2.1 Enums
Exactly the DB enums (DATABASE_SCHEMA §1) exported as `z.enum([...])`: `QuestionTypeSchema, DifficultySchema, QuestionOriginSchema,
VerificationStatusSchema, PublicationStatusSchema, IngestionStatusSchema, IndexabilitySchema, AccessTierSchema, AnswerKeySourceSchema,
SourceKindSchema, SolutionProvenanceSchema, SolutionReviewStatusSchema, JobKindSchema, JobStatusSchema, AiTaskSchema, CheckKindSchema,
CheckResultSchema, VerificationOutcomeSchema, ReviewActionSchema, AppRoleSchema, PracticeModeSchema, SessionStatusSchema, DoubtStatusSchema, MarkingSchemeSchema`.

### 2.2 Content
```ts
InlineText = z.string().max(20000)                       // markdown-lite: **b**, *i*, inline LaTeX $…$ (escape literal $ as \$)
ContentBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: InlineText }),
  z.object({ type: z.literal('math'), latex: z.string().max(5000) }),                         // display math
  z.object({ type: z.literal('image'), asset_id: uuid, alt: z.string().max(300), caption: InlineText.max(500).optional() }),
  z.object({ type: z.literal('table'), header: z.array(InlineText.max(500)).max(12).nullable(), rows: z.array(z.array(InlineText.max(500)).max(12)).max(50) }),
  z.object({ type: z.literal('list'), ordered: z.boolean(), items: z.array(InlineText.max(2000)).min(1).max(30) }),
])
ContentBlocks = z.array(ContentBlock).min(1).max(100)
PublicContentBlock = ContentBlock with image variant extended by { url: z.url(), width: z.int().nullable(), height: z.int().nullable() }
OptionLabel = z.enum(['A','B','C','D','E'])
```
### 2.3 Answers
```ts
AnswerKey = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SINGLE_MCQ'), correct_option_ids: z.array(uuid).min(1).max(5) }),
  z.object({ type: z.literal('MULTI_MCQ'),  correct_option_ids: z.array(uuid).min(1).max(5) }),
  z.object({ type: z.literal('NUMERICAL'),  accepted_ranges: z.array(z.object({ min: dec, max: dec })).min(1).max(5), display_value: dec }),
])                       // canonical form: option ids sorted ascending; ranges sorted by min; min<=max
AnswerResponse = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SINGLE_MCQ'), option_id: uuid }),
  z.object({ type: z.literal('MULTI_MCQ'),  option_ids: z.array(uuid).min(1).max(5) }),   // unique enforced by refine
  z.object({ type: z.literal('NUMERICAL'),  value: dec }),
])
```
Grading (`@projectx/shared/gradeAttempt(key, response, {marks, negative_marks, marking_scheme})` → `{is_correct, score: dec}`):
type mismatch → `VALIDATION_ERROR`; SINGLE: `option_id ∈ correct_option_ids`; MULTI (STANDARD): set equality; NUMERICAL: exists range with
`min ≤ value ≤ max` using exact decimal comparison (BigInt-scaled, no floats). score = correct ? marks : −negative_marks.
(`PARTIAL_MULTI` reserved; until implemented, treated as STANDARD.)

### 2.4 Refs & DTOs
```ts
ExamRef    = { id: uuid, slug, name, short_name }
SubjectRef = { id: uuid, slug, segment, name, code }
ChapterRef = { id: uuid, slug, segment, name, unit_number: int|null }
TopicRef   = { id: uuid, slug, segment, name }
Breadcrumb = { name: string, path: string }
Attribution = { origin: QuestionOrigin, source_name: string|null, attribution_text: string|null, license_name: string|null,
  license_url: string|null, paper: { slug, title, year: int, session_label: string|null, exam_date: date|null, shift: int|null, paper_code: string|null } | null }
Seo = { title: string, description: string, robots: 'index,follow'|'noindex,follow', canonical_path: string }
     // title = seo_title ?? derived `${first 60 chars of text} | ${exam.short_name} ${subject.name}`; robots from is_indexable
PublicOption = { id: uuid, label: OptionLabel, content: PublicContentBlock[] }
PublicSolution = { id: uuid, version: int, final_answer: AnswerKey & { correct_labels?: OptionLabel[] }, summary: string|null,
  steps: { index: int, title: string|null, blocks: PublicContentBlock[] }[], formulas: { name, latex }[], concepts: string[],
  alternatives: { title, steps: Step[] }[], shortcuts: string[], common_mistakes: string[], provenance: SolutionProvenance, approved_at: ts|null }
QuestionSummary = { id, slug, canonical_path, excerpt: string /*≤200 chars plain*/, question_type, difficulty: Difficulty|null,
  year: int|null, origin, chapter: ChapterRef, topic: TopicRef|null }
PublicQuestion = { id, slug, canonical_path, exam: ExamRef, subject: SubjectRef, chapter: ChapterRef, topic: TopicRef|null,
  question_type, difficulty, marks: dec, negative_marks: dec, content: PublicContentBlock[], options: PublicOption[],
  solution: PublicSolution, verification: { status: 'OFFICIAL_KEY_MATCHED'|'HUMAN_VERIFIED', label: string },
  attribution: Attribution, year: int|null, shift: int|null, seo: Seo, indexable: boolean,
  publication: { published_at: ts, updated_at: ts, first_published_at: ts }, breadcrumbs: Breadcrumb[],
  related: { count: int, path: string /* api path of /related */ } }
PracticeQuestion = { id, slug, question_type, difficulty, marks: dec, negative_marks: dec, content: PublicContentBlock[],
  options: PublicOption[], exam: ExamRef, subject: SubjectRef, chapter: ChapterRef, topic: TopicRef|null,
  attribution: { origin, year: int|null, paper_title: string|null } }
  // MUST NOT contain: answer_key, correct_option_ids, is_correct, solution, final_answer, explanation (contract test enforces)
AttemptResult = { attempt_id: uuid, question_id: uuid, is_correct: boolean, score: dec, correct_answer: AnswerKey & { correct_labels?: OptionLabel[] },
  solution: PublicSolution, submitted_at: ts, session: SessionProgress|null }
SessionProgress = { id: uuid, status: SessionStatus, attempted_count: int, correct_count: int, total: int, score: dec }
```

## 3. Endpoints

`→` gives `data` shape. All list responses include `meta.page`. Path params validated (slug pattern / uuid).

### 3.1 System
| Method Path | Auth | Cache | Response |
|---|---|---|---|
| GET `/health` | public | NONE | `{ status:'ok', version: string, db: 'ok'|'degraded' }` (DB check ≤ 500 ms, never cached) |
| GET `/openapi.json` | public | TAXONOMY (dev: NONE) | OpenAPI 3.1 doc (raw, no envelope) |
| GET `/docs` | public, only if `ENABLE_API_DOCS` | NONE | Swagger UI |

### 3.2 Taxonomy (public, cache TAXONOMY, RL_PUBLIC)
| GET path | Query | → |
|---|---|---|
| `/taxonomy/exams` | — | `(ExamRef & { is_active: boolean, sort_order: int })[]` (active only) |
| `/taxonomy/exams/:examSlug/subjects` | — | `(SubjectRef & { chapter_count: int })[]` |
| `/taxonomy/subjects/:subjectSlug/chapters` | — | `(ChapterRef & { topic_count: int, published_question_count: int })[]` |
| `/taxonomy/chapters/:chapterSlug/topics` | — | `(TopicRef & { published_question_count: int })[]` |
| `/taxonomy/tree` | `exam` slug (required) | `{ exam: ExamRef, subjects: (SubjectRef & { chapters: (ChapterRef & { topics: TopicRef[] })[] })[] }` |
Unknown slug → 404.

### 3.3 Public content (public, PUBLIC_CONTENT unless noted, RL_PUBLIC)
| GET path | Query | → |
|---|---|---|
| `/public/questions/:slug` | — | `PublicQuestion`. Only `publication_status='PUBLISHED'`. Old slug in `slug_redirects` → 301 `MOVED_PERMANENTLY`. Else 404 (PUBLIC_NOT_FOUND). Tags `q-{id}, qslug-{slug}, ch-, sub-, exam-` |
| `/public/questions/:slug/related` | `limit` ≤ 20 (default 10) | `QuestionSummary[]` — same topic first, then same chapter, published, ≠ self, ordered by (topic match desc, is_indexable desc, published_at desc). No cursor. |
| `/public/exams/:slug` | — | `{ exam: ExamRef, subjects: (SubjectRef & { published_question_count })[], seo: Seo, breadcrumbs }` |
| `/public/subjects/:slug` | — | `{ subject: SubjectRef, exam: ExamRef, chapters: (ChapterRef & { published_question_count })[], seo: Seo, breadcrumbs }` |
| `/public/chapters/:slug` | `difficulty?`, `type?`, `topic?` (slug), `year?`, `cursor`, `limit` | `{ chapter: ChapterRef & { description }, subject: SubjectRef, exam: ExamRef, topics: (TopicRef & { published_question_count })[], questions: QuestionSummary[], seo: Seo, breadcrumbs }` + `meta.page` (order `published_at desc, id`) |
| `/public/search` | `q` (2–200 chars, required), `exam?`, `subject?`, `chapter?` slugs, `cursor`, `limit` ≤ 50 | `(QuestionSummary & { rank: number })[]` via `websearch_to_tsquery('english', q)` on `search_tsv`, published only. Cache PUBLIC_LIST, RL_SEARCH |
| `/public/sitemap/questions` | `cursor`, `limit` ≤ 1000 | `{ canonical_path, updated_at: ts }[]` where `is_indexable and sitemap_include`, order `updated_at, id`. Cache PUBLIC_LIST, tag `sitemap` |
| `/files/:token` | — | Streams private object if HMAC token valid & unexpired (`signFileUrl`); `Cache-Control: private, max-age=300`; 403 otherwise |

### 3.4 Practice
| Method Path | Auth | Cache | Request | → |
|---|---|---|---|---|
| GET `/practice/questions` | public | PUBLIC_LIST (tag `qlist`) | query `exam` (slug, req), `subject?`, `chapter?`, `topic?`, `difficulty?` (csv), `type?` (csv QuestionType), `year_from?`, `year_to?`, `origin?`, `cursor`, `limit` ≤ 50 | `PracticeQuestion[]` (published only; order `published_at desc, id`) |
| POST `/practice/sessions` | user, RL_WRITE | PRIVATE | `{ client_request_id: uuid, mode: PracticeMode, exam: slug, subject?: slug, chapter?: slug, topic?: slug, paper?: slug, filters?: { difficulty?: Difficulty[], types?: QuestionType[], year_from?: int, year_to?: int, exclude_correct?: boolean (default true) }, size?: int 1..50 (default 10) }` | 201 `{ session: SessionProgress & { mode, started_at }, questions: PracticeQuestion[] }`. Mode requirements: SUBJECT→subject, CHAPTER→chapter, TOPIC→topic, PYQ_PAPER→paper (ordered by question_number), MISTAKES→user's open mistakes, BOOKMARKS→user's bookmarks, MIXED→random across exam. Selection random among eligible published. Same `client_request_id` → 200 same session (`meta.replayed=true`). No eligible questions → 422 `VALIDATION_ERROR` details `{reason:'NO_QUESTIONS'}` |
| GET `/practice/sessions/:id` | user (owner, else 404) | PRIVATE | — | `{ session: SessionProgress & { mode, started_at, completed_at: ts|null }, items: { question: PracticeQuestion, attempt: AttemptResult|null }[] }` (solution included only for attempted items) |
| POST `/practice/sessions/:id/abandon` | user | PRIVATE | — | `SessionProgress` (ACTIVE→ABANDONED; else 409 INVALID_STATE_TRANSITION) |
| POST `/practice/attempts` | user, RL_ATTEMPTS | PRIVATE | headers `Idempotency-Key` optional (if present must equal `client_attempt_id`); body `{ client_attempt_id: uuid, question_id: uuid, session_id?: uuid, response: AnswerResponse, time_spent_ms?: int 0..10800000 }` | 201 `AttemptResult` |

**Attempt idempotency & replay rules (W2 must implement exactly):**
1. `request_hash = sha256(canonicalJson({question_id, session_id ?? null, response}))`.
2. Look up `(user_id, client_attempt_id)`. If exists: same hash → **200** with the stored result recomputed from the stored row
   (`meta.replayed = true`); different hash → **409 `IDEMPOTENCY_CONFLICT`**. Never re-grade or double-count.
3. Question must be PUBLISHED (else 404). `response.type` must equal question_type (else 400). Option ids must belong to the question.
4. If `session_id`: session must be owner's, ACTIVE (else 409 INVALID_STATE_TRANSITION), contain question_id (else 400); a prior
   attempt for (session, question) with a different client_attempt_id → 409 `ALREADY_ATTEMPTED`.
5. Grade server-side with `answer_key` read via `withService`; insert via `withService` with `user_id = jwt.sub`; on unique-violation
   race on `(user_id, client_attempt_id)` re-read and apply rule 2. Triggers update daily activity/streak/mistakes/stats/session.
6. Response includes correct answer + published solution only **after** the attempt is stored.

### 3.5 Student (`user`, PRIVATE)
| Method Path | Request | → |
|---|---|---|
| GET `/users/me` | — | `{ id, email: string|null, display_name, timezone, target_exam: ExamRef|null, target_year, daily_goal_attempts, roles: AppRole[], exam_preferences: { exam: ExamRef, is_primary, target_year }[], created_at }` |
| PATCH `/users/me` | `{ display_name?: string 1..60 \| null, timezone?: IANA string, target_exam?: slug \| null, target_year?: int \| null, daily_goal_attempts?: int 1..500, onboarding_completed?: true }` (≥1 field) | same as GET (via `withUser`; invalid tz → 400) |
| PUT `/users/me/exam-preferences` | `{ preferences: { exam: slug, is_primary: boolean, target_year?: int }[] (≤5, ≤1 primary) }` | replaced list (`withUser`) |
| GET `/users/me/progress` | `exam` slug (default target/primary exam) | `{ exam: ExamRef, totals: { attempts, correct, accuracy: number 0..1, total_time_ms, distinct_chapters }, subjects: { subject: SubjectRef, attempts, correct, accuracy }[], chapters: { chapter: ChapterRef, subject_id, attempts, correct, accuracy, last_attempt_at: ts }[], weak_areas: { chapter: ChapterRef, attempts, accuracy, reason: 'LOW_ACCURACY' }[] }` — weak = chapters with attempts ≥ 5 and accuracy < 0.5, worst 5 |
| GET `/users/me/streak` | — | `{ current_streak, longest_streak, last_active_date: date|null, today: date, timezone, today_attempts: int, daily_goal_attempts: int, goal_met_today: boolean, last_7_days: { date, attempts: int, correct: int }[] }` (uses `app_private.get_streak`) |
| GET `/users/me/attempts` | `question_id?`, `session_id?`, `cursor`, `limit` | `{ id, question: QuestionSummary, is_correct, score: dec, response: AnswerResponse, time_spent_ms, submitted_at }[]` |
| GET `/users/me/bookmarks` | `cursor`, `limit` | `{ question: QuestionSummary, note: string|null, created_at }[]` (order created_at desc) |
| POST `/users/me/bookmarks` | `{ question_id: uuid, note?: string ≤500 }`, RL_WRITE | 201 created / 200 if existed (note updated); unpublished → 404 |
| DELETE `/users/me/bookmarks/:questionId` | — | 204 (idempotent; also 204 if absent) |
| GET `/users/me/mistakes` | `status` = `open`(default)\|`resolved`\|`all`, `subject?`, `chapter?` slugs, `cursor`, `limit` | `{ question: QuestionSummary, wrong_count, first_wrong_at, last_wrong_at, resolved_at: ts|null }[]` (order last_wrong_at desc) |
| DELETE `/users/me/mistakes/:questionId` | — | 204 (dismiss) |
| GET `/users/me/doubts` | `cursor`, `limit` | `{ id, question: QuestionSummary|null, body, status, created_at, attachment_url: string|null }[]` (signed URL ≤15 min) |

### 3.6 Doubts & uploads
| Method Path | Auth | Request | → |
|---|---|---|---|
| POST `/doubts` | optional, RL_DOUBTS | `{ body: string 1..4000, question_id?: uuid, upload_id?: uuid (user only, must be owner's CONFIRMED upload) }` | 202 `{ id, status:'OPEN' }`. Guests: `user_id=null`, `ip_hash` stored. Never public. Over daily cap → 429 |
| POST `/uploads` | user, RL_WRITE | raw body; headers `Content-Type` ∈ image/png,image/jpeg,image/webp; `Content-Length` ≤ 5242880; `X-Upload-Purpose: DOUBT_ATTACHMENT` | 201 `{ upload_id: uuid, mime_type, bytes, url: string (signed, ≤15 min) }`. Magic-byte mismatch → 415; too big → 413 |

### 3.7 Admin (`reviewer` or `admin` as marked; PRIVATE; RL_ADMIN; every mutation writes `audit_log` and, for editorial actions, `review_events`)
```ts
AdminQuestionListItem = { id, slug, question_type, origin, verification_status, publication_status, ingestion_status, indexability,
  is_indexable, sitemap_include, difficulty, exam: ExamRef, subject: SubjectRef|null, chapter: ChapterRef|null, year, updated_at: ts, row_version: int }
AdminQuestion = AdminQuestionListItem & { topic: TopicRef|null, paper: Attribution['paper'], question_text, structured_content: ContentBlock[],
  options: { id, label, content: ContentBlock[], external_option_id: string|null }[], answer_key: AnswerKey|null, answer_key_source: AnswerKeySource|null,
  current_solution_id: uuid|null, solution_versions: { id, version, provenance, review_status, created_at, ai_run_id, author_id }[],
  seo_title, seo_description, source: { id, code, name } | null, source_question_id: uuid|null, marks: dec, negative_marks: dec,
  published_at, first_published_at, created_at }
SolutionVersionFull = { id, version, final_answer: AnswerKey, summary, steps, formulas, concepts, alternatives, shortcuts, common_mistakes,
  sympy_checks: unknown[], provenance, review_status, based_on_version_id, ai_run_id, author_id, edit_note, reviewed_by, reviewed_at, created_at }
```
| Method Path | Auth | Request | → |
|---|---|---|---|
| GET `/admin/questions` | reviewer | query `verification_status?` (csv), `publication_status?` (csv), `ingestion_status?`, `exam?`, `subject?`, `chapter?`, `origin?`, `q?` (FTS), `cursor`, `limit` | `AdminQuestionListItem[]` (order updated_at desc, id) |
| GET `/admin/questions/:id` | reviewer | — | `AdminQuestion` |
| PATCH `/admin/questions/:id` | admin (content) / reviewer (metadata only) | `{ expected_row_version: int, structured_content?, options?: {label, content}[], question_type?, answer_key?, marks?, negative_marks?, difficulty?, chapter?: slug, topic?: slug\|null, seo_title?, seo_description?, indexability?, sitemap_include?, slug? }` | `AdminQuestion`. Content fields (structured_content, options, question_type, answer_key, marks, negative_marks) on PUBLISHED → 409 INVALID_STATE_TRANSITION ("unpublish first"); content change sets verification_status=HUMAN_REVIEW_REQUIRED (unless PENDING). answer_key edit sets source HUMAN. Row version mismatch → 409 VERSION_CONFLICT. slug change on published sets `app.allow_slug_change` (admin only) |
| POST `/admin/questions/:id/solutions` | reviewer | `{ based_on_version_id?: uuid, final_answer: AnswerKey, summary?, steps, formulas?, concepts?, alternatives?, shortcuts?, common_mistakes?, edit_note: string 1..1000 }` | 201 `SolutionVersionFull` (provenance AI_HUMAN_EDITED if based on AI version else HUMAN_AUTHORED; review_status PENDING) |
| GET `/admin/questions/:id/solutions/:versionId` | reviewer | — | `SolutionVersionFull` |
| POST `/admin/questions/:id/approve` | reviewer | `{ solution_version_id: uuid, expected_row_version, note?: string, override_official_key?: { reason: string 10..1000 } }` | `AdminQuestion`. Allowed from AUTOMATED_CHECKS_PASSED, OFFICIAL_KEY_MATCHED, HUMAN_REVIEW_REQUIRED, DISPUTED(admin only). Sets version APPROVED (others APPROVED→SUPERSEDED), `current_solution_id`, `verification_status=HUMAN_VERIFIED`; if answer_key null → set from version (source HUMAN); if official key exists and ≠ version.final_answer → 422 unless override (admin only; then answer_key := version, source HUMAN, event notes reason) |
| POST `/admin/questions/:id/reject` | reviewer | `{ target: 'SOLUTION'\|'QUESTION', solution_version_id?: uuid (req for SOLUTION), reason: string 3..2000, regenerate?: boolean }` | `AdminQuestion`. SOLUTION: version REJECTED, status HUMAN_REVIEW_REQUIRED, optional enqueue AI_SOLVE (new idempotency suffix). QUESTION: publication ARCHIVED |
| POST `/admin/questions/:id/publish` | admin | `{ expected_row_version }` | `AdminQuestion`; failing guard → 422 PUBLISH_REQUIREMENTS_NOT_MET with `unmet[]` (API pre-checks same rules as DB guard) ; copies its assets to PUBLIC_ASSETS (idempotent) ; purge |
| POST `/admin/questions/:id/unpublish` | admin | `{ expected_row_version, reason }` | → DRAFT; purge |
| POST `/admin/questions/:id/archive` / `/restore` | admin | `{ expected_row_version, reason }` | ARCHIVED ↔ DRAFT |
| POST `/admin/questions/:id/dispute` | reviewer | `{ reason }` | verification DISPUTED (auto-unpublish if published); purge |
| GET `/admin/verification/queue` | reviewer | `status?` csv (default HUMAN_REVIEW_REQUIRED,DISPUTED,AUTOMATED_CHECKS_PASSED,OFFICIAL_KEY_MATCHED), `exam?`, `cursor`, `limit` | `AdminQuestionListItem & { latest_run: { outcome, reasons: string[], finished_at } \| null }[]` |
| GET `/admin/questions/:id/verification` | reviewer | — | `{ runs: { id, rules_version, outcome, resulting_status, reasons, started_at, finished_at, checks: { kind, result, details, ai_run_id }[] }[], ai_runs: { id, task, provider, model, prompt_id, prompt_version, status, input_tokens, output_tokens, cost_usd_micros, latency_ms, created_at }[], review_events: { action, actor_id, from_verification_status, to_verification_status, from_publication_status, to_publication_status, note, created_at }[] }` |
| POST `/admin/questions/:id/verification/run` | reviewer | `{ stages?: ('CLASSIFY'\|'SOLVE'\|'VERIFY'\|'SEO')[] (default ['VERIFY']), force?: boolean }` | 202 `{ job_ids: uuid[] }` (enqueue only; `force` appends `:force-{n}` to idempotency key) |
| GET `/admin/sources` | admin | `cursor`, `limit` | `{ id, code, name, kind, reuse_permitted, approved_at, license_name, license_url, attribution_text }[]` |
| POST `/admin/sources` | admin | `{ code, name, kind, publisher?, homepage_url?, license_name?, license_url?, reuse_permitted: boolean, attribution_text?, notes? }` | 201 source |
| POST `/admin/sources/:id/approve` | admin | `{ reuse_permitted: true, license_name: string, license_url?: url, note: string 10..2000 }` | source (sets approved_by/at) |
| GET `/admin/ingestion/documents` | admin | `cursor`, `limit`, `source?` | `{ id, source_code, paper_slug, kind, original_filename, bytes, page_count, created_at, latest_job: { id, status, attempts, last_error } \| null, question_counts: Record<SourceQuestionStatus, int> }[]` |
| GET `/admin/ingestion/jobs` | admin | `status?` csv, `kind?` csv, `cursor`, `limit` | `{ id, kind, status, attempts, max_attempts, priority, idempotency_key, run_after, locked_by, last_error, question_id, source_document_id, created_at, finished_at }[]` |
| GET `/admin/ingestion/jobs/:id` | admin | — | job + `events: { level, stage, message, data, created_at }[]` (last 500) |
| POST `/admin/ingestion/jobs/:id/retry` | admin | — | job (DEAD/CANCELLED → QUEUED, attempts=0, run_after=now) else 409 |
| POST `/admin/ingestion/jobs/:id/cancel` | admin | — | job (QUEUED/RUNNING → CANCELLED) |
| GET `/admin/ingestion/source-questions` | admin | `document_id` (req), `status?`, `cursor`, `limit` | `{ id, question_number, status, warnings, extraction_method, ocr_mean_confidence, duplicate_of_question_id, possible_duplicate_of, duplicate_similarity, promoted_question_id }[]` |
| POST `/admin/ingestion/source-questions/:id/promote` | admin | `{ exam: slug, subject?: SubjectCode }` | `{ question_id }` (calls `promote_source_question`) |
| POST `/admin/ingestion/source-questions/:id/reject` | admin | `{ reason }` | 204 |

Document registration/upload is done by the Python CLI (`pxw ingest register`, INGESTION_PIPELINE §5), not by the API.

### 3.8 Problem set (Owner B, migrations 0022/0023; contracts `dto/problems.ts`)
A *problem* is a family of questions that differ only in their numbers (template variants); a one-off question is a family of
one. Signed-out responses are publicly cacheable; anything with a viewer is PRIVATE.

| Method & path | Access | Request | Response `data` |
|---|---|---|---|
| GET `/problems` | optional | `exam`, `subject?`, `chapter?`, `difficulty?` (repeatable), `status?` (`SOLVED`/`ATTEMPTED`/`TODO`, needs sign-in), `premium?`, `q?`, `sort` (`number`/`acceptance`/`difficulty`), `order`, `offset`, `limit` ≤ 100 | `{ items: Problem[], total, offset, limit }` |
| GET `/problems/summary` | optional | `exam` | `{ problems: {EASY,MEDIUM,HARD,total}, solved?, attempted?, plus, free_variants_per_problem }` |
| GET `/problems/daily` | public | `exam` | `{ date, problem }` (FREE problems only, same for everyone, IST day) |
| GET `/problems/:number` | optional | — | `ProblemDetail` (variants tried / free variants left) |
| GET `/problems/:number/next` | user | — | `PracticeQuestion` (untried variant first; no answer). Free users get `FREE_VARIANTS_PER_PROBLEM` variants; PREMIUM problems → 403 `PREMIUM_REQUIRED` |

Web: `/practice/` (problem library) reads these; answers go through `POST /practice/attempts` as usual.

### 3.9 Diagnostic + study plans (Owner A, migration 0024; contracts `dto/plans.ts`; algorithm `packages/plans`)
Design: `docs/superpowers/specs/2026-11-17-problem-library-and-study-plans-design.md`. All routes are `user`, PRIVATE.
The algorithm is pure and deterministic; the server gathers evidence only from attempts it graded itself.

| Method & path | Access | Request | Response `data` |
|---|---|---|---|
| POST `/plans/diagnostic` | user (free) | `{ client_request_id, exam, subjects?: slug[], chapters?: slug[], length: 15\|30\|45 }` | `{ session, questions, requested_mix, actual_mix, short_by }`; 201 / 200 replay; 422 `NO_QUESTIONS` |
| GET `/plans/diagnostic/:sessionId/report` | user | — | `{ session_id, completed, actual_mix, subjects[], focus[≤3], chapters: ChapterResult[] \| null, plus }` (`chapters` is null without Plus) |
| POST `/plans` | user (free within limits; **Plus** for longer) | `{ client_request_id, diagnostic_session_id, daily_minutes: 30\|60\|90\|120, days: 7\|14 }` | `StudyPlan`; archives the active plan for the exam. Free: up to `FREE_PLAN_MAX_DAYS` (default 7) days and `FREE_PLAN_MAX_DAILY_MINUTES` (default 60) a day. Plus: up to 14 days and 120 min a day. Beyond the limit: 403 `PREMIUM_REQUIRED` |
| GET `/plans/current` | user | `exam` | `StudyPlan`, re-planned for today (past days and started items kept); 404 when none; `locked: true` (read-only, nothing re-planned) when Plus has lapsed and the plan is longer than the free limits |
| POST `/plans/:id/items/:key/start` | user (free within limits; **Plus** for longer plans) | — | `{ item, session \| null }`; creates or replays the item's practice session (idempotent per item); PROBLEMS / REVIEW_DIAGNOSTIC only record a start |

Diagnostic sessions are ordinary `practice_sessions` (`mode MIXED`, `ui_mode test`, `filters.diagnostic = true` plus scope and
mix), so answers use `POST /practice/attempts` and the normal complete endpoint. Students never see a readiness percentage,
rank or predicted score: only bands (`unmeasured`/`weak`/`shaky`/`strong`) and counts.

### 3.10 Billing, rewards, classification and other endpoints

Not in §3.1–3.9 above. Paths and purposes are from `packages/contracts/openapi/openapi.json` unless marked. Access uses the §1 levels; `admin` and `reviewer` are enforced server-side.

| Method & path | Access | Purpose |
|---|---|---|
| GET `/billing/plans` | public | Tabby Plus plans and prices (server is the source of truth) |
| GET `/billing/payment-links/{token}` | public | Parent payment link, public view |
| POST `/billing/payment-links/{token}/order` | public | Start checkout from a parent payment link (201) |
| GET `/billing/me` | user | My plan, access end, free-plan quota |
| POST `/billing/orders` | user | Create a checkout order (server prices it) |
| GET `/billing/orders` | user | My payment history |
| GET `/billing/orders/{id}` | user | One of my orders (poll after checkout) |
| POST `/billing/orders/{id}/verify` | user | Verify a Checkout payment (signature and provider record) |
| POST `/billing/payment-links` | user | Create an "ask a parent to pay" link (7 days) |
| POST `/billing/webhooks/razorpay` | Razorpay signature | Razorpay webhook. Not in openapi.json (plain route in `apps/api/src/billing/routes.ts`); body must be ≤ 256 KB |
| GET `/admin/billing/orders` | admin | List orders |
| POST `/admin/billing/orders/{id}/refund` | admin | Request a full refund (access is revoked by the refund webhook) |
| POST `/admin/billing/entitlements` | admin | Grant Plus days (support) |
| POST `/admin/billing/entitlements/{id}/revoke` | admin | Revoke an entitlement |
| GET `/admin/billing/promo-codes` | admin | List promo codes |
| POST `/admin/billing/promo-codes` | admin | Create a promo code |
| PATCH `/admin/billing/promo-codes/{code}` | admin | Enable or disable a promo code |
| GET `/entitlements` | optional | What this viewer gets: tier, features, limits, ad eligibility |
| GET `/rewards/offers` | user | Optional rewarded-ad offers and whether each is available now |
| POST `/rewards/offers/{code}/start` | user | Student chose to watch: issue a single-use nonce (201) |
| POST `/rewards/claim` | user | Report the rewarded-ad outcome; grants only on GRANTED within the rules |
| GET `/admin/classify/questions` | reviewer | Browse questions for classification (any status) with difficulty counts |
| POST `/admin/classify/bulk` | reviewer | Set difficulty, chapter or topic on up to 200 questions |
| GET `/admin/classify/questions/{id}/preview` | reviewer | Question with original crops (10-minute signed image URLs) and answer key |
| GET `/files/preview/{token}` | signed token | Signed question image for the admin preview (token from the preview route, 10 minutes) |
| POST `/analytics/events` | public | Aggregate daily counters from the web app. Not in openapi.json (plain route in `apps/api/src/analytics/routes.ts`); body ≤ 4 KB |
| GET `/admin/analytics/daily` | admin | Daily event counters (aggregate only) |

## 4. Implementation notes binding on W2
* Routes are `createRoute` definitions in `apps/api/src/routes/**`; request/response schemas imported from `@projectx/contracts`.
* Mapper functions `toPublicQuestion`, `toPracticeQuestion`, `toAttemptResult`, `toAdminQuestion` live in `apps/api/src/mappers/` and
  are the only way DB rows reach responses; they resolve image `asset_id` → `url = PUBLIC_ASSETS_BASE_URL/{r2_key}` (public routes
  require PUBLIC bucket assets; missing → block omitted and logged).
* `optional`-auth endpoints never vary cacheable output by token; `POST /doubts` is the only optional route.
* `ETag` (weak, `W/"{id}:{row_version}"`) on `PUBLIC_CONTENT` single-resource routes; honour `If-None-Match` → 304.

# ProjectX Tech Stack, Front to Back

Audience: the project owner. You are smart, but you may not be a backend person. Every claim here was checked against
the code or config in this repo, not just against other docs. Hosting facts were updated on 2026-11-19 to the current Google Cloud setup (runbook: `DEPLOYMENT_GCP.md`). Where I could
not verify something, it is marked **[unverified]**. Section 17 is honest about what is built, stubbed or never run.

The product has a working name, "Tabby" (`src/lib/site.ts`). The repo and packages are called ProjectX.

---

## 1. The 60-second picture

```
 Student's browser
   |  loads pages (HTML) from                      signs in / signs up directly with
   v                                                    v
 WEB APP (Next.js 16, src/)  ---- reads content ---> API (Hono, apps/api)  ---- SQL ----> DATABASE
   server components + client      over HTTPS        runs on Cloud Run                   Supabase Postgres
   "use cache" + tags              Bearer JWT        zod validation, rate limits         RLS, triggers, job queue
        ^                                |   |
        | POST /api/revalidate/          |   +--> Cloud Storage buckets (files: PDFs, crops, public images, uploads)
        +--------------------------------+
          "these cache tags changed"                 Offline / operator-run (never inside a web request):
                                                      - Python ingestion (workers/): PDF -> structured questions
                                                      - AI pipeline (packages/ai): Gemini + SymPy -> solutions
                                                      Both read/write the same database through a job queue table.
```

In plain words:

- **Web app** = what students see. Next.js (React).
- **API** = the only door to the data for the web app. A small Hono (Node) server on Cloud Run (`projectx-api`). The web app runs on Cloud Run too (`projectx-web`), served at https://tabbyprep.in through Firebase Hosting.
- **Database** = Supabase (Postgres). Holds questions, solutions, users, attempts. It also enforces the important rules.
- **Auth** = Supabase Auth. The browser signs in with Supabase; the API only checks the resulting token.
- **Files** = Google Cloud Storage buckets.
- **Ingestion + AI** = batch tools you run on a machine, not part of the live site. They turn PDFs into draft questions
  and draft solutions. A human then approves and publishes.

Core product rule that shapes everything: **AI output is never published on its own.** A database trigger refuses to
publish a question unless a human-approved solution and a matching answer key exist (section 6.4).

---

## 2. Repository layout

```
ProjectX/
  src/                  The web app (root Next.js project)
    app/                Routes (App Router) in route groups: (site) (auth) (app) (exam) (focus), plus api/
    components/         UI pieces: app, brand, cbt, charts, content, layout, practice, results, seo, theme, ui
    contracts/          Re-exports the shared zod types for the web app (index.ts)
    fixtures/           Mock content (questions, papers, syllabus) used in "mock" mode
    lib/
      data/             Server-side content data layer (mock OR api)
      api/              Typed HTTP client for the API + adapters (API shape -> UI shape)
      auth/             Supabase browser client + session helpers
      session/          Student state store for API mode (attempts, bookmarks, drafts)
      demo/             Local-only demo store used in mock mode
      site.ts, indexing.ts, seo.ts, exams.ts, subjects.ts   Config, SEO flags, exam metadata
  apps/api/             The API (Hono + zod-openapi), deployed on Cloud Run
    src/                app.ts, server.ts (Cloud Run entry, built to dist/server.mjs), node.ts (local dev entry), worker.ts
                        (legacy Cloudflare entry, not deployed), routes/, services/, repositories/{sql,memory}, middleware/, auth/
    wrangler.toml       Legacy Cloudflare Worker config (not used for deployment)
    test/               API tests (in-memory store and real SQL on PGlite)
  packages/
    contracts/          THE shared contract: zod schemas for every request/response, error codes, generated OpenAPI
    shared/             Pure helpers: canonical JSON, answer comparison, decimals, slugs, cursors
    db/                 Migration runner, PGlite (in-process Postgres for tests), postgres.js executor
    database-types/     Generated TypeScript types of the DB schema
    edge/               Cache classes + tags, purge drivers, rate limiter, signed URLs, storage adapters (local, gcs, legacy r2)
    ai/                 Gemini client + mock, prompts, verification rules, SymPy bridge, job runner CLI
  supabase/
    migrations/         0001 ... 0026 SQL migrations (the schema; live DB is at 0025)
    seed/               Reference data: exams, subjects, chapters, topics, sources
    fixtures/           Demo questions and dev users (never for production)
    shim/               Fake Supabase roles/auth.users so PGlite can run the migrations (never for production)
    tests/              Database tests (RLS, triggers, publication guard, pipeline)
  workers/              Python ingestion package "pxw" (PyMuPDF, OCR, SymPy check)
  infra/gcp/            Deploy scripts for Cloud Run, Firebase Hosting and the ingest job (see DEPLOYMENT_GCP.md)
  infra/cloudflare/     Legacy runbooks and config snippets (not used)
  docs/                 Design docs (ARCHITECTURE, DATABASE_SCHEMA, API_CONTRACTS, AI_PIPELINE, INGESTION_PIPELINE, ...)
```

How it is wired: npm workspaces (`apps/*`, `packages/*`) in the root `package.json`; Node `>=22.18 <23`. The root
`tsconfig.json` is scoped to the web app so backend packages do not break `typecheck:web` (see git log). There is also
a `pnpm-workspace.yaml` and `pnpm-lock.yaml`, but scripts and docs use npm and `package-lock.json`.

---

## 3. Frontend

### 3.1 Technologies (versions from `package.json`)

| Thing | Version | Notes |
|---|---|---|
| Next.js | 16.4.6 | App Router, Turbopack |
| React | 19.3.0 | server components + client components |
| Tailwind CSS | 4.3.3 | wired through `@tailwindcss/turbopack` in `next.config.ts` |
| KaTeX | ^0.19.1 | maths rendering; its CSS is imported in `src/app/layout.tsx` |
| zod | ^4.6.7 | validates every API response in the browser/server |
| `@supabase/supabase-js` | 2.118.0 | browser auth client only |
| jose | 6.2.14 | JWT signing for the offline dev-login route only |
| Vitest | 4.1.12 | web unit tests (`src/**/*.test.ts`) |

Fonts (Inter, Space Grotesk, Silkscreen) come from `next/font/google`. Theme (dark default) is applied by a tiny inline
script so there is no flash.

### 3.2 `next.config.ts` flags that matter

- `cacheComponents: true` and `partialPrefetching: true`. This is Next 16's caching model (sometimes called PPR,
  partial prerendering): a page is a static shell plus cached or streamed pieces. Data functions use the `"use cache"`
  directive; anything uncached or request-specific must sit behind a `<Suspense>` boundary or the build fails. That is
  why `layout.tsx` wraps `NavProgress` in Suspense.
- `trailingSlash: true`. Public URLs end in `/`; the other form 308-redirects. Keep this in mind for the revalidate URL
  (`.../api/revalidate/`).
- `transpilePackages: ["@projectx/contracts"]`: the web app imports the shared contract package directly.

### 3.3 Route groups (`src/app/`)

| Group | Purpose | Examples |
|---|---|---|
| `(site)` | Public, indexable marketing + question pages | `/`, `/[track]/` (jee/neet), `/[track]/[subject]/[chapter]/`, `/[track]/questions/[slug]/`, `/[track]/pyq/[year]/`, `/resources`, `/study-plans` |
| `(auth)` | Login, signup, onboarding | `/login`, `/signup`, `/onboarding` |
| `(app)` | Signed-in shell, all noindex | `/dashboard`, `/practice`, `/progress`, `/bookmarks`, `/mistakes`, `/review`, `/results`, `/tests/[paperId]`, `/leaderboard`, `/account`, `/admin/questions` (admin difficulty classification) |
| `(exam)` | Exam-style CBT shell | `/cbt` |
| `(focus)` | Distraction-free practice player | `/practice/session/...` |
| `api/` | Two tiny route handlers | `/api/revalidate` (cache webhook), `/api/dev/token` (dev login) |

Also: `robots.ts`, `sitemap.ts`, `opengraph-image.tsx`, `not-found.tsx`. There is no Next middleware/proxy file.
Auth enforcement is **not** in the layout (the `(app)` layout comment says so); it is enforced by the API rejecting
requests without a valid token.

### 3.4 Mock mode vs API mode (a whole-app switch)

Set in `src/lib/site.ts`:

```
DATA_SOURCE = (NEXT_PUBLIC_DATA_SOURCE === "api" AND NEXT_PUBLIC_API_BASE_URL is set) ? "api" : "mock"
```

- **mock** (default): content comes from `src/fixtures/*`, student state (attempts, bookmarks, streak) lives in the
  browser's localStorage (`src/lib/demo/*`). A "mock" ribbon is shown. Works with no backend at all.
- **api**: content comes from the real API; student state comes from the server; the localStorage demo store is not
  used. There is no fixture fallback for content: an API failure shows an error page (or stale cached copy), never
  made-up questions. (The syllabus fixture is only used as an editorial overlay for chapter summaries.)

It is deliberately all-or-nothing, never per entity, so you cannot accidentally mix real and fake data.

### 3.5 The data layer (three folders, each with one job)

```
 Page / component (server)
        |  getQuestionPage(slug), getChapters(...), ...
        v
 src/lib/data/index.ts     <- the ONLY place public pages read content. Dispatches mock vs api.
        |                      mock -> catalog.ts + fixtures (validated with the same zod schemas as API data)
        v api
 src/lib/data/api.ts       <- "use cache" wrappers: cacheLife(...) + cacheTag(<the API's X-Cache-Tags>)
        v
 src/lib/api/public.ts, student.ts   <- one function per endpoint, validated by zod schemas (api/schemas.ts)
        v
 src/lib/api/http.ts       <- fetch wrapper: base URL, envelope parsing, errors, retry on 429/503, Bearer token
```

- `src/lib/api/adapters/*` convert API shapes into the UI's types (ids, content blocks, practice questions, student data).
- Cache lifetimes in `data/api.ts`: taxonomy 5 min stale / 1 day revalidate; content 1 min / 1 h; "not found" 30 s / 1 min.
- Public (cached) calls carry no Authorization header. Authenticated calls use `cache: "no-store"`.
- The API's `X-Cache-Tags` response header is copied into Next's cache with `cacheTag(...)`. That is what lets the API
  later say "these tags changed" and have Next drop exactly those pages (section 12).
- `generateStaticParams` for question pages is capped at 200 params (`STATIC_PARAM_CAP`); other slugs render on demand.
- Server components use `API_BASE_URL` (server-only) if set, else `NEXT_PUBLIC_API_BASE_URL`; the browser uses the public one.

### 3.5.1 Student state in API mode (`src/lib/session`)

`session/store.ts` is a client-side store exposing the same hooks as the demo store, so screens barely change. In API
mode every number (grading, streak, progress) comes from the server. A few things stay local to the browser and are
labelled as such: test-mode drafts (`projectx-drafts-v1:*`), the review list and mistake categories
(`projectx-prefs-v1:*`), and flagged demo paper attempts. `client.ts` is the typed API client; `convert.ts` maps shapes;
`registry.ts` keeps a question registry.

### 3.6 Authentication (browser side)

`src/lib/auth/config.ts` picks a mode at build time:

| `AUTH_MODE` | When | What happens |
|---|---|---|
| `supabase` | `NEXT_PUBLIC_SUPABASE_URL` and `..._PUBLISHABLE_KEY` set | Email + password through the Supabase browser client (`auth/supabase.ts`, singleton, `persistSession`, `autoRefreshToken`) |
| `dev` | `NEXT_PUBLIC_AUTH_MODE=dev` | `/api/dev/token` mints an HS256 test JWT for fixed dev users (`dev1`, `dev2`, `admin`). Returns 404 when `NODE_ENV=production`. Needs `DEV_TEST_JWT_SECRET` equal to the API's `TEST_JWT_SECRET`. |
| `none` | neither | Sign-in screens say auth is not configured |

The browser only ever holds the **publishable** key. After sign-in, the access token is handed to the API client via
`setTokenProvider` (`src/lib/api/auth.ts`) and sent as `Authorization: Bearer <jwt>`. The API verifies it (section 5.2).

### 3.7 Indexing and SEO flags

- `INDEXABLE = NEXT_PUBLIC_ALLOW_INDEXING === "true" AND DATA_SOURCE === "api"` (`site.ts`). Sample fixture content can
  never be indexed: the root layout sets `robots: noindex` unless this is true.
- `robots.ts` allows crawling of everything, on purpose, so crawlers can *see* `noindex` tags. Private routes are kept
  out via noindex meta, not robots.txt.
- Per-question rule (`lib/indexing.ts`): indexable only if the server's `indexable` flag is not false, the question has
  a public page, has a solution, and is not `disputed`. Chapter pages are indexable only above a minimum question count
  (`MIN_QUESTIONS_TO_INDEX_CHAPTER` in `lib/seo.ts`).
- The sitemap in API mode is exactly the API's `/public/sitemap/questions` (the database's `sitemap_include` flag); in
  mock mode only indexable fixtures.
- Renamed question slugs: the API returns the new slug and the page does a permanent redirect.
- `(app)` pages use `PRIVATE_METADATA` (noindex).

---

## 4. Repo-wide contracts (`packages/contracts`)

One zod schema per request/response, shared by API, web app and tests. From it:

- the API validates input and builds its OpenAPI 3.1 document (`packages/contracts/openapi/openapi.json`, generated by
  `npm run openapi`);
- the web app validates output with the same schemas;
- JSON Schema for the ingestion payload is emitted to `packages/contracts/json-schema/`, and the Python workers mirror it
  with Pydantic models.

Envelope on every API response: `{ data, meta? }` on success, `{ error: { code, message, request_id, details? } }` on failure.

---

## 5. The API (`apps/api`)

### 5.1 Framework and shape

- **Hono** with **`@hono/zod-openapi`**: each route is declared once with zod schemas; validation and the OpenAPI doc
  fall out of that. `routes/define.ts` (`defineRoute`) builds every route with the standard envelope, error responses,
  security scheme, auth guard and rate-limit guard.
- All routes live under `/api/v1`. Route files: `routes/public.ts`, `routes/student.ts` (practice + user), `routes/admin/index.ts`.
- Layers: `routes/` (HTTP) -> `services/` (business rules) -> `repositories/` (SQL, in `sql/`, or an in-memory fake in
  `memory/` for fast tests). `mappers/` turn DB rows into API DTOs.
- Entry points: `server.ts` (Cloud Run, precompiled to `dist/server.mjs`), `node.ts` (local dev server using PGlite or
  Postgres, local file storage, in-memory rate limiter) and `worker.ts` (legacy Cloudflare Workers entry, not deployed).
- Docs: `/api/v1/openapi.json` and `/api/v1/docs` exist; `ENABLE_API_DOCS` controls the docs page (false in production vars).

### 5.2 Middleware and request lifecycle

Order in `app.ts` / `middleware/core.ts`:

1. `requestContext`: request id (accepts a valid incoming `X-Request-Id`, else generates one), injects deps and store,
   hashes the client IP with an HMAC secret (`IP_HASH_SECRET`; raw IPs are not kept), and after the handler adds
   security headers (`X-Content-Type-Options`, `Referrer-Policy: no-referrer`, HSTS). Default `Cache-Control` is
   `private, no-store`; any non-GET/HEAD is forced to that.
2. `corsMiddleware`: only origins in `CORS_ALLOWED_ORIGINS` (exact match, no wildcard) are allowed; `credentials: false`
   (the token travels in a header, not a cookie).
3. Optionally `edgeCacheMiddleware` when `CACHE_MODE=cache_api` (fallback cache, section 11).
4. Per route: `authGuard(access)` then `rateLimit(class)`.
5. `onError` converts anything thrown into the error envelope; database errors are mapped to API error codes
   (e.g. a failed publish rule becomes `PUBLISH_REQUIREMENTS_NOT_MET`); unknown errors become a generic `INTERNAL` 500
   with a log line, never a stack trace to the client.

### 5.3 Auth modes and access levels

`auth/verifier.ts` verifies a Supabase JWT. Mode is `AUTH_MODE`:

| Mode | How it verifies | Use |
|---|---|---|
| `jwks` | Fetches Supabase's public keys from `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (cached per isolate), checks audience `authenticated` and issuer | Production target |
| `hs256` | Shared secret `SUPABASE_JWT_SECRET` | Hosted projects still on the legacy secret |
| `test` | `TEST_JWT_SECRET` | Local/dev only; config forbids it when `APP_ENV=production` (stated in `.env.example`) |

`verify()` never throws; a bad token just means "not authenticated". A valid token needs `role = authenticated` and a `sub`.

Access levels per route (`middleware/guards.ts`):

| Level | Meaning |
|---|---|
| `public` | Never reads the token, so the output cannot vary by user (this is what makes it cacheable) |
| `optional` | Uses the token if present (e.g. posting a doubt as guest or user) |
| `user` | Needs a valid token **and** a non-anonymous account (`ACCOUNT_REQUIRED` for Supabase anonymous users) |
| `reviewer` | Needs role ADMIN or REVIEWER (looked up in `user_roles`, cached up to 60 s per isolate) |
| `admin` | Needs role ADMIN |

### 5.4 Endpoint map (verified in the route files)

- **System:** `GET /health`, `/openapi.json`, `/docs`
- **Taxonomy (public):** `/taxonomy/exams`, `/taxonomy/exams/{slug}/subjects`, `/taxonomy/subjects/{slug}/chapters`,
  `/taxonomy/chapters/{slug}/topics`, `/taxonomy/tree`
- **Public content:** `/public/questions/{slug}` (+ `/related`), `/public/exams/{slug}`, `/public/subjects/{slug}`,
  `/public/chapters/{slug}`, `/public/search`, `/public/sitemap/questions`
- **Files:** `GET /files/{token}` streams a private upload using a signed token
- **Practice:** `GET /practice/questions` (no answers/solutions), `POST /practice/sessions`, `GET /practice/sessions[/{id}]`,
  `POST /practice/sessions/{id}/complete|abandon`, `POST /practice/attempts`
- **Student:** `/users/me` (+ PATCH), `/users/me/exam-preferences`, `/progress`, `/streak`, `/activity`, `/attempts`,
  `/bookmarks`, `/mistakes`, `/doubts`; `POST /doubts`; `POST /uploads` (raw image body)
- **Admin (reviewer/admin):** list/get/edit questions, solution versions, approve/reject, publish/unpublish/archive/restore,
  dispute, verification queue and detail, enqueue verification; sources (register, approve licence); ingestion documents,
  jobs (list/get/retry/cancel), source questions (promote/reject)

### 5.5 Caching headers and tags (`packages/edge/src/cache.ts`)

Each route declares a cache class; the API sets `Cache-Control` accordingly.

| Class | `Cache-Control` | Used for |
|---|---|---|
| `TAXONOMY` | `public, max-age=300, s-maxage=86400, stale-while-revalidate=86400` | exams/subjects/chapters/topics |
| `PUBLIC_CONTENT` | `public, max-age=60, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400` | question/exam/subject/chapter pages |
| `PUBLIC_LIST` | `public, max-age=0, s-maxage=300, stale-while-revalidate=600` | search, sitemap, practice question list |
| `PUBLIC_NOT_FOUND` | `public, max-age=30, s-maxage=300` | negative results |
| `PRIVATE` / `NONE` | `private, no-store` / `no-store` | everything authenticated, all writes, health |

`s-maxage` is how long the shared (CDN) cache may keep it; `stale-while-revalidate` lets it serve an old copy while
fetching a fresh one. Cacheable responses also get `Cache-Tag` and `X-Cache-Tags` headers (never on private ones). Tags
look like `q-<id>`, `qslug-<slug>`, `ch-<id>`, `sub-<id>`, `exam-<id>`, `tax`, `qlist`, `sitemap`, `search`.

### 5.6 Rate limiting

Six classes, keyed by user id when logged in, else by hashed IP. `RL_WRITE`, `RL_ATTEMPTS`, `RL_DOUBTS` and `RL_ADMIN` are counted in Postgres across instances (migration 0017); `RL_PUBLIC` and `RL_SEARCH` are in memory per instance:

| Class | Limit per 60 s | Applied to |
|---|---|---|
| `RL_PUBLIC` | 300 | public reads |
| `RL_SEARCH` | 30 | search |
| `RL_WRITE` | 30 | profile/bookmark/session/upload writes |
| `RL_ATTEMPTS` | 60 | submitting attempts |
| `RL_DOUBTS` | 5 | posting doubts |
| `RL_ADMIN` | 120 | defined in config and in the type; **[unverified]** which admin routes apply it (I did not trace every admin route) |

Over the limit: HTTP 429 `RATE_LIMITED` with `Retry-After`. Drivers: `memory` (default), `cloudflare` (legacy bindings),
`noop`. No WAF or Cloud Armor is in place; `DEPLOYMENT_GCP.md` says to add Cloud Armor only if abuse appears.

### 5.7 Attempt submission and idempotency (`services/practice.ts`)

`POST /practice/attempts` is the core student write. The server grades; the browser never sees the answer first.

1. The client generates `client_attempt_id` (a UUID) and may send the same value as the `Idempotency-Key` header
   (they must match, or 400).
2. The server hashes the canonical request (`question_id`, `session_id`, `response`).
3. If an attempt with that `client_attempt_id` already exists for this user: same hash -> replay the stored result
   (response flagged `meta.replayed`); different hash -> `IDEMPOTENCY_CONFLICT`.
4. Else: question must be published and have a key and solution; response type must match the question type; option ids
   must belong to the question; if in a session, the session must be ACTIVE, contain the question, and the question must
   not already be attempted in it (`ALREADY_ATTEMPTED`).
5. Grade (`gradeAttempt`), insert the attempt. A race with the same id is caught by the unique constraint and turned into a replay.
6. Only after the row is stored does the response include the correct answer and solution.

The database backs this up: `unique (user_id, client_attempt_id)` and a unique index on `(session_id, question_id)`.
Retrying on a flaky network is therefore safe. Sessions have a similar `unique (user_id, client_request_id)`.

### 5.8 Admin publish workflow

States: `DRAFT -> PUBLISHED -> ARCHIVED`, restore back to `DRAFT`. Verification states are separate (section 8).

- Edits use optimistic locking (`expected_row_version`; mismatch -> `VERSION_CONFLICT`).
- `approve` marks a solution version APPROVED and the question `HUMAN_VERIFIED` (human action).
- `publish` (ADMIN only): checks requirements in code, copies any referenced images from the private bucket to the
  public bucket under a content-addressed key, then flips the status. The database guard re-checks everything.
- `dispute` marks a question disputed and the database auto-unpublishes it.
- Every action writes `review_events` and `audit_log` rows, and (if the question was or becomes live) triggers a cache
  purge (section 12).

---

## 6. The database (Supabase Postgres)

### 6.1 Why the database does so much

Important rules live in the database, not only in the API, so no bug or future second client can bypass them. That is
a deliberate "belt and braces" choice: API checks give nice error messages; DB constraints, triggers and RLS are the
final authority.

### 6.2 Migrations (`supabase/migrations/`)

| # | What it adds |
|---|---|
| 0001 | `app_private` schema (internal functions, not reachable by clients), `pg_trgm`, helpers (updated_at trigger, LaTeX stripping) |
| 0002 | All enum types (question types, statuses, roles, job kinds, AI tasks, ...) |
| 0003 | Taxonomy: exams -> subjects -> chapters -> topics |
| 0004 | Provenance: `sources` (licence info), `exam_papers`, `source_documents` |
| 0005 | `questions`, `question_options`, `question_assets`, `slug_redirects`; before-write trigger (slug generation, taxonomy consistency, full-text search, row_version, publish timestamps) |
| 0006 | `solution_versions`: versioned and **immutable** (only review fields may change) |
| 0007 | Pipeline: `pipeline_jobs` queue, `source_questions` (staging), official answer keys, job functions, near-duplicate search, `promote_source_question` |
| 0008 | AI + verification: `ai_runs`, `verification_runs/checks`, `review_events`, `audit_log`, `usage_counters` |
| 0009 | Users: `user_roles`, `profiles`, exam preferences, `handle_new_user` trigger, helper predicates |
| 0010 | Practice: sessions, attempts, bookmarks, mistakes, `daily_activity`, `streaks`, per-chapter stats, goals + triggers |
| 0011 | `user_uploads`, `doubts` (never auto-public) |
| 0012 | RLS on every table, revoke default grants, grant exactly what clients need |
| 0013 | Publication guard trigger |
| 0014 | Guard hardening (runs on insert and every update of a published row; deferred re-checks when solutions/options change; semantic numeric comparison of keys; attempt session must belong to same user; promote re-checks licence) |
| 0015 | `profiles.class_level` (11/12/dropper) and `practice_sessions.ui_mode` + `time_limit_sec` (added for the web integration) |
| 0016-0026 | Later migrations (helper search_path pin, shared rate limits, billing, analytics, AI-checked practice-only publishing, problem families, study plans, classification and rewards). See `DATABASE_SCHEMA.md` and the files in `supabase/migrations/`. 0026 is not yet applied to the live DB. |

### 6.3 Roles and RLS (row level security)

Supabase gives every request a database role: `anon` (not logged in), `authenticated` (logged in), and the privileged
service connection. The model (`0012_rls_and_grants.sql`):

- RLS is switched on for **every** public table, and default grants for `anon`/`authenticated` are revoked.
- `anon` can only read **active** taxonomy rows. That is all.
- `authenticated` gets owner-only access to their own rows: profile (update only a few columns), exam preferences,
  goals, bookmarks (insert only for published questions), mistakes (read, delete), and **read-only** on their own
  attempts, sessions, daily activity, streaks, chapter stats, uploads, doubts, roles.
- Questions, options, solutions, sources, pipeline, AI, verification and audit tables have **RLS on and no policies, no
  grants**: clients cannot touch them at all. Only the privileged service path can.

How the API uses this (`packages/db/src/postgres.ts`):

- `withUser(claims, fn)`: opens a transaction, sets `request.jwt.claims` for the user, runs `set local role authenticated`.
  Student reads/writes of their own data therefore run **under RLS**, as that user.
- `withService(fn)`: plain privileged connection, used for published content, grading, admin and role lookups.
  Roles are looked up here, never taken from the token.

The service-role *key* is never put on the API service; it connects with a database URL held in Secret Manager. (Which database user that
URL logs in as is a deployment setting; see "unverified" list.)

### 6.4 Triggers worth knowing

- **Publication guard** (`0013` + `0014`): a question can be `PUBLISHED` only if verification is `OFFICIAL_KEY_MATCHED`
  or `HUMAN_VERIFIED`, it has a current solution that belongs to it and is `APPROVED`, `answer_key` equals the
  solution's final answer, subject/chapter/difficulty exist, the answer-key type matches the question type, MCQs have
  at least 2 options and the key refers to real options, numerical ones have none. Otherwise the database raises
  `PUBLISH_REQUIREMENTS_NOT_MET`. If a published question becomes `DISPUTED`, it is automatically moved back to DRAFT.
- **Solutions are immutable** (`0006`): you add a new version rather than edit one.
- **`handle_new_user`** (`0009`): when Supabase Auth creates a user, a `profiles` row (timezone defaults to
  `Asia/Kolkata`) and a `streaks` row are created.
- **Attempts**: `attempts_before_insert` fills exam/subject/chapter from the question and computes the local
  `activity_date` in the user's timezone; attempts cannot be updated (`attempts_block_update`).
- **`attempts_after_insert`** keeps derived data in sync in the same transaction: daily activity counters, streak
  recompute (only on the first attempt of a new day), the mistakes list (wrong answer adds/increments, a later correct
  answer marks it resolved), per-chapter stats, and the practice session counters (auto-completes a session when all
  questions are attempted).
- **Streak logic** (`recompute_streak`): consecutive day -> +1; gap -> reset to 1; same day -> no change; backdated
  activity or a timezone change triggers a "gaps and islands" recomputation over all active days.
- **Doubts** can never be auto-public (`doubts_never_auto_public`).
- Slug changes create `slug_redirects` rows so old URLs 301/redirect.

### 6.5 The job queue (a table, not a service)

`pipeline_jobs` + functions in `app_private` implement a queue in plain Postgres, so no Redis/SQS is needed:

- `enqueue_pipeline_job`: idempotent via a unique `idempotency_key` (enqueue twice, get the same job).
- `claim_pipeline_job`: picks the next ready job with `FOR UPDATE SKIP LOCKED` (safe with many workers), sets a lease,
  increments attempts; a job past `max_attempts` becomes `DEAD`. Jobs whose lease expired are re-claimed.
- `heartbeat`, `complete`, `fail` (with retry/backoff), and an append-only `pipeline_job_events` log.
- Job kinds: `PROCESS_DOCUMENT`, `PARSE_ANSWER_KEY`, `AI_CLASSIFY`, `AI_SOLVE`, `AI_VERIFY`, `AI_SEO`.
- Statuses: `QUEUED -> RUNNING -> SUCCEEDED | DEAD | CANCELLED` (retry goes back to `QUEUED`).

---

## 7. Ingestion (`workers/`, Python package `pxw`)

Turns an approved source PDF into draft questions. Runs on an operator machine (CLI), never in an API request.

- **Libraries** (`workers/pyproject.toml`): PyMuPDF (PDF text and layout), RapidOCR + onnxruntime (default OCR),
  optional PaddleOCR and Tesseract extras, rapidfuzz (near-duplicate matching), Pillow, NumPy, Pydantic, psycopg 3
  (database), optional Google Cloud Storage extra, SymPy 1.14.0 (verification check). Python `>=3.11`.
- **CLI** (`pxw`): `ingest register`, `jobs run`, `process-document`, `parse-answer-key`, `ocr`, `promote`,
  `dev synth-pdf` (makes a synthetic test PDF).
- **Stages of `PROCESS_DOCUMENT`**: fetch original from the storage bucket (verify sha256) -> extract text with PyMuPDF (spans, bboxes)
  -> OCR only pages with little or garbled text -> segment into questions/options using a layout profile -> figures
  crop -> normalize (text, LaTeX-ish maths) -> dedupe (exact hash + fuzzy) -> write `source_questions` (staging) and
  private crops. Each stage writes a versioned artifact so a retry skips completed stages.
- **Warnings** (low OCR confidence, odd option counts, missing figure, needs maths review) block auto-promotion.
- **Licensing gate**: only sources with `reuse_permitted` and an approval timestamp can be ingested; enforced in the
  CLI and in the database promote function (re-checked in migration 0014). The NTA mirror source (`NTA_MIRROR`) was
  approved on 2026-11-18; see `CONTENT_SOURCES.md` and `DEPLOYMENT_GCP.md` for what has been imported.
- **Promote** (`promote_source_question`): creates a `DRAFT` question and enqueues `AI_CLASSIFY`.
- Two job-store backends: Postgres, or a JSON file for offline tests.

---

## 8. AI pipeline (`packages/ai`)

Batch only. A Node CLI (`npm run ai -- ...`) claims `AI_*` jobs, calls Gemini (or a mock), and writes results to the database.

```
AI_CLASSIFY -> (quality check) -> AI_SOLVE -> AI_VERIFY -> (if PASSED) AI_SEO
```

- **Client** (`@google/genai` 2.32.0): structured JSON output validated by zod, one automatic repair retry on bad
  schema, backoff on 429. A deterministic **mock** client exists and is the default: `AI_PROVIDER=mock`; with
  `AI_PROVIDER=gemini` but no key it falls back to mock with a warning.
- **Two model tiers**: FAST (classify, quality, SEO) and STRONG (solve, blind answer, critique). Model ids and prices in
  `.env.example` / `gemini/pricing.ts` are placeholders to re-verify.
- **Budget**: `AI_DAILY_BUDGET_USD` (default 1.00) and `AI_MAX_CALLS_PER_RUN` (200), checked before each call against
  `usage_counters`. Identical inputs are never billed twice (`input_hash` reuse).
- **Verification checks** (recorded in `verification_checks`): content completeness, classification confidence, official
  key match, **independent blind answer** (a separate AI call that never sees the official key or the solver's answer),
  **SymPy check**, AI critique. SymPy runs in Python via `python -m pxw.verification.sympy_check`; expressions are
  validated against a regex and an identifier allow-list before parsing, with a wall-clock timeout.
- **Verification states** (`verification_status`): `PENDING`, `AUTOMATED_CHECKS_PASSED`, `OFFICIAL_KEY_MATCHED`,
  `HUMAN_REVIEW_REQUIRED`, `HUMAN_VERIFIED`, `DISPUTED`. Decision rules are a pure, table-tested function
  (`verify/rules.ts`). The AI pipeline can reach at most `AUTOMATED_CHECKS_PASSED` or `OFFICIAL_KEY_MATCHED`. **Only a
  human approval produces `HUMAN_VERIFIED`**, and the AI pipeline never changes a `HUMAN_VERIFIED` question.
- **Human approval**: admin reviews the question and solution in the admin API, approves, then ADMIN publishes. The
  publication guard (6.4) makes this mandatory at database level.
- AI solutions are stored as new immutable `solution_versions` with provenance `AI_GENERATED`; human edits become new versions.

---

## 9. Files and storage (Google Cloud Storage)

Three buckets in the GCP project: `projectx-staging-a7k2-source-docs`, `-public-assets`, `-user-uploads` (`STORAGE_DRIVER=gcs`, bucket names in `GCS_BUCKET_*`). Setup: `DEPLOYMENT_GCP.md`, `PRODUCTION_SETUP.md`. Private by default; opening `public-assets` for approved images is a separate, deliberate step. The key patterns below are unchanged from the earlier R2 design.

| Bucket | Visibility | Contents | Key pattern (`edge/keys.ts`) |
|---|---|---|---|
| source-docs | private | Original PDFs and derived crops | `sources/{code}/{year}/{sha}.{ext}`, `derived/...` |
| public-assets | private until deliberately opened | Images referenced by published questions | `assets/{sha[0..2]}/{sha}.{ext}` (content-addressed, `immutable`, 1-year cache) |
| user-uploads | private | Doubt attachments (PNG/JPEG/WebP, max 5 MB) | `u/{userId}/{yyyy-mm}/{id}.{ext}` |

- Uploads are sniffed for real image type, size-capped, and served back only through short-lived HMAC-signed URLs
  (`/files/{token}`, max 15 minutes, `Content-Disposition: attachment`).
- The Python tools write to the buckets with `pxw --storage gcs` using Application Default Credentials.
- Local dev uses a filesystem driver (`STORAGE_DRIVER=local`) with the same key layout.

---

## 10. Hosting summary (Google Cloud)

Runbook and current state: `DEPLOYMENT_GCP.md`. The earlier plan (Cloudflare Workers, R2, WAF, OpenNext) was dropped.

| Piece | Status in repo |
|---|---|
| **API** | Cloud Run service `projectx-api` (asia-south1, project `projectx-staging-a7k2`), https://projectx-api-989800061583.asia-south1.run.app/api/v1; precompiled `dist/server.mjs` |
| **Web** | Cloud Run service `projectx-web`, Next.js 16 |
| **Domain / CDN** | https://tabbyprep.in through Firebase Hosting, which rewrites every path to Cloud Run; its CDN caches by `s-maxage` and is cleared by a new release (`infra/gcp/firebase-hosting.sh deploy`) |
| **Files** | Three Cloud Storage buckets (section 9) |
| **Secrets** | GCP Secret Manager |
| **Builds** | Cloud Build, running as the `projectx-build` service account |
| **Database / auth** | Supabase project in Mumbai (Postgres + Auth; email and Google sign-in on) |
| **Billing alert** | About USD 5 / INR 450 on the GCP project (alerts only) |
| **Cloudflare files in the repo** | `worker.ts`, `wrangler.toml`, `infra/cloudflare/`: legacy, not deployed |

The API opens its database connection through the Supabase transaction pooler (port 6543, `prepare: false` because
transaction mode does not support prepared statements). Secrets (`DATABASE_URL`, `signing-secret`, `ip-hash-secret`,
`web-revalidate-secret`) live in Secret Manager. Never on the API: the Gemini key and the Supabase service-role key.

---

## 11. Caching, end to end

Three layers, each with a purpose:

1. **Firebase Hosting CDN** in front of the web app, honouring Next's `s-maxage`; a new Hosting release clears it. The API
   is called directly on its run.app URL and sets the `Cache-Control` classes and tags above for its callers. (The Cloudflare
   modes `CACHE_MODE=workers` / `cache_api` remain in the code but are not used.)
2. **Next.js cache** in the web app (`"use cache"` + `cacheLife` + `cacheTag`). The tags are copied from the API's
   `X-Cache-Tags`.
3. **Browser** (`max-age` 60 s on content; nothing on private data).

Purge drivers (`CACHE_PURGE_DRIVER`: `noop | workers | zone_api | both`; the Cloudflare ones are legacy), composed by
`buildInvalidator` in `worker.ts`:

- `workers`: the runtime's `cache.purge({tags})` (feature-detected; throws if unavailable), chunks of 100, retries on rate limits.
- `zone_api`: Cloudflare zone purge `POST /zones/{id}/purge_cache {tags}`, chunks of 30, 3 attempts, needs a token scoped to Cache Purge only.
- **web webhook** (if `WEB_REVALIDATE_URL` and secret are set): POSTs the tags to the web app (section 12).

---

## 12. Request flows

### 12.1 A student opens a public question page

```
Browser            Web app (Next)                         API (Cloud Run)           DB
  | GET /jee/questions/<slug>/                                                       |
  |--------------->|                                                                 |
  |                | "use cache" hit?  -> yes: serve cached HTML/data immediately    |
  |                |                                                                 |
  |                | no / stale: getQuestionPage(slug)                               |
  |                |--- GET /api/v1/public/questions/<slug> (no Authorization) ----->|
  |                |        edge cache hit? -> yes: return cached JSON               |
  |                |                          no: rate limit RL_PUBLIC (300/min/IP)  |
  |                |                              withService: read question,        |
  |                |                              options, solution, paper, source ->|
  |                |<-- 200 {data}  Cache-Control: public, s-maxage=3600 ...         |
  |                |        Cache-Tag / X-Cache-Tags: q-<id>, qslug-..., ch-..., ... |
  |                | zod-validate, cacheTag(tags), render KaTeX, set noindex if      |
  |                | disputed / no solution                                          |
  |<---------------| HTML                                                            |
```

Unpublished or missing -> 404 (cached briefly). Renamed slug -> redirect response from the API; the page does a
permanent redirect to the new URL.

### 12.2 A student submits an attempt

```
Browser (signed in via Supabase)            API                                      DB
  | generate client_attempt_id (UUID)                                                 |
  | POST /api/v1/practice/attempts  Authorization: Bearer <JWT>  Idempotency-Key: <same id>
  |------------------------------->| CORS ok? -> JWT verified (JWKS) -> not anonymous?
  |                                 | RL_ATTEMPTS (60/min per user)
  |                                 | already have this client_attempt_id?
  |                                 |    same hash -> replay stored result (meta.replayed)
  |                                 |    other hash -> 409 IDEMPOTENCY_CONFLICT
  |                                 | validate question/response/session, grade on server
  |                                 | INSERT attempt ---------------------------------->|
  |                                 |                            triggers: daily_activity, streak,
  |                                 |                            mistakes, chapter stats, session counters
  |<--------------------------------| 201 { is_correct, score, correct answer, solution, session state }
```

If the request times out, the browser simply retries with the same id: it gets the original result, not a duplicate attempt.
Response is `private, no-store`.

### 12.3 A question goes from PDF to published

```
 1. Operator registers an APPROVED source + PDF       (pxw ingest register; licence gate)
 2. PROCESS_DOCUMENT job: PyMuPDF/OCR -> segment -> dedupe -> source_questions (staging) + crops in the storage bucket
 3. PARSE_ANSWER_KEY job (optional): official keys linked to questions
 4. Promote (admin API or pxw promote): source_question -> DRAFT question; enqueues AI_CLASSIFY
 5. AI worker:  CLASSIFY -> QUALITY -> SOLVE (new solution_version, AI_GENERATED)
                -> VERIFY (official key, blind answer, SymPy, critique)
                -> status = AUTOMATED_CHECKS_PASSED | OFFICIAL_KEY_MATCHED | HUMAN_REVIEW_REQUIRED | DISPUTED
                -> (if PASSED) SEO title/description
 6. Reviewer opens /admin/verification/queue, reads question + solution, edits if needed (new version)
 7. Reviewer approves  -> solution APPROVED, question HUMAN_VERIFIED
 8. ADMIN publishes    -> API checks requirements, copies images to PUBLIC_ASSETS, sets PUBLISHED
                          DB publication guard re-checks; fails with PUBLISH_REQUIREMENTS_NOT_MET if anything is off
 9. Cache purge + web revalidate (12.4); question appears in sitemap and public pages
```

Steps 1 to 5 are code-complete and tested with mocks and synthetic PDFs; no real exam papers have been processed and Gemini
has never been called live (section 17).

### 12.4 Publish -> cache purge -> page refresh

```
Admin           API (admin service)                     Edge cache (legacy)       Web app (Next)
  | POST /admin/questions/{id}/publish                                                  |
  |------------->| DB transaction: set PUBLISHED, review_event, audit_log               |
  |<-------------| 200 (response returns immediately)                                   |
  |              | ctx.waitUntil( purgeTags([q-id, qslug-..., ch-..., sub-..., exam-...,|
  |              |                           qlist, sitemap, search]) )                 |
  |              |--- workers cache.purge / zone purge ---->| drops tagged responses    |
  |              |--- POST /api/revalidate/  Bearer <secret>  {tags:[...]} ------------>|
  |              |                                          |      revalidateTag(tag, {expire:0})
  |              |                                          |      for each tag
Next visitor to the question page, chapter page or sitemap: cache miss -> fresh fetch from the API -> new content.
```

Failures in purging are logged but do not fail the publish (the `s-maxage` expiry is the safety net: 5 min lists,
1 h content, 24 h taxonomy). The web endpoint (`src/app/api/revalidate/route.ts`) is POST-only, compares the secret in
constant time, returns 404 if `REVALIDATE_SECRET` is not set, and accepts at most 200 tags of a restricted character set.
Taxonomy changes via migration/seed need a manual purge of tag `tax` (there is a CLI script, `cache:purge`, in `@projectx/edge`).

---

## 13. Testing approach

| Layer | Tool | What is tested | How |
|---|---|---|---|
| Database | **PGlite** (`@electric-sql/pglite` 0.5.13) + Vitest | Real Postgres in-process (WASM). Migrations apply on top of `supabase/shim/` which fakes `anon`, `authenticated`, `service_role`, `auth.users`. Suites in `supabase/tests/`: RLS (content and student), triggers (questions, attempts), publication guard + hardening, pipeline | No Docker, no network, runs in seconds |
| API | Vitest | Same routes against an in-memory store (`*.memory.test.ts`) and against real SQL on PGlite (`sql.integration.test.ts`); a web-integration test | `npm test -w @projectx/api` |
| Packages | Vitest | contracts, shared, edge, db, ai (mock Gemini, table-driven verification rules, e2e classify->solve->verify on PGlite) | `npm test` runs all workspaces |
| Ingestion | **pytest** + ruff | Synthetic PDFs generated in code (no real papers committed), mock OCR, file-backed job store; some tests need real Postgres and are skipped by default | `workers/tests` |
| Web app | Vitest | Pure logic: adapters, session store, bank/core fixtures, API client | `npm run test:web`; `typecheck:web` runs `next typegen && tsc` |

Last recorded runs (the old status doc, 2026-11-14, before the web integration commit; that doc has been removed): contracts 10, shared 36, edge 30,
db 246, ai 124, api 39 tests passing; Python 99 passed / 2 skipped; typecheck and ruff clean. I did **not** re-run
anything while writing this document, so treat those numbers as the last documented state. No CI configuration was found
in the repo **[unverified that none exists elsewhere]**.

---

## 14. Environments (dev / staging / prod)

| | Dev (your laptop) | Staging | Production |
|---|---|---|---|
| Web | `next dev`, mock or api mode | Separate build (public env vars are inlined at build time, so **one build per environment**) | Separate build |
| API | `npm run dev:api` (`node.ts`) | Cloud Run `projectx-api` | see `PRODUCTION_SETUP.md` |
| DB | PGlite (`DB_DRIVER=pglite`), or local Supabase stack via CLI (needs Docker) | Own Supabase project (must be separate) | Own Supabase project |
| Auth mode | `test` or `dev` tokens | `jwks` | `jwks` (`test` forbidden) |
| Storage | local filesystem | Cloud Storage buckets | Cloud Storage buckets |
| Rate limiter | memory | memory + Postgres | memory + Postgres |
| API docs | on | on (`ENABLE_API_DOCS=true`) | off |

Config files: `.env.example` (all variables, with comments); deploy settings are in `infra/gcp/*.sh` and `cloudbuild.*.yaml`. `SUPABASE_URL`, CORS origins, asset base URLs and zone id are
empty placeholders until real resources exist. Production refuses weak secrets (>= 32 chars required for signing/hash
secrets when `STORAGE_DRIVER` is r2/gcs or `APP_ENV` is staging/production, `config.ts`).

Migrations: see `docs/DEPLOY_FACTS.md` (Supabase CLI v3 syntax; `supabase db push` needs `--remote`) and `docs/DEPLOYMENT_GCP.md`. Do not apply `supabase/shim/` or `supabase/fixtures/` to a hosted project.

---

## 15. Security model

| Concern | How it is handled |
|---|---|
| Who can read/write data | RLS on every table; clients get no access to content tables; student tables are owner-only, mostly read-only; writes go through the API |
| Authentication | Supabase Auth; API verifies JWT signature, audience, issuer (JWKS); anonymous users are rejected for account features |
| Authorization (admin) | Roles in `user_roles`, looked up from the database on each privileged call (60 s per-isolate cache); not trusted from the token; first admin is inserted manually by SQL |
| Grading integrity | Correct answers and solutions are never sent before an attempt; grading is server-side |
| Publishing integrity | DB publication guard, immutable solutions, human approval required, audit log |
| Abuse | Per-class rate limits (user id or hashed IP); Cloud Armor only if abuse appears; upload size/type sniffing; doubts limited to 5/min and never auto-public |
| Secrets | GCP Secret Manager; the browser has only the Supabase publishable key; Gemini key stays on the operator machine |
| Webhooks | Revalidate endpoint requires a bearer secret (constant-time compare) and strict tag format |
| Private files | Short-lived HMAC-signed URLs, `attachment` disposition, `nosniff` |
| Browser hardening | CORS allow-list with no wildcard, no cookies/credentials; HSTS; `Referrer-Policy: no-referrer`; `poweredByHeader: false` |
| Privacy | IPs stored only as HMAC hashes; AI inputs are public exam content only, no personal data |
| Content licensing | `sources.reuse_permitted` + approval gate enforced in CLI and DB; NTA stays disallowed until cleared |
| Dev backdoors | `/api/dev/token` is 404 in production builds; `AUTH_MODE=test` forbidden in production |

Known gaps are listed in section 17.

---

## 16. Cost model and free-tier limits

Goal (`docs/COST_STRATEGY.md`): run at roughly zero cost until there is real traffic. Supabase figures below are the
**commonly published free-tier numbers recorded in that doc; I did not check vendor pages**, and they change.

| Resource | Free allowance (approx.) | What eats it | What the design does |
|---|---|---|---|
| Supabase DB | 500 MB; pauses after ~7 days idle | questions/solutions (~10-20 KB each), attempts | no blobs in DB, narrow rows |
| Supabase Auth | 50k monthly active users | students | n/a |
| Supabase egress | ~5 GB/month | cache misses | heavy edge caching |
| Cloud Run | has a free tier (check current limits) | API and web requests | scale to zero, `--cpu-boost`, no AI in requests |
| Firebase Hosting | has a free tier (check current limits) | web traffic | CDN caching by `s-maxage` |
| Cloud Storage | check current pricing | PDFs, crops, images | immutable content-addressed public assets |
| Billing alert | about USD 5 / INR 450 | overspend | alerts only; does not stop spending |
| Gemini | free tier is rate limited and may use prompts for training | AI batch | batch only, budget caps, public content only; move to a paid key before licensed content |
| Supabase default email | 2 messages/hour (per `DEPLOY_FACTS.md`) | signup confirmations | configure custom SMTP before launch |

Upgrade triggers (sustained 7 days): DB > 350 MB or need backups/PITR -> Supabase Pro (~$25/mo); sustained cold starts or
request volume -> minimum instances on Cloud Run or paid usage; Gemini limits -> paid key; growing buckets -> trim derived files.
Deliberately not paid for: Redis, Elasticsearch/vector DB (Postgres full-text + `pg_trgm` instead), message queues
(Postgres job table), always-on workers, image CDN, APM.

Budget controls on AI: $1/day default cap, 200 calls per run, cache by input hash, about 6 calls per question.

---

## 17. What is built vs stubbed / mock (be honest)

**Built and tested locally (PGlite, mocks, synthetic data):**
- Full schema (26 migrations in the repo; the live DB is at 0025), RLS, triggers, publication guard, job queue, streak/daily activity.
- The whole API surface with OpenAPI generation, including billing, analytics, study plans and admin classification endpoints.
- Web app against the API: public pages, auth screens, practice sessions, attempts, bookmarks, mistakes, progress, streak, onboarding.
- Cache tag/purge plumbing including the web revalidate webhook.
- Python ingestion on synthetic PDFs; AI pipeline on the mock Gemini client; SymPy checker.

**Live (2026-11-19; see `DEPLOYMENT_GCP.md` and `LAUNCH_READINESS.md`):**
- Web and API run on Cloud Run; the site is served at https://tabbyprep.in through Firebase Hosting; Supabase (Mumbai) is the database and auth.
- About 433 published questions and 7,357 draft PYQs (JEE Main 2019-2026, JEE Advanced, NEET) are imported. Indexing is still off until content is publishable.
- Razorpay one-time prepaid Plus passes are live (real payments) since 2026-11-19. AdSense placements are built but ads are not switched on in the web build (publisher account under review); rewarded ads via Google Ad Manager are off by default. See `MONETIZATION_HANDOVER.md`.

**Still unverified or open:**
- **Gemini** status: I did not verify whether a live key is in use; model ids and prices in the repo are placeholders to re-check.
- Migration 0026 is in the repo but not yet applied to the live database.
- The old Cloudflare-specific paths (Workers Caching purge, Hyperdrive, OpenNext) were never run and are no longer planned.
- The syllabus seed (20/20/14 chapters) needs checking against the current NTA bulletin.
- Known limitation: two source questions with byte-identical images share one `question_assets` row (needs a join table).

**Demo-only in API mode:**
- **Papers / full-length CBT tests** are fixture-backed in every mode. In API mode they are hidden unless
  `NEXT_PUBLIC_FEATURE_PAPERS=demo`; attempts there are local-only and flagged.
- **Leaderboard** is demo data; hidden in API mode unless `NEXT_PUBLIC_FEATURE_LEADERBOARD=demo` (`LEADERBOARD_ENABLED`).
- Some student state stays in the browser even in API mode: test-mode drafts, the review list and mistake categories.
- A small admin web UI exists at `/admin/questions/` (difficulty classification); other admin work is the admin API (including admin billing).
- The web app's product name "Tabby" is a working name.

---

## 18. "Where do I change X?"

| I want to... | Go to |
|---|---|
| Change site name / tagline / base URL | `src/lib/site.ts`, `NEXT_PUBLIC_SITE_URL` |
| Switch the whole app between fake and real data | `NEXT_PUBLIC_DATA_SOURCE` + `NEXT_PUBLIC_API_BASE_URL` (`.env`, rebuild) |
| Allow search engines to index | `NEXT_PUBLIC_ALLOW_INDEXING=true` (works only in API mode); per-page rules in `src/lib/indexing.ts`, `src/lib/seo.ts` |
| Change colours, fonts, theme | `src/app/globals.css`, `src/app/layout.tsx`, `src/components/theme/` |
| Add or change a public page | `src/app/(site)/...`; data from `src/lib/data/index.ts` |
| Change how long pages stay cached in Next | `cacheLife` constants in `src/lib/data/api.ts` |
| Change how long the API's responses are cached | `cachePolicies` in `packages/edge/src/cache.ts` |
| Add an API endpoint | zod schemas in `packages/contracts/src/`, route in `apps/api/src/routes/`, logic in `services/`, SQL in `repositories/sql/store.ts` (and the memory repo), then `npm run openapi` |
| Change an API response shape the UI sees | `packages/contracts` + `src/lib/api/schemas.ts` + adapters in `src/lib/api/adapters/` |
| Change rate limits | `rateLimitDefaults` in `packages/edge/src/rate-limit.ts` (and the legacy `[[ratelimits]]` blocks in `apps/api/wrangler.toml`) |
| Change who can do what | `access:` on each route; role logic in `apps/api/src/middleware/guards.ts` |
| Change grading / marking | `packages/shared/src/answers.ts` and `services/practice.ts` (`gradeAttempt`) |
| Change publish requirements | DB: a new migration replacing the guard function (never edit an old migration after it is applied); API: `publishUnmet` in `services/admin.ts` |
| Change the database schema | New file `supabase/migrations/0016_*.sql` (keep the numbering scheme), then regenerate types (`packages/db` `gen:types`) |
| Add exams / subjects / chapters / topics | `supabase/seed/*.sql` (then purge cache tag `tax`) |
| Change which tags a publish purges | `purgeTagsFor` in `apps/api/src/services/admin.ts`; tag names in `edge/src/cache.ts` |
| Change AI prompts / models / budget | `packages/ai/src/prompts/*.v1.ts` (bump version), `.env` (`GEMINI_MODEL_*`, `AI_DAILY_BUDGET_USD`), `gemini/pricing.ts` |
| Change verification rules | `packages/ai/src/verify/rules.ts` (rules version) |
| Change PDF parsing for a new paper layout | `workers/src/pxw/extraction/layout_profiles/` |
| Change OCR engines / confidence | `OCR_ENGINES`, `OCR_MIN_CONFIDENCE` in `.env`; `workers/src/pxw/ocr/` |
| Add a storage bucket or key pattern | `GCS_BUCKET_*` settings (`apps/api/src/config.ts`), `packages/edge/src/keys.ts`, `workers/src/pxw/storage/keys.py` (keep identical) |
| Change CORS | `CORS_ALLOWED_ORIGINS` on the API service (exact origins; set by `infra/gcp/deploy-api-staging.sh`) |
| Make the first admin | SQL insert into `user_roles` (see `docs/DEPLOY_FACTS.md` section 1.5) |
| Deploy | `docs/DEPLOYMENT_GCP.md` (runbook), `docs/PRODUCTION_SETUP.md` (every remote step needs your approval) |

---

## 19. Glossary

- **App Router**: Next.js routing where folders under `src/app` are URLs; route groups in parentheses do not appear in the URL.
- **Attempt**: one answer submission to one question; graded by the server.
- **Auth / JWT**: a signed token Supabase gives a signed-in user; the API checks its signature rather than asking Supabase every time.
- **`cacheComponents` / PPR**: Next.js feature that splits a page into a static shell plus cached or streamed parts.
- **`"use cache"` / `cacheTag`**: marks a function's result as cacheable, and labels it so it can be dropped by label later.
- **CBT**: computer-based test; the exam-style interface.
- **Cache-Control / `s-maxage`**: HTTP headers telling browsers (`max-age`) and shared caches (`s-maxage`) how long to keep a response.
- **Cache tag / purge**: a label on a cached response; purging a tag drops every response carrying it.
- **Contract**: the agreed, schema-defined shape of data between web and API (`packages/contracts`).
- **CORS**: browser rule about which websites may call the API; configured as an allow-list.
- **Draft / Published / Archived**: publication states of a question.
- **Envelope**: the standard `{ data }` / `{ error }` wrapper around API responses.
- **Hono**: a small web framework; the API runs it on Node in Cloud Run.
- **Idempotency**: sending the same request twice has the same effect as once; here via `client_attempt_id`.
- **Ingestion**: turning source PDFs into structured question rows.
- **Instance**: one running copy of a Cloud Run service; in-memory caches vanish when it stops (older code comments call this an isolate).
- **Migration**: a numbered SQL file that evolves the database schema.
- **OCR**: optical character recognition, reading text from images.
- **OpenAPI**: machine-readable API description generated from the zod schemas.
- **PGlite**: Postgres compiled to run inside Node, used for fast tests.
- **Publication guard**: database trigger refusing to publish an unverified or inconsistent question.
- **PYQ**: previous-year question.
- **GCS**: Google Cloud Storage, the object storage for the three buckets.
- **RLS (row level security)**: Postgres feature that filters which rows each database role can see or change.
- **Service role / service connection**: the privileged database access that bypasses RLS; server-side only.
- **Source (licensing)**: a record of where content came from and whether we may reuse it.
- **Supavisor**: Supabase's connection pooler (transaction mode on port 6543).
- **SymPy**: Python maths library used to check solution formulas symbolically/numerically.
- **Tag (cache)**: see Cache tag.
- **Verification status**: how trustworthy a question's answer/solution is (section 8); `HUMAN_VERIFIED` requires a person.
- **Worker (Cloudflare)**: legacy deployment target, not used. Not to be confused with the Python `workers/` folder (the ingestion tools).
- **zod**: TypeScript schema library for validating data at runtime.

---

## 20. Facts I could not verify

- That `RL_ADMIN` is attached to every admin route (class exists; routes not individually traced).
- Which database user the production `DATABASE_URL` will log in as, and whether `set local role` + `request.jwt.claims` behave through Supavisor (was listed as untested).
- Whether a new hosted Supabase project signs JWTs with asymmetric keys by default (`DEPLOYMENT_GCP.md` says the current project does, so `AUTH_MODE=jwks`).
- Current vendor free-tier numbers in section 16 (Supabase figures copied from `docs/COST_STRATEGY.md` and `DEPLOY_FACTS.md`, not re-checked).
- The current test pass counts (quoted from the removed status doc; nothing was executed for this document).
- Whether any CI pipeline exists outside the repo; none is in the repo.
- Web-app behaviour at runtime (this document is from reading code and config; I did not run the app).

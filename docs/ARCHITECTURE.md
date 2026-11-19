# ProjectX Backend — Architecture (Owner B)

Status: binding for Milestone 1+. Source of requirements: `docs/BRIEF.md`. If any doc conflicts, precedence is
`DATABASE_SCHEMA.md` (names/types) > `API_CONTRACTS.md` (wire shapes) > this file > others.

## 1. System shape

```
 Browser ──HTTPS──▶ https://tabbyprep.in ──▶ Firebase Hosting (CDN; rewrites every path)
                                               └──▶ Cloud Run "projectx-web" (Next.js, asia-south1)
        │
        └──HTTPS (CORS, Bearer token)──▶ Cloud Run "projectx-api" (Hono, apps/api, dist/server.mjs)
                                          .../api/v1/*  (run.app URL, no api. subdomain)
                                             ├─▶ Supabase Postgres (Mumbai, txn pooler :6543)
                                             └─▶ Cloud Storage buckets (source-docs, public-assets, user-uploads)

 Cloud Run Job / operator machine (never in request path):
   packages/ai CLI (Node)  ── claims AI_* jobs ──▶ Postgres;  calls Gemini (server-side key); SymPy via Python
   workers/ pxw CLI (Python) ── claims PROCESS_DOCUMENT/PARSE_ANSWER_KEY jobs ──▶ Postgres; Cloud Storage
```
Deploy steps and current URLs: `DEPLOYMENT_GCP.md`. The Cloudflare Worker entry (`apps/api/src/worker.ts`, `wrangler.toml`) is still in the repo but is not deployed.

* **One API deployable** (the Cloud Run service `projectx-api`), plus the web app. No microservices, no always-on workers, no Redis/ES/vector DB.
* **Job queue = Postgres table** `pipeline_jobs` claimed with `FOR UPDATE SKIP LOCKED`. AI and ingestion
  workers are CLIs run locally/on demand (later: optional cron). Never OCR or LLM calls inside API requests.
* **Supabase** = Postgres + Auth (JWT issuer) + migrations. We do **not** use PostgREST/supabase-js for data;
  Owner A uses supabase-js **only for auth**. RLS still guards every private table (anon key is public).

## 2. Repo layout and ownership

```
package.json              npm workspaces ["apps/*","packages/*"]; no build step (TS source exports)
tsconfig.base.json        strict, ES2022, module ESNext, moduleResolution Bundler, noUncheckedIndexedAccess
.env.example  README.md
apps/api/                 @projectx/api   Hono app, routes, middleware, services, repositories; worker.ts + node.ts
  wrangler.toml           legacy Cloudflare Worker config (not deployed)
packages/contracts/       @projectx/contracts  Zod schemas: enums, domain (ContentBlock, AnswerKey...), DTOs, errors
  openapi/openapi.json    generated from apps/api routes (committed)
packages/shared/          @projectx/shared  pure logic: grading, decimal compare, slugify, cursor codec, Result
packages/db/              @projectx/db  SQL executor abstraction (+ /postgres, /pglite, /testing entrypoints), migrator
packages/database-types/  @projectx/database-types  generated TS types of the schema (Supabase-compatible shape)
packages/ai/              @projectx/ai  Gemini client + mock, prompts, modules, verification engine, CLI
packages/edge/           @projectx/edge  storage adapters (local, gcs, r2), signed URLs, cache policy/tags/invalidation, rate limiter
supabase/                 config.toml, migrations/NNNN_*.sql, seed/*.sql, fixtures/ (dev-only), shim/, tests/
workers/                  Python project "pxw" (pyproject.toml, src/pxw/..., tests/)
infra/gcp/               deploy scripts for Cloud Run, Firebase Hosting, ingest job (see DEPLOYMENT_GCP.md)
infra/cloudflare/        legacy R2/WAF/cache notes (not used)
docs/
```

Every TS package: `"type":"module"`, `exports` point at `./src/*.ts` (consumed as source by vitest/tsx/wrangler's
esbuild), scripts `typecheck` (`tsc --noEmit -p .`) and `test` (`vitest run`).

## 3. Tech decisions (versions pinned exactly; all ≥2 weeks old at 2026‑11‑14)

| Concern | Choice | Version | Rationale |
|---|---|---|---|
| Runtime | Node 22.18 (API on Cloud Run, dev, CLIs) | — | the Worker entry still exists but is not deployed |
| Language | TypeScript | 5.9.3 | TS 7 (native) is newer; 5.9 is safest for zod-openapi type inference + tooling |
| HTTP | hono | 4.13.14 | |
| OpenAPI | @hono/zod-openapi | 1.6.3 | peer `zod ^4`, `hono >=4.10`; `OpenAPIHono`, `createRoute`, `app.doc31`, `defaultHook`, `openAPIRegistry.registerComponent('securitySchemes',…)`; import `z` from `@hono/zod-openapi` in route files |
| Schemas | zod | 4.6.7 | `z.toJSONSchema()` feeds Gemini `responseJsonSchema` and Python JSON Schema |
| Node server | @hono/node-server | 2.1.5 | local dev |
| Docs UI | @hono/swagger-ui | 0.6.2 | non-prod only (`ENABLE_API_DOCS`) |
| Postgres driver | postgres (postgres.js) | 3.4.9 | works in Workers (TCP sockets) and Node; use `prepare:false` (Supavisor txn mode). v4 is <3 weeks old |
| Embedded PG | @electric-sql/pglite | 0.5.13 | PG 18 in WASM, in-process; verified: roles, `SET LOCAL ROLE`, RLS, column grants, plpgsql triggers, FTS `english`, `websearch_to_tsquery`, pg_trgm (contrib) |
| PG wire server | @electric-sql/pglite-socket | 0.2.16 (peer of pglite 0.5.13) | `pglite-server` → local Postgres URL; verified with postgres.js and psycopg 3 |
| Tests | vitest | 4.1.12 | |
| Script runner | tsx | 4.23.15 | |
| JWT | jose | 6.2.14 | `createRemoteJWKSet(${SUPABASE_URL}/auth/v1/.well-known/jwks.json)` + `jwtVerify`; HS256 fallback |
| Gemini | @google/genai | 2.32.0 | `ai.models.generateContent({model, contents, config:{responseMimeType:'application/json', responseJsonSchema}})` (field verified in typings) |
| Workers tooling | wrangler 4.156.0, @cloudflare/workers-types 5.20261030.1 | | ratelimit binding needs ≥4.36 |
| Node types | @types/node 26.6.6 | | |
| Python | 3.13; pymupdf, rapidocr(+onnxruntime) default OCR, paddleocr optional extra, sympy 1.14.0, pydantic 2, psycopg[binary] 3, boto3, rapidfuzz, pytest, ruff | ranges in `workers/pyproject.toml` | rapidocr is pip-only & Windows friendly; Paddle optional |

**Postgres feature floor:** SQL must run on Supabase PG 15+ *and* PGlite PG 18 → use only PG ≤15 features
(no `uuidv7()`, no virtual generated columns, no `MERGE … RETURNING`, no `JSON_TABLE`). UUIDs via core
`gen_random_uuid()` (no pgcrypto). Extension used: `pg_trgm` (schema `extensions`).

## 4. Data access layer (`@projectx/db`, owned by W1)

```ts
export type JwtClaims = { sub: string; role: 'authenticated'; email?: string; is_anonymous?: boolean; [k: string]: unknown };
export interface SqlTx { query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number }>; }
export interface Db {
  withService<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T>;            // 1 txn, connection role (owner/postgres) → bypasses RLS
  withUser<T>(claims: JwtClaims, fn: (tx: SqlTx) => Promise<T>): Promise<T>; // 1 txn: set_config('request.jwt.claims',json,true); SET LOCAL ROLE authenticated
  withAnon<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T>;               // 1 txn: claims {"role":"anon"}; SET LOCAL ROLE anon
  close(): Promise<void>;
}
// entrypoints: '@projectx/db' (types + migrate), '@projectx/db/postgres' (createPostgresDb), '@projectx/db/pglite'
// (createPgliteDb), '@projectx/db/testing' (createTestDb, createTestUser, claimsFor). The Worker imports only the first two.
```
Rules: placeholders `$1..$n`; JSON params passed as `JSON.stringify(x)` with `$n::jsonb`; repositories select
`date` columns as `::text` ('YYYY-MM-DD') and `numeric` as `::text` (decimal strings) or `::float8` explicitly;
`timestamptz` arrives as `Date` in both drivers. The PGlite executor wraps **every** unit in `db.transaction()`
(PGlite is single-session; this serialises work and guarantees `SET LOCAL` never leaks). Postgres executor in the
Worker is created per request and ended in `ctx.waitUntil(sql.end())`.

**Request → DB role mapping (API):**
* Public/taxonomy reads, grading lookups, admin, pipeline: `withService` + explicit `publication_status='PUBLISHED'` filters in public queries.
* Student reads and student-editable writes (bookmarks, prefs, profile, goals): `withUser` → RLS enforced.
* Server-computed student writes (attempts, sessions, doubts, uploads): `withService`, `user_id` taken **only** from the verified JWT.
  `authenticated` has no INSERT on these tables, so a user calling PostgREST directly cannot forge `is_correct`.

## 5. Local development and offline tests (Windows, no Docker)

* **Tests (default, offline):** vitest boots an in-process PGlite per test file: `supabase/shim/00_supabase_shim.sql`
  (roles `anon`/`authenticated`/`service_role`, schemas `auth`/`extensions`, `auth.users`, `auth.uid()`,
  `auth.jwt()`, `auth.role()`, Supabase-like default privileges) → all `supabase/migrations/*.sql` in order →
  `supabase/seed/*.sql` → optional `supabase/fixtures/*.sql`. A template is built once per run and cloned with
  `dumpDataDir()`/`loadDataDir` for speed (verified on 0.5.13). Every PGlite instance must be `close()`d in `afterAll`, or the
  Node process does not exit. The shim is **never** applied to real Supabase.
* **RLS testing:** tests switch persona via `db.withUser(claimsFor(userA))` / `withAnon` (real `SET LOCAL ROLE`
  + `request.jwt.claims`, exactly what Supabase PostgREST does) and assert allow/deny and row visibility; a
  superuser read confirms data exists so "0 rows" isn't a false pass. Permission errors are asserted by SQLSTATE
  (`42501` permission denied / RLS violation).
* **Local shared DB:** `npm run db:serve` (W1) → `pglite-server` on `127.0.0.1:54322`, data dir `.local/pglite`,
  migrations+seed+dev fixtures applied. `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres`.
  It is **single-connection** (`--max-connections=1`): clients must use pool size 1 and processes run one at a
  time (API dev server *or* a CLI). For concurrent local use, point `DATABASE_URL` at any real Postgres 15+
  (native install, Docker, or `supabase start`) — same migrations; shim not needed there except for non-Supabase PG.
* **API dev:** `npm run dev -w @projectx/api` → Node server on :8787 with `DB_DRIVER=pglite` (in-process, own data
  dir, auto-migrate+seed+fixtures) or `DB_DRIVER=postgres`. `AUTH_MODE=test` accepts HS256 tokens signed with
  `TEST_JWT_SECRET`; `npm run token -w @projectx/api -- --user <uuid> [--admin]` prints one. Storage = local FS,
  cache purge = noop, rate limit = memory, AI not involved.
* **Legacy Worker runtime check (not the deployed path):** `npx wrangler dev -c apps/api/wrangler.toml` with `DB_DRIVER=postgres` against
  the pglite-server URL; `wrangler deploy --dry-run` in CI-like acceptance (no account needed).
* **Optional real-Supabase check (when Docker/CLI available):** `supabase start && supabase db reset` applies the
  same migrations + seed; `npm run test:rls -w @projectx/db -- --url $DATABASE_URL` reruns the RLS suite against it.

## 6. Auth & authorization

* Supabase Auth issues access tokens. API verifies: `AUTH_MODE=jwks` (asymmetric signing keys via JWKS, cached by
  jose), `hs256` (legacy `SUPABASE_JWT_SECRET`), `test`. Checks: signature, `exp`, `iss = SUPABASE_JWT_ISSUER`,
  `aud = 'authenticated'`, `role = 'authenticated'`. Anonymous Supabase users (`is_anonymous=true`) are treated as
  guests for writes that need an account (attempts/bookmarks/sessions) → 403 `ACCOUNT_REQUIRED`.
* Admin/reviewer: `user_roles` table lookup per request (service), cached per isolate ≤60 s. Roles: `ADMIN`
  (everything), `REVIEWER` (verification + approve/reject, not publish/indexability/sources). Never trust JWT
  custom claims for roles. Optional Cloudflare Access on `/api/v1/admin/*` as an extra layer (documented, not required).

## 7. Security / RLS strategy (summary; exact policies in DATABASE_SCHEMA.md §RLS)

1. RLS **enabled on every table in `public`**, including content. Content/provenance/pipeline/audit tables have
   **no policies and all privileges revoked** from `anon`,`authenticated` (Supabase grants them by default — the
   migration explicitly revokes; a test asserts it). Taxonomy: `SELECT` to anon/authenticated where `is_active`.
2. Student tables: owner-only `SELECT`; INSERT/UPDATE/DELETE granted only where the user legitimately edits
   (bookmarks, exam prefs, goals, limited profile columns via column-level `GRANT UPDATE(...)`, mistake dismissal).
3. Internal functions live in schema `app_private` (not exposed by PostgREST), `SECURITY DEFINER` with
   `SET search_path = ''`, EXECUTE revoked from `public`; only `app_private.is_published_question(uuid)` is granted
   to `authenticated` (used in a policy).
4. Service-role key / DB URL / Gemini key / signing secrets are server-only secrets, held in GCP Secret Manager; the API service gets only
   what it needs (`DATABASE_URL`, `IP_HASH_SECRET`, `SIGNING_SECRET`, web revalidate secret). The Gemini key lives only on the operator machine.
5. Public DTOs are built by explicit allow-list mappers in `apps/api`; contract tests assert practice DTOs never
   contain `answer_key|correct|is_correct|solution|final_answer|explanation` keys before submission.
6. Uploads: single-step `POST /uploads` through the Worker: size cap 5 MiB, MIME allow-list (png/jpeg/webp), magic
   byte sniff, random key under `u/{user_id}/…`, private bucket; read via HMAC-signed, expiring URL (≤15 min).
   SVG is never accepted anywhere.
7. Rate limiting via Workers Rate Limiting bindings (per route class, keyed by user id or hashed IP) + 1 WAF rule
   as backstop. CORS allow-list from env; no cookies (Bearer only) → `Access-Control-Allow-Credentials` not set.
8. Security headers on API: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
   `Strict-Transport-Security`. Audit log for every admin mutation (`audit_log`) + `review_events` for editorial decisions.
9. Backups: a Supabase plan setting (daily backups on Pro).

## 8. Owner A / Owner B integration agreement

* Owner A consumes **only** the API at `https://projectx-api-989800061583.asia-south1.run.app/api/v1` (no `api.` subdomain; OpenAPI 3.1 at `/api/v1/openapi.json`) and may import
  `@projectx/contracts` for types/Zod. No direct PostgREST data access; supabase-js only for auth session; send
  `Authorization: Bearer <access_token>` on user routes.
* SSR of public pages calls public endpoints **without** Authorization (so they are edge-cacheable); per-user
  overlays (bookmarked/attempted) are fetched client-side from `/users/me/*`.
* SEO: Owner A must render `seo.robots`, `seo.title`, `seo.description`, `canonical_path` from the DTO; handle
  `301 MOVED_PERMANENTLY` (body gives new `canonical_path`) as an HTTP 301; build sitemaps only from
  `GET /public/sitemap/questions` (which already excludes non-indexable / non-opted-in questions).
* Canonical paths (fixed): exam `/{exam.slug}`, subject `/{exam.slug}/{subject.segment}`, chapter
  `/{exam.slug}/{subject.segment}/{chapter.segment}`, topic `…/{topic.segment}`, question `/questions/{question.slug}`.
* Cache coherence: public responses carry `X-Cache-Tags` (copy of `Cache-Tag`). Owner A's web app copies them into
  its Next cache tags, and the API's revalidate webhook drops those pages; Firebase Hosting's CDN is cleared by a new Hosting release.
* Math is LaTeX inside ContentBlocks (`$…$` inline, `math` blocks display) — Owner A renders (e.g. KaTeX). Asset URLs are absolute.
* Contract changes: additive-only within v1; `packages/contracts/CHANGELOG.md` + semver bump; breaking → `/api/v2`.
* Mock server for Owner A: `npm run dev -w @projectx/api` with dev fixtures (clearly fake `demo-` questions,
  origin `EDITORIAL`, never PYQs, never loaded in production).

## 9. Environment variables (canonical list — `.env.example` must contain all; W5 owns the file)

| Var | Used by | Notes |
|---|---|---|
| `APP_ENV` | all | `development`/`test`/`staging`/`production` |
| `LOG_LEVEL` | all | `debug`/`info`/`warn`/`error` |
| `DB_DRIVER` | api, ai | `pglite` \| `postgres` |
| `DATABASE_URL` | api, ai, pxw | secret; Supavisor txn pooler `:6543` in prod |
| `DB_POOL_MAX` | api(node), ai | default 5 (1 with pglite-server) |
| `PGLITE_DATA_DIR` | api, db | default `.local/pglite` (`memory://` allowed) |
| `SUPABASE_URL` | api | JWKS + issuer base |
| `SUPABASE_JWT_ISSUER` | api | default `${SUPABASE_URL}/auth/v1` |
| `AUTH_MODE` | api | `jwks` \| `hs256` \| `test` (`test` forbidden when `APP_ENV=production`) |
| `SUPABASE_JWT_SECRET` | api | secret, only for `hs256` |
| `TEST_JWT_SECRET` | api | dev/test only |
| `CORS_ALLOWED_ORIGINS` | api | comma list |
| `ENABLE_API_DOCS` | api | `true` in dev |
| `PUBLIC_ASSETS_BASE_URL` | api | base URL of the public-assets bucket; dev `http://localhost:8787/__local/public` |
| `FILES_BASE_URL` | api | base for signed private URLs, e.g. `<API URL>/api/v1/files` |
| `STORAGE_DRIVER` | api, pxw | `local` \| `gcs` (`r2` is a legacy option) |
| `LOCAL_STORAGE_DIR` | api, pxw, ai | default `.local/storage` |
| `SIGNING_SECRET` | api | secret, HMAC for signed file URLs |
| `IP_HASH_SECRET` | api | secret, HMAC for ip hashing |
| `GCS_BUCKET_SOURCE_DOCS`, `GCS_BUCKET_PUBLIC_ASSETS`, `GCS_BUCKET_USER_UPLOADS` | api, pxw | required when `STORAGE_DRIVER=gcs`; auth via Application Default Credentials |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | pxw, ops scripts | legacy R2 option, not used |
| `R2_BUCKET_SOURCE_DOCS`, `R2_BUCKET_PUBLIC_ASSETS`, `R2_BUCKET_USER_UPLOADS` | pxw, wrangler | `projectx-source-docs`, `projectx-public-assets`, `projectx-user-uploads` |
| `CACHE_PURGE_DRIVER` | api | `noop` \| `workers` \| `zone_api` \| `both` |
| `CACHE_MODE` | api | `workers` (Workers Caching via wrangler `[cache]`) \| `cache_api` (API mounts `edgeCacheMiddleware`) \| `none` (dev) |
| `CF_ZONE_ID`, `CF_API_TOKEN_PURGE` | api | token scoped to Cache Purge only |
| `WEB_REVALIDATE_URL`, `WEB_REVALIDATE_SECRET` | api | optional; web `POST /api/revalidate/` URL and shared bearer secret (>= 32 chars, secret). When both are set the API calls it with `{"tags":[...]}` on every cache purge |
| `RATE_LIMIT_DRIVER` | api | `memory` \| `cloudflare` \| `noop` |
| `AI_PROVIDER` | ai | `mock` \| `gemini` (auto-`mock` + warning if no key) |
| `GEMINI_API_KEY` | ai | secret |
| `GEMINI_MODEL_FAST`, `GEMINI_MODEL_STRONG` | ai | defaults `gemini-3.5-flash-lite`, `gemini-3.8-flash` (re-verify ids at deploy) |
| `AI_DAILY_BUDGET_USD`, `AI_MAX_CALLS_PER_RUN` | ai | hard caps, default `1.00`, `200` |
| `PYTHON_BIN`, `SYMPY_TIMEOUT_MS` | ai | default `python`, `5000` |
| `PXW_WORK_DIR`, `PXW_JOB_STORE`, `OCR_ENGINES`, `OCR_MIN_CONFIDENCE` | pxw | `.local/work`, `file`\|`postgres`, `rapidocr,paddle,tesseract`, `0.6` |

Legacy Cloudflare Worker bindings (wrangler, not deployed): R2 `SOURCE_DOCS`, `PUBLIC_ASSETS`, `USER_UPLOADS`; ratelimits `RL_PUBLIC`,
`RL_SEARCH`, `RL_WRITE`, `RL_ATTEMPTS`, `RL_DOUBTS`, `RL_ADMIN`; optional `HYPERDRIVE`.

## 10. Cross-package interfaces (stable names)

* `@projectx/edge` exports (also `createGcsStorage`): `ObjectStorage` (`put/get/head/delete/copy`), `createR2Storage(binding)`,
  `createLocalStorage(dir)`, `createMemoryStorage()`, `BucketName = 'SOURCE_DOCS'|'PUBLIC_ASSETS'|'USER_UPLOADS'`,
  `StorageSet = Record<BucketName, ObjectStorage>`, `signFileUrl/verifyFileUrl`, `CachePolicy` + `cachePolicies`
  (route class → headers), `cacheTags` builders, `CacheInvalidator` (`purgeTags(tags)`), `createWorkersCacheInvalidator`,
  `createZoneApiInvalidator`, `createCompositeInvalidator`, `createNoopInvalidator`, `createRecordingInvalidator`,
  `RateLimiter` (`limit(key, cls) → {success}`), `createCloudflareRateLimiter(env)`, `createMemoryRateLimiter(cfg)`,
  `edgeCacheMiddleware` (Cache API fallback), `sniffImageMime(bytes)`. Exact signatures in the source.
* `@projectx/shared` (W2): `gradeAttempt`, `compareDecimal`, `answerKeysEqual`, `slugify`, `encodeCursor/decodeCursor`, `sha256Hex`, `canonicalJson`.
* `@projectx/contracts` (W2): everything in API_CONTRACTS.md §2–§3 plus `IngestionBundle`/`NormalizedQuestion` (INGESTION_PIPELINE.md) and JSON Schemas emitted to `packages/contracts/json-schema/*.json`.
* `@projectx/ai` (W3): `GeminiClient`, `createGeminiClient`, `createMockGeminiClient`, `SympyChecker`, pipeline runner (AI_PIPELINE.md).
* DB functions callable by workers: `app_private.enqueue_pipeline_job`, `claim_pipeline_job`, `heartbeat_pipeline_job`,
  `complete_pipeline_job`, `fail_pipeline_job`, `promote_source_question`, `link_official_answer_keys`, `find_near_duplicates`.

## 11. Cost strategy (summary — details COST_STRATEGY.md)

Cache all public GETs (Next tags in the web app, Firebase Hosting CDN by `s-maxage`) so the DB sees mostly misses; no AI in the
request path; AI runs are batch, cached by input hash, capped by daily budget; cheap model first, strong model
only for solve/critique; PDFs/crops in Cloud Storage; DB keeps parsed outputs only; Free tiers first with
documented upgrade triggers (Supabase DB > 350 MB or project-pause pain, sustained Cloud Run cold starts or Supabase free-tier limits, Gemini free-tier limits).

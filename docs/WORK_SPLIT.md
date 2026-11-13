# ProjectX — Work Split for Parallel Workers (binding)

Read first: BRIEF → ARCHITECTURE → DATABASE_SCHEMA → API_CONTRACTS → (your area doc). Names (tables, columns, enums, env vars, bindings,
package names, function names, error codes, cache tags) are fixed by those docs; do not rename. If a doc is wrong or ambiguous, **stop and
report to the lead** instead of inventing a variant.

## 0. Rules for every worker
1. **Ownership is exclusive.** Only create/edit files under your owned paths (below). Never edit another worker's files, root files, or `docs/`
   (except files explicitly assigned). Need a change elsewhere → message the lead.
2. **Dependencies are frozen** after W0. Do not run `npm install <pkg>`/`pip install <pkg>` that changes `package.json`, `package-lock.json` or
   `pyproject.toml`. Need a dependency → ask the lead (who installs once). `npm install` with no args (to sync) is allowed.
3. Consume other packages only through their public entrypoints (`@projectx/x`, `@projectx/db/testing`, etc.). Until a dependency lands, code
   against the documented interface; do not create local stand-ins inside others' paths.
4. No network calls in tests. No real credentials. No real PYQs/answer keys/sources in fixtures (synthetic, labelled). No deploys/remote changes.
5. TS: strict, ESM, no `any` without a `// reason:` comment, no default exports except Worker entry. Python: type hints, ruff clean.
6. Report **actual** command output for your acceptance checklist when done.

## 1. W0 — Bootstrap (lead/orchestrator, sequential, before W1–W5 start; ~15 min)
Create exactly these files, run `git init`, `npm install`, create the Python venv, then hand off. W0 owns root files permanently:
`package.json`, `package-lock.json`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `.nvmrc` (`22.18.0`), and the initial (stub) `package.json` +
`tsconfig.json` of every workspace, and `workers/pyproject.toml` (ownership of these package-level files then passes to the package owner, who may
edit **scripts only**).

Root `package.json`:
```json
{ "name": "projectx", "private": true, "type": "module", "workspaces": ["apps/*", "packages/*"], "engines": { "node": ">=22.18 <23" },
  "scripts": { "typecheck": "npm run typecheck --workspaces --if-present", "test": "npm run test --workspaces --if-present",
    "db:serve": "npm run serve -w @projectx/db", "db:migrate": "npm run migrate -w @projectx/db", "dev:api": "npm run dev -w @projectx/api",
    "openapi": "npm run openapi:generate -w @projectx/api", "ai": "npm run ai -w @projectx/ai --" },
  "devDependencies": { "typescript": "5.9.3", "vitest": "4.1.12", "tsx": "4.23.15", "@types/node": "26.6.6" } }
```
`tsconfig.base.json`: `{"compilerOptions":{"target":"ES2022","lib":["ES2023"],"module":"ESNext","moduleResolution":"Bundler","strict":true,
"noUncheckedIndexedAccess":true,"noImplicitOverride":true,"noFallthroughCasesInSwitch":true,"isolatedModules":true,"verbatimModuleSyntax":true,
"skipLibCheck":true,"resolveJsonModule":true,"noEmit":true,"types":["node"]}}`.
`.gitignore`: `node_modules/ .local/ dist/ .wrangler/ .dev.vars .env workers/.venv/ __pycache__/ .pytest_cache/ .ruff_cache/ *.log coverage/`.

Workspace `package.json` stubs (all `"type":"module"`, `"private":true`, `"exports"` → `./src/index.ts` plus listed subpaths, scripts
`"typecheck":"tsc --noEmit -p ."`, `"test":"vitest run"` unless noted). Workspace deps use `"*"`.

| Package (dir) | dependencies (exact) | extra exports / scripts |
|---|---|---|
| `@projectx/contracts` (packages/contracts) | `zod 4.6.7`, `@hono/zod-openapi 1.6.3` | `"json-schema:generate":"tsx scripts/generate-json-schema.ts"` |
| `@projectx/shared` (packages/shared) | — | — |
| `@projectx/database-types` (packages/database-types) | — | — |
| `@projectx/db` (packages/db) | `postgres 3.4.9`, `@electric-sql/pglite 0.5.13`, `@electric-sql/pglite-socket 0.2.16` | exports `./postgres`, `./pglite`, `./testing`; `"serve":"tsx src/cli/serve.ts"`, `"migrate":"tsx src/cli/migrate.ts"`, `"gen:types":"tsx src/cli/gen-types.ts"` |
| `@projectx/edge` (packages/edge) | `hono 4.13.14`; dev `@cloudflare/workers-types 5.20261030.1` | exports `./node`; `"cache:purge":"tsx src/cli/purge.ts"` |
| `@projectx/ai` (packages/ai) | `@google/genai 2.32.0`, `zod 4.6.7`, `@projectx/contracts`, `@projectx/shared`, `@projectx/db` | `"ai":"tsx src/cli.ts"` |
| `@projectx/api` (apps/api) | `hono 4.13.14`, `@hono/zod-openapi 1.6.3`, `zod 4.6.7`, `@hono/node-server 2.1.5`, `@hono/swagger-ui 0.6.2`, `jose 6.2.14`, `@projectx/contracts`, `@projectx/shared`, `@projectx/db`, `@projectx/edge`, `@projectx/database-types`; dev `wrangler 4.156.0`, `@cloudflare/workers-types 5.20261030.1` | `"dev":"tsx watch src/node.ts"`, `"openapi:generate":"tsx scripts/generate-openapi.ts"`, `"token":"tsx scripts/dev-token.ts"`, `"deploy:dry":"wrangler deploy --dry-run --outdir dist -c wrangler.toml"` |

`workers/pyproject.toml`: per INGESTION_PIPELINE §1 (setuptools, `src` layout, package `pxw` incl. `pxw.verification`, script `pxw = "pxw.cli:main"`,
pytest `testpaths=["tests"]`, ruff line-length 120). Also create empty `workers/src/pxw/__init__.py` and `workers/src/pxw/verification/__init__.py`.
Then: `python -m venv workers/.venv; workers\.venv\Scripts\python -m pip install -e "workers[dev]"` (paddle/tesseract extras **not** installed).

## 2. Packages, ownership, deliverables, acceptance

### W1 — Database (Supabase SQL, DB access layer, DB tests, types)
**Owns:** `supabase/**` (config.toml, migrations, seed, fixtures, shim, tests), `packages/db/**`, `packages/database-types/**`.
**Deliver:**
* Migrations 0001–0013 exactly per DATABASE_SCHEMA (tables, enums, constraints, indexes, triggers, functions, RLS, grants); seeds 0001–0005;
  dev fixture; shim; `config.toml` (`[db.seed] sql_paths=["./seed/*.sql"]`).
* `@projectx/db`: `Db`, `SqlTx`, `JwtClaims` (ARCHITECTURE §4); `createPostgresDb({ url, max?, prepare:false })` (`/postgres`); `createPgliteDb({ dataDir?:
  string|'memory://', migrate?: boolean, seed?: boolean, fixtures?: boolean })` (`/pglite`, loads pg_trgm contrib); `migrate(db, { dir? })` + `listMigrations()`
  (tracks applied files in `local_meta.applied_migrations(name text pk, sha256, applied_at)`, refuses changed checksums); `/testing`: `createTestDb({ fixtures?:
  boolean })` (template + `dumpDataDir`/`loadDataDir` clone), `createTestUser(db, { email?, timezone?, roles?: AppRole[] }) → { id, claims }`, `claimsFor(id)`,
  `asSuperuser(db, sql)` helper; CLIs `serve` (pglite-server 127.0.0.1:54322, max-connections 1, `.local/pglite`, migrate+seed+fixtures), `migrate`
  (`--url` or pglite), `gen-types` (introspects PGlite → `packages/database-types/src/database.ts` in Supabase `Database['public']['Tables'][t]['Row'|'Insert'|'Update']`
  + `['Enums']` shape; deterministic output).
* RLS/trigger suite `supabase/tests/*.test.ts` covering every item listed in DATABASE_SCHEMA §4 "Required DB tests".
**Checkpoint W1‑C1 (land first):** `@projectx/db` interfaces + pglite executor + migrator + shim + migrations 0001–0006 + seeds.
**Acceptance:** `npm run typecheck -w @projectx/db -w @projectx/database-types` · `npm test -w @projectx/db` (runs package tests + all `supabase/tests`) ·
`npm run gen:types -w @projectx/db` twice → identical file · `npm run serve -w @projectx/db` then `psql`-free check: `npx tsx packages/db/src/cli/migrate.ts --url
postgres://postgres:postgres@127.0.0.1:54322/postgres --status` reports all applied · grep: no `uuidv7`, `MERGE`, `JSON_TABLE` in migrations.

### W2 — Contracts, shared logic, API
**Owns:** `packages/contracts/**`, `packages/shared/**`, `apps/api/**` **except** `apps/api/wrangler.toml`.
**Deliver:**
* `@projectx/contracts`: `src/enums.ts`, `src/domain/{content,answers,refs}.ts`, `src/dto/*.ts`, `src/errors.ts` (ErrorCode, ErrorEnvelope), `src/pagination.ts`,
  `src/ingestion.ts` (NormalizedQuestion, OfficialAnswer, OfficialKeyIn), `src/routes/*.ts` (request/response schemas per endpoint), JSON Schemas →
  `packages/contracts/json-schema/{normalized-question,official-key,answer-key,content-blocks}.json`, `openapi/openapi.json` (generated by API script),
  `CHANGELOG.md`. Import `z` from `@hono/zod-openapi`; register named components via `.openapi('Name')`.
* `@projectx/shared`: `gradeAttempt`, `compareDecimal`, `answerKeysEqual`, `canonicalizeAnswerKey`, `canonicalJson`, `sha256Hex` (WebCrypto), `slugify` (same
  algorithm as SQL), `encodeCursor/decodeCursor`, `Result<T,E>`.
* `apps/api`: `src/app.ts` `createApp(deps: AppDeps): OpenAPIHono`; `src/deps.ts` (`AppDeps = { config, db: Db, storage: StorageSet, cache: CacheInvalidator,
  rateLimiter: RateLimiter, auth: AuthVerifier, clock: () => Date, logger, waitUntil(p) }`); `src/env.ts` (Worker `Env` with binding names from ARCHITECTURE §9);
  `src/config.ts` (Zod env parse); `src/worker.ts` (default export `{ fetch }`, builds deps per request, `createPostgresDb` per request + `waitUntil(end)`);
  `src/node.ts` (Node dev server :8787, pglite or postgres, local storage served under `/__local/public/*`); `src/middleware/*` (request-id, error envelope +
  DB error mapping, auth (`jwks|hs256|test`), roles, cors, security headers, cache headers via `applyCacheHeaders`, rate limit); `src/routes/**` every endpoint
  in API_CONTRACTS §3; `src/mappers/*`; `src/services/*` (practice selection, attempt submission per §3.4 rules, publication workflow incl. asset copy to
  PUBLIC_ASSETS — row updated to `bucket='PUBLIC_ASSETS', r2_key=r2Keys.publicAsset(sha256, ext)` — and purge tags); `src/repositories/{types.ts, sql/*, memory/*}`
  (interfaces per domain; memory impls for fast route tests; SQL impls used in prod and integration tests); `scripts/{generate-openapi.ts, dev-token.ts}`; `test/**`.
* Optional split if a 6th agent exists: **W2b** owns `apps/api/src/routes/admin/**`, `apps/api/src/services/admin/**`, `apps/api/src/repositories/sql/admin-*.ts`,
  `apps/api/src/repositories/memory/admin-*.ts`, `apps/api/test/admin/**`; W2 keeps the rest and registers admin routers via `src/routes/admin/index.ts` (owned by W2b,
  exporting `registerAdminRoutes(app)`).
**Checkpoint W2‑C1 (land first, within the first hour):** contracts `enums`, `domain/*`, `errors`, `ingestion` + shared `gradeAttempt/canonicalJson/sha256Hex/answerKeysEqual`.
**Acceptance:** `npm run typecheck -w @projectx/contracts -w @projectx/shared -w @projectx/api` · `npm test -w @projectx/contracts -w @projectx/shared -w @projectx/api`
(must include: grading table tests incl. decimal edge cases; envelope/error mapping; every route happy+auth-denied path on memory repos; SQL-repo integration
suite on `createTestDb({fixtures:true})` covering public question DTO, 301 redirect, practice list never leaking answers (deep key scan), session creation
idempotency, attempt idempotency replay 200 / conflict 409 / ALREADY_ATTEMPTED, streak+progress after attempts, bookmark CRUD through `withUser`, admin
approve→publish→unpublish with recorded purge tags (RecordingInvalidator), publish guard 422, VERSION_CONFLICT, cache headers per class and `private,
no-store` on all authed routes, rate-limit 429 with memory limiter) · `npm run openapi:generate -w @projectx/api` writes `packages/contracts/openapi/openapi.json`
(valid 3.1, every route present) · `npm run dev -w @projectx/api` serves `/api/v1/health` = ok and `/api/v1/public/questions/<fixture slug>` on PGlite.

### W3 — AI pipeline
**Owns:** `packages/ai/**`, `workers/src/pxw/verification/**`, `workers/tests/verification/**`.
**Deliver:** everything in AI_PIPELINE.md (client interface, Google + mock + budget decorator, prompts v1, schemas, modules, verification checks + pure
`decideVerification`, SymPy bridge TS + Python `sympy_check.py`, job runner + handlers + chaining, `AiRepository` SQL impl, CLI). Uses `@projectx/db`
(`withService`) and DB functions `claim/heartbeat/complete/fail/enqueue_pipeline_job`.
**Acceptance:** `npm run typecheck -w @projectx/ai` · `npm test -w @projectx/ai` (all AI_PIPELINE §9 items; no network) ·
`workers\.venv\Scripts\python -m pytest workers/tests/verification -q` · `npm run ai -w @projectx/ai -- process-question --db pglite --provider mock --id <fixture DRAFT id>`
exits 0 and prints the resulting verification status.

### W4 — Python ingestion workers
**Owns:** `workers/**` except `workers/src/pxw/verification/**` and `workers/tests/verification/**`. (`pyproject.toml`: scripts/tool config only.)
**Deliver:** everything in INGESTION_PIPELINE.md (protocols, local + R2 storage, OCR chain with rapidocr/paddle/tesseract/mock, PDF extraction + 2 layout
profiles, figures, math_text, normalization, dedupe, answer-key parser, file + Postgres job stores and repos, stage artifacts/resume, CLI).
Key layout must match `@projectx/edge` `r2Keys` (§W5) and LocalStorage layout `<LOCAL_STORAGE_DIR>/<BUCKET>/<key>`.
**Acceptance:** `cd workers; .venv\Scripts\python -m ruff check src tests` · `.venv\Scripts\python -m pytest -q --ignore=tests/verification` (all §8 items; offline) ·
`.venv\Scripts\pxw process-document --file <generated synthetic pdf> --out .local/out --ocr-engines mock` produces NormalizedQuestion JSON valid against
`packages/contracts/json-schema/normalized-question.json` (test skips this comparison with a clear message if the file is not yet generated) · optional with
`npm run db:serve` running: `pxw ingest register … --source PROJECTX_EDITORIAL` then `pxw jobs run --once` → source_questions rows present.

### W5 — Cloudflare edge, config, deployment docs
**Owns:** `packages/edge/**`, `apps/api/wrangler.toml`, `infra/cloudflare/**`, `.env.example`, `README.md` (root), `docs/DEPLOYMENT.md`.
**Deliver:** `@projectx/edge` with exactly:
```ts
export type BucketName = 'SOURCE_DOCS' | 'PUBLIC_ASSETS' | 'USER_UPLOADS';
export interface StoredObject { body: ReadableStream<Uint8Array>; size: number; contentType: string; etag?: string }
export interface ObjectStorage {
  put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, opts: { contentType: string; cacheControl?: string }): Promise<void>;
  get(key: string): Promise<StoredObject | null>; head(key: string): Promise<{ size: number; contentType: string } | null>; delete(key: string): Promise<void>;
}
export type StorageSet = Record<BucketName, ObjectStorage>;
export function copyObject(from: ObjectStorage, fromKey: string, to: ObjectStorage, toKey: string, opts?: { cacheControl?: string }): Promise<'copied' | 'exists'>;
export function createR2Storage(bucket: R2Bucket): ObjectStorage;            // workers-types R2Bucket
export function createMemoryStorage(): ObjectStorage;
// '@projectx/edge/node': createLocalStorage(rootDir: string, bucket: BucketName): ObjectStorage   (files at rootDir/<bucket>/<key>, content-type sidecar <key>.meta.json)
export const r2Keys: { sourceDocument(sourceCode: string, year: number, sha256: string, ext: string): string /* sources/{code}/{year}/{sha}.{ext} */;
  derivedCrop(sourceDocumentId: string, questionNumber: string, n: number): string /* derived/{docId}/crops/q{num}-{n}.png */;
  publicAsset(sha256: string, ext: string): string /* assets/{sha[0..2]}/{sha}.{ext} */;
  userUpload(userId: string, yyyyMm: string, id: string, ext: string): string /* u/{userId}/{yyyy-mm}/{id}.{ext} */; backup(date: string): string /* backups/{date}/db.sql.gz */ };
export function signFileUrl(o: { secret: string; baseUrl: string; bucket: BucketName; key: string; expiresInSec: number /* ≤900 */; now?: number }): Promise<string>;
export function verifyFileToken(o: { secret: string; token: string; now?: number }): Promise<{ bucket: BucketName; key: string } | null>;
export type CacheClass = 'TAXONOMY' | 'PUBLIC_CONTENT' | 'PUBLIC_LIST' | 'PUBLIC_NOT_FOUND' | 'PRIVATE' | 'NONE';
export const cachePolicies: Record<CacheClass, { cacheControl: string; cacheable: boolean }>;   // values = API_CONTRACTS §1 table
export function applyCacheHeaders(h: Headers, cls: CacheClass, tags?: string[]): void;          // Cache-Control always; Cache-Tag + X-Cache-Tags only if cacheable
export const cacheTags: { question(id: string): string; questionSlug(s: string): string; chapter(id: string): string; chapterSlug(s: string): string;
  subject(id: string): string; exam(id: string): string; taxonomy: 'tax'; qlist: 'qlist'; sitemap: 'sitemap'; search: 'search' };
export interface CacheInvalidator { purgeTags(tags: string[]): Promise<{ ok: boolean; purged: string[]; error?: string }> }
export function createWorkersCacheInvalidator(cache: { purge(o: { tags: string[] }): Promise<unknown> }): CacheInvalidator;
export function createZoneApiInvalidator(o: { zoneId: string; apiToken: string; fetch?: typeof fetch }): CacheInvalidator;  // POST /zones/{id}/purge_cache {tags}, chunks ≤30, 3 retries
export function createCompositeInvalidator(list: CacheInvalidator[]): CacheInvalidator;
export function createNoopInvalidator(): CacheInvalidator;
export function createRecordingInvalidator(): CacheInvalidator & { calls: string[][] };
export function edgeCacheMiddleware(): MiddlewareHandler;   // Cache API fallback for GET w/o Authorization when Workers Caching is unavailable
export type RateLimitClass = 'RL_PUBLIC' | 'RL_SEARCH' | 'RL_WRITE' | 'RL_ATTEMPTS' | 'RL_DOUBTS' | 'RL_ADMIN';
export const rateLimitDefaults: Record<RateLimitClass, { limit: number; periodSec: 60 }>;      // API_CONTRACTS §1
export interface RateLimiter { limit(cls: RateLimitClass, key: string): Promise<{ success: boolean; retryAfterSec: number }> }
export function createCloudflareRateLimiter(bindings: Record<RateLimitClass, { limit(o: { key: string }): Promise<{ success: boolean }> }>): RateLimiter;
export function createMemoryRateLimiter(limits?: Partial<Record<RateLimitClass, { limit: number; periodSec: 10 | 60 }>>, now?: () => number): RateLimiter;
export function createNoopRateLimiter(): RateLimiter;
export function sniffImageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null;
export function hashIp(ip: string, secret: string): Promise<string>;    // HMAC-SHA256 hex
```
`apps/api/wrangler.toml`: `name="projectx-api"`, `main="src/worker.ts"`, `compatibility_date="2026-10-01"`, `compatibility_flags=["nodejs_compat"]`,
`[observability] enabled=true`, `[cache] enabled=true` (with comment: verify plan availability; else set `CACHE_MODE=cache_api` var → API mounts
`edgeCacheMiddleware`), `[[r2_buckets]]` SOURCE_DOCS/PUBLIC_ASSETS/USER_UPLOADS → bucket names from ARCHITECTURE §9, `[[ratelimits]]` six classes with
`namespace_id` "1001"–"1006" and limits from `rateLimitDefaults`, `[vars]` non-secret defaults, commented `[[hyperdrive]]`, `[env.staging]`/`[env.production]`
(no `routes` active — DNS/route changes need approval), secrets listed in comments for `wrangler secret put`. `infra/cloudflare/`: `r2-cors.json` (public
bucket GET from allowed origins), `r2-lifecycle.json` (abort multipart 1 day; `derived/pages/` expire 90 days), `waf-rate-limit-rule.md`, `cache-rules.md`,
`backup-runbook.md`, `usage-runbook.md`. `.env.example` with every var in ARCHITECTURE §9 (comments, safe dev defaults, secrets blank). `docs/DEPLOYMENT.md`
(staging/prod steps, all gated "requires approval"). Root `README.md` (quickstart: install, db:serve, dev:api, tests, Python venv).
**Checkpoint W5‑C1 (land first):** all interfaces + memory/noop/recording implementations + `cachePolicies`/`cacheTags`/`r2Keys`.
**Acceptance:** `npm run typecheck -w @projectx/edge` · `npm test -w @projectx/edge` (cache header values byte-exact per class, tag builders, no tags on
PRIVATE, signed URL round-trip/expiry/tamper, memory limiter windows, zone invalidator chunking/retry with fake fetch, local storage round-trip, sniffing,
`copyObject` idempotency) · `npm run deploy:dry -w @projectx/api` succeeds once W2's `worker.ts` exists (W5 verifies, W2 fixes code errors) · test that
`.env.example` contains every name in ARCHITECTURE §9 (script `packages/edge/test/env-example.test.ts` parses both files).

## 3. Dependency graph & build order
```
W0 ──▶ W1 ─────────────┐
   ├─▶ W2 (C1 first) ──┼─▶ W2 API integration (needs W1‑C1, W5‑C1)
   ├─▶ W5 (C1 first) ──┘
   ├─▶ W3 (needs W2‑C1 contracts/shared, W1‑C1 db; Python part independent)
   └─▶ W4 (independent; JSON Schema check needs W2‑C1; Pg tests need W1)
Lead M5 integration after all acceptance lists pass.
```
All five start right after W0. Each lands its checkpoint C1 first (W1, W2, W5 within the first hour), then continues. A package whose dependency
has not landed writes code/tests against the documented interface and runs its own isolated tests; full typecheck is required only at acceptance.

## 4. Interface contracts between workers (summary)
| Provider → Consumer | Contract |
|---|---|
| W1 → W2, W3 | `@projectx/db` (`Db`, `SqlTx`, `createPostgresDb`, `createPgliteDb`, `/testing`), schema names (DATABASE_SCHEMA), `app_private.*` functions |
| W1 → W4 | SQL functions `enqueue/claim/heartbeat/complete/fail_pipeline_job`, `log_pipeline_job_event`, `promote_source_question`, `link_official_answer_keys`, `find_near_duplicates`; table columns of `source_documents`, `source_questions`, `question_assets`, `official_answer_keys`, `exam_papers` |
| W2 → W3, W4, Owner A | `@projectx/contracts` schemas + JSON Schemas; `@projectx/shared` grading/canonicalisation |
| W5 → W2 | `@projectx/edge` signatures above; binding/env names |
| W3 ↔ W4 | Python package `pxw` shared venv; W3's `python -m pxw.verification.sympy_check` stdin/stdout protocol (AI_PIPELINE §5) |
| W4 → W3 (via DB) | promoted questions with `ingestion_status='IMPORTED'` and an `AI_CLASSIFY` job (`AI_CLASSIFY:{qid}:{content_hash}`) |

## 5. Shared constants (copy exactly)
Package names `@projectx/{api,contracts,shared,db,database-types,edge,ai}`; Python package `pxw`; local DB URL
`postgres://postgres:postgres@127.0.0.1:54322/postgres`; API dev port 8787; base path `/api/v1`; bucket names `projectx-source-docs`,
`projectx-public-assets`, `projectx-user-uploads`; job idempotency key formats (AI_PIPELINE §4, INGESTION_PIPELINE §4); default timezone `Asia/Kolkata`;
`rules_version` `v1`; `PIPELINE_VERSION` `v1`; prompt versions `v1`.

## 6. Definition of done (all workers)
Acceptance commands pass with output pasted in the hand-off; no files touched outside ownership (`git status` reviewed by lead); no new deps; no secrets;
public DTO leak test (W2) and RLS suite (W1) green; docs drift reported (not silently "fixed" in code).

## 7. Lead integration (M5, after hand-offs)
Run root `npm run typecheck`, `npm test`, Python `pytest`, `npm run openapi`, `npm run deploy:dry -w @projectx/api`; scripted local e2e on `db:serve`
(pxw register synthetic doc with PROJECTX_EDITORIAL source → jobs run → ai run-worker --provider mock → admin approve/publish via API with dev token →
public GET → attempt → streak). Fix integration seams by assigning back to owners.

## 8. Open questions for the user (non-blocking for M1–M5; blocking for M6)
1. Licensing: has NTA (or any publisher) PYQ reuse been cleared? Until an admin records approval, `NTA` stays `reuse_permitted=false` and only synthetic/editorial content flows.
2. Production domain names (`api.` / `assets.`), Supabase project ref, and a Cloudflare token with Workers/R2/Cache-Purge scope — needed for M6 only.
3. Is Workers Caching available on the target account/plan? If not, `CACHE_MODE=cache_api` fallback is used (already designed).
4. Gemini: free tier acceptable for public PYQ content (prompts may be used by Google), or paid key from the start?

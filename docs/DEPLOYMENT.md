# ProjectX Deployment Guide (staging and production)

**Every step marked `[REQUIRES APPROVAL]` changes remote state (accounts, DNS, routes, buckets, databases, secrets, deploys)
and must not be run without explicit sign-off from the project owner.** Nothing in this repo runs them automatically.
Steps marked `[local]` are safe and offline. Facts are taken from `docs/DEPLOY_FACTS.md` (verified 2026-11-15, nothing
has been run against a real account). Statements tagged **[unverified]** must be tested on staging first.

A non-expert, click-by-click version for the project owner is in `docs/CLOUD_SETUP_CHECKLIST.md`.

Inputs needed from the owner: production domain (`<domain>`, `api.<domain>`, `assets.<domain>`, `staging.<domain>`,
`api-staging.<domain>`), Supabase project ref(s) and DB password, Cloudflare account id, API tokens (section 3), SMTP
provider credentials, the first admin's email, and PYQ licensing clearance (until then only editorial/synthetic content may
be published).

Topology (details in `docs/INTEGRATION_PLAN.md` section 5.3):

```
Browser -> https://<domain>        Worker projectx-web  (OpenNext, Custom Domain)
             SSR fetch https://api.<domain>/api/v1/public/*
        -> https://api.<domain>    Worker projectx-api  (Hono, Custom Domain)  -> Supabase Postgres, R2
        -> https://assets.<domain> R2 projectx-public-assets (custom domain)
Staging: staging.<domain> -> api-staging.<domain>, separate Supabase project, *-staging buckets, separate D1
```

## 0. Pre-flight [local]
1. `npm install && npm run typecheck && npm run typecheck:web && npm test`
2. `workers\.venv\Scripts\python -m pytest workers/tests -q`
3. `npm run openapi` (commit the regenerated `packages/contracts/openapi/openapi.json`)
4. `npm run deploy:dry -w @projectx/api` (API bundle into `apps/api/dist`, no account needed)
5. Web bundle check: `npm run preview:web` (builds with OpenNext and runs on local workerd with simulated bindings; no account).
6. `.env.example` completeness: `npm test -w @projectx/edge`.

## 1. Supabase [REQUIRES APPROVAL]

### 1.1 Create the project
1. Dashboard -> New project (region near users; India: `ap-south-1`). Keep the **database password** (the CLI needs it).
2. The project ref is in the URL: `https://supabase.com/dashboard/project/<ref>`.
3. Staging needs its **own new project**. A project that already has the production schema cannot be reused (the CLI would
   re-apply migrations). Production and staging: separate projects.

### 1.2 Keys (new key model)
Use the **publishable** key (`sb_publishable_...`, browser-safe, goes in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) and the
**secret** key (`sb_secret_...`, server only; the Workers do not need it, never put it on the web Worker or in a
`NEXT_PUBLIC_*` var). The legacy `anon` / `service_role` keys are deprecated by the end of 2026; do not build on them.
Dashboard: Project Settings -> API Keys.

### 1.3 Migrations (Supabase CLI v3) [REQUIRES APPROVAL]
**Breaking in CLI v3: `supabase db push` targets the LOCAL database by default. You must pass `--remote`.** (`--linked`,
`--project-ref`, `--db-url` still work in v3 but are deprecated and removed in v4.) Docker is NOT needed to push to a hosted
project.
```bash
supabase login                                   # or set SUPABASE_ACCESS_TOKEN
supabase link <project-ref>                      # positional ref
export SUPABASE_DB_PASSWORD='<db password>'      # PowerShell: $env:SUPABASE_DB_PASSWORD='...'
supabase db push --remote --dry-run              # review the plan, nothing applied
supabase db push --remote --yes                  # applies supabase/migrations/0001..0015 (--yes skips the prompt; default answer is No)
supabase migration list                          # local vs remote history must match
```
* Migration file names `0001_...` to `0015_...` are accepted as they are (the CLI pattern is `^([0-9]+)_(.*)\.sql$`).
  A later `supabase migration new` creates a 14-digit timestamp, which sorts after `0015`. Pick one scheme going forward
  (hand-numbered `0016_...` or timestamps); do not interleave. History lives in `supabase_migrations.schema_migrations`;
  fix mistakes with `supabase migration repair --status applied|reverted <version>`.
* Do **not** run our own `@projectx/db` migrator against the hosted database (it keeps a separate ledger). **[unverified]**
* Seeds: `supabase db push --remote --include-seed --yes` runs only `supabase/seed/*.sql` (`[db.seed] sql_paths`) and records
  hashes. **Staging only if you want demo-free reference data; check what `supabase/seed/` contains before production.**
  `supabase/fixtures/` (demo questions, dev users with an ADMIN role) is never read by the CLI and must never be loaded in
  production.
* Never paste `supabase/shim/00_supabase_shim.sql` anywhere (it recreates roles/tables that already exist on hosted Supabase).
* Do not run `supabase config push`: `supabase/config.toml [auth]` is local-only (it enables anonymous sign-ins). **[unverified]**
* Optional RLS suite: `npm run test:rls -w @projectx/db -- --url $DATABASE_URL` (needs a reachable database; use a scratch
  project, not production).

### 1.4 Auth settings (dashboard) [REQUIRES APPROVAL]
1. **Email confirmation is ON by default** on hosted projects; keep it on (Auth -> Providers -> Email).
2. **Custom SMTP before launch.** The built-in sender only reaches your own org's team members and is limited to
   **2 emails/hour** with no SLA. Auth -> SMTP Settings: enter your provider's host/port/user/password/sender. Custom SMTP
   starts at 30 messages/hour; adjust in Auth -> Rate Limits.
3. **URL configuration** (Auth -> URL Configuration): Site URL = the production web origin (`https://<domain>`). Add every
   redirect target to the allow list. Signup sends `emailRedirectTo: ${origin}/onboarding/`, so allow:
   `https://<domain>/onboarding/`, `https://staging.<domain>/onboarding/` (staging project: its own domain only) and, for
   local dev, `http://localhost:3000/**`. `*` does not cross `/` or `.`; `**` matches anything; use exact paths in production.
4. Anonymous sign-ins: decide (the API treats them as guests). Keep disabled unless needed.
5. **JWT signing / API `AUTH_MODE`:**
   * `AUTH_MODE=jwks` only works once an **asymmetric** key is the active signing key. Settings -> JWT signing keys ->
     "Migrate JWT secret" (creates an asymmetric standby key), then "Rotate keys" to make it active.
   * Until then use `AUTH_MODE=hs256` with the secret `SUPABASE_JWT_SECRET`.
   * Check: `curl https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` must return a non-empty `keys` array for `jwks`.
     Whether a brand-new project starts on asymmetric keys by default is **[unverified]**.
   * The issuer is `https://<ref>.supabase.co/auth/v1` (the API derives it from `SUPABASE_URL`).

### 1.5 Database connection string for the API
Options (docs/DEPLOY_FACTS.md 1.4):

| Mode | Host:port | Notes |
|---|---|---|
| Supavisor transaction pooler | `aws-<region>.pooler.supabase.com:6543`, user `postgres.<ref>` | IPv4, recommended default for Workers. No prepared statements; `@projectx/db/postgres` already uses `prepare: false`. |
| Direct | `db.<ref>.supabase.co:5432` | IPv6 only without the paid IPv4 add-on. Use for migrations/`pg_dump`, and as the Hyperdrive origin. |
| Supavisor session | `aws-<region>.pooler.supabase.com:5432` | IPv4 fallback for Hyperdrive if the direct host fails. |

Set `DATABASE_URL` (a secret on the API Worker) to the transaction pooler string, **or** use Hyperdrive (section 4.4).
The per-transaction `set local role` / `set_config` RLS pattern through the pooler and through Hyperdrive has never been run
**[unverified]**: smoke-test `GET /api/v1/users/me` and an RLS-only read on staging.

### 1.6 First admin [REQUIRES APPROVAL]
1. The admin signs up through the web app and confirms their email.
2. Supabase SQL editor (runs as `postgres`):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'ADMIN' from auth.users where email = '<admin email>'
   on conflict do nothing;
   ```
3. Verify: `GET /api/v1/users/me` returns `roles: ["ADMIN"]`. (`authenticated` has SELECT only on `user_roles`; this insert
   is the only way to bootstrap.)

## 2. Cloudflare account prerequisites [REQUIRES APPROVAL]
* **Workers Paid plan ($5/month) is required.** Free is 100,000 requests/day and **10 ms CPU per request**; a Next.js SSR render
  plus JWT verification will regularly exceed that **[unverified]**. Paid also lifts subrequests to 10,000 and env vars to 128.
* A **zone** (your domain on Cloudflare DNS) in the same account, so Custom Domains and cache purge work.
* Workers Caching (`[cache] enabled = true` in the API) needs Wrangler >= 4.69.0; rate-limit bindings need >= 4.36.0. The repo pins
  `wrangler` 4.156.0 in both the root and `apps/api`.
* Authenticate on the operator machine: `npx wrangler login` or set `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.

### 2.1 API tokens
| Token | Used by | Permissions |
|---|---|---|
| Deploy token | operator / CI running wrangler | Account: Workers Scripts Edit, Workers R2 Storage Edit, D1 Edit; Zone: Workers Routes Edit, DNS Edit (for Custom Domains). Exact permission names **[unverified]**; the dashboard "Edit Cloudflare Workers" template is the simplest start. |
| `CF_API_TOKEN_PURGE` | API Worker (`CACHE_PURGE_DRIVER=zone_api\|both`) | **Zone -> Cache Purge -> Purge**, scoped to the one zone only. Nothing else. |
| `CACHE_PURGE_API_TOKEN` | web Worker, only if OpenNext CDN purge is enabled (it is not) | same Cache Purge scope |

Purge limits: Free plan 5 requests/min (bucket 25), Pro 5/s, Business 10/s; at most 100 tags per request. **Workers Caching
purges (`ctx.cache.purge`) always use the Free-tier limits** (5/min) whatever the plan, and rate-limited calls resolve with
`success: false` rather than throwing. Zone purges (dashboard/API) do **not** affect Workers Caching. The repo handles this:
`createWorkersCacheInvalidator` checks `success`, chunks to 100 tags and retries rate-limit failures 3x; a purge that stays rate-limited is
logged (`cache purge failed`) and the page falls back to its cache lifetime (TTL).

## 3. Cloudflare storage resources [REQUIRES APPROVAL]
```bash
# R2 (API)
npx wrangler r2 bucket create projectx-source-docs       # private
npx wrangler r2 bucket create projectx-public-assets     # public via custom domain only
npx wrangler r2 bucket create projectx-user-uploads      # private
# staging: same names with the -staging suffix
# CORS (edit origins in the file first) and lifecycle rules
npx wrangler r2 bucket cors set projectx-public-assets --file infra/cloudflare/r2-cors.json   # syntax checked against wrangler 4.156 --help (file contents format not validated)
npx wrangler r2 bucket lifecycle add --help   # then apply rules from infra/cloudflare/r2-lifecycle.json (dashboard is fine)
# Public assets custom domain (zone must be in this account)
npx wrangler r2 bucket domain add projectx-public-assets --domain assets.<domain> --zone-id <zone-id> --min-tls 1.2
npx wrangler r2 bucket dev-url get projectx-public-assets   # must be disabled
# R2 (web OpenNext incremental cache), one per environment
npx wrangler r2 bucket create projectx-web-cache-staging
npx wrangler r2 bucket create projectx-web-cache
# D1 (web OpenNext tag cache), one per environment; copy the printed database_id into wrangler.jsonc
npx wrangler d1 create projectx-web-tags-staging
npx wrangler d1 create projectx-web-tags
```
Never enable the public `r2.dev` URL on private buckets. The old guide's `cors put` was wrong: the subcommand is `cors set <bucket> --file <json>`
(checked against `wrangler r2 bucket cors set --help`, 4.156.0).

## 4. API Worker (`apps/api`) [REQUIRES APPROVAL]

### 4.1 Secrets
```bash
cd apps/api
npx wrangler secret put DATABASE_URL --env staging           # transaction pooler URL (:6543), unless using Hyperdrive
npx wrangler secret put SIGNING_SECRET --env staging         # openssl rand -hex 32
npx wrangler secret put IP_HASH_SECRET --env staging         # openssl rand -hex 32
npx wrangler secret put SUPABASE_JWT_SECRET --env staging    # only if AUTH_MODE=hs256
npx wrangler secret put CF_API_TOKEN_PURGE --env staging     # only if CACHE_PURGE_DRIVER is zone_api or both
npx wrangler secret put WEB_REVALIDATE_SECRET --env staging  # >= 32 chars (enforced); MUST equal the web Worker's REVALIDATE_SECRET
```
Repeat with `--env production` and **different** values. `WEB_REVALIDATE_SECRET` is required whenever `WEB_REVALIDATE_URL` is
set. `GEMINI_API_KEY`, `R2_*` S3 keys and the Supabase secret key stay on the operator machine only.

### 4.2 Vars (edit `apps/api/wrangler.toml`; committing real values REQUIRES APPROVAL)
Per `[env.<name>.vars]`:
* `SUPABASE_URL` = `https://<ref>.supabase.co`; `SUPABASE_JWT_ISSUER` may stay empty (derived).
* `CORS_ALLOWED_ORIGINS` = the **exact web origin**, no wildcard, no trailing slash: staging `https://staging.<domain>`,
  production `https://<domain>` (add `https://www.<domain>` only if it serves the app). **Without this the browser cannot call the API.**
* `PUBLIC_ASSETS_BASE_URL` = `https://assets.<domain>`; `FILES_BASE_URL` = `https://api.<domain>/api/v1/files`.
* `CF_ZONE_ID` = the zone id (needed for `zone_api` purges).
* `WEB_REVALIDATE_URL` = `https://<domain>/api/revalidate/` (trailing slash, because `trailingSlash: true`). Add this var to the
  env's `[vars]` (it is not pre-listed in the file).
* Production: `AUTH_MODE` is `jwks` or `hs256` (never `test`; the API rejects it unless `APP_ENV` is development/test), `ENABLE_API_DOCS=false`.
* Workers Caching unavailable on the plan? `CACHE_MODE="cache_api"` and `CACHE_PURGE_DRIVER="zone_api"` (`infra/cloudflare/cache-rules.md`).

### 4.3 Custom domain, rate limits
```toml
[[env.production.routes]]
pattern = "api.<domain>"
custom_domain = true
```
Cloudflare creates the DNS record and certificate; it fails if a CNAME already exists on that hostname. **The API must be on
a Custom Domain, not a Route**, and so must the web app (a Worker can only `fetch()` another Worker in the same zone through a
Custom Domain). Staging: `api-staging.<domain>`. Adding routes is a DNS change: only after approval.

Rate-limit bindings (`RL_PUBLIC`, `RL_SEARCH`, `RL_WRITE`, `RL_ATTEMPTS`, `RL_DOUBTS`, `RL_ADMIN`) use `namespace_id`s that
must be unique per Cloudflare account: dev `1001-1006` (top level), staging `2001-2006`, production `3001-3006`. Do not reuse
those numbers for anything else in the account. `period` must be 10 or 60 (ours are 60). Limits are approximate and per
Cloudflare location, not global.

### 4.4 Optional Hyperdrive
Point Hyperdrive at Supabase's **Direct** connection string (not a pooler; Hyperdrive pools itself), with caching **disabled**
because our RLS/user-scoped reads must never be cached (Hyperdrive caches eligible reads for 60 s by default and does not
invalidate on writes):
```bash
npx wrangler hyperdrive create projectx-db-staging --connection-string="postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres" --caching-disabled
```
Then uncomment `[[hyperdrive]]` (binding `HYPERDRIVE`, `id = <printed id>`) in the matching env of `apps/api/wrangler.toml`.
The direct host is IPv6-only without the IPv4 add-on and no Cloudflare statement on IPv6 origins was found **[unverified]**:
if it fails, enable the add-on or point Hyperdrive at Supavisor **session** mode (5432). Hyperdrive Free: 100k queries/day,
about 20 origin connections.

### 4.5 Deploy
```bash
cd apps/api && npx wrangler deploy --env staging      # then --env production after staging passes
```
Deploying a new version starts the Workers Cache cold (cache is partitioned per Worker version unless `cross_version_cache = true`).

## 5. Web app on Cloudflare (OpenNext) [REQUIRES APPROVAL]

The web app is Next.js 16.4.6 deployed with `@opennextjs/cloudflare` **1.20.17** (peers: `next >=16.4.5`, `wrangler ^4.148.0`) as the
Worker `projectx-web`. (Cloudflare now recommends vinext for new apps and keeps OpenNext for existing ones; this repo uses
OpenNext. Fallback if staging acceptance fails: Vercel Pro for the web only; see `docs/INTEGRATION_PLAN.md` 5.2.)

### 5.1 Files in the repo
| File | Purpose |
|---|---|
| `open-next.config.ts` | R2 incremental cache, **D1** tag cache (`d1NextTagCache`, "next mode", chosen over sharded Durable Objects for simplicity), Durable Object revalidation queue (`doQueue`), cache interception **off** (incompatible with PPR), `buildCommand: "npm run build:web"`. |
| `wrangler.jsonc` | Worker `projectx-web` (prod), `projectx-web-staging`, `projectx-web-dev` (top level). Bindings: `ASSETS`, `NEXT_INC_CACHE_R2_BUCKET`, `NEXT_TAG_CACHE_D1`, `NEXT_CACHE_DO_QUEUE` (+ `DOQueueHandler` migration), `WORKER_SELF_REFERENCE`. **No routes, no workers.dev.** `database_id` values are placeholders. |
| `next.config.ts` | CSP and security headers (5.6). |

`initOpenNextCloudflareForDev()` is **not** required: `next dev` does not use bindings today (INTEGRATION_PLAN 5.2).

### 5.2 Scripts
| Script | What it does |
|---|---|
| `npm run preview:web` | OpenNext build + local workerd preview (no account, simulated bindings) |
| `npm run upload:web` | OpenNext build + upload a version without promoting it (remote write) |
| `npm run deploy:web:staging` | OpenNext build + deploy `--env staging` (remote write) |
| `npm run deploy:web:production` | OpenNext build + deploy `--env production` (remote write) |
| `npm run cf-typegen:web` | generate `cloudflare-env.d.ts` from the wrangler config |

`opennextjs-cloudflare deploy` also populates the cache: it creates the D1 `revalidations` table (idempotent) and uploads
prerendered cache entries to the R2 bucket, so the D1 database and R2 bucket must already exist (section 3).

### 5.3 Order of operations
1. Section 3 resources exist; paste each printed `database_id` into the matching env of `wrangler.jsonc` (commit after approval).
2. Set the **build-time** env for the target environment in the shell (or as Workers Builds *build* variables). They are inlined
   by `next build`, so use one build per environment and never promote a staging build to production:
   ```bash
   export NEXT_PUBLIC_DATA_SOURCE=api
   export NEXT_PUBLIC_API_BASE_URL=https://api-staging.<domain>/api/v1
   export NEXT_PUBLIC_AUTH_MODE=supabase
   export NEXT_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
   export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   export NEXT_PUBLIC_SITE_URL=https://staging.<domain>
   export NEXT_PUBLIC_ALLOW_INDEXING=            # empty on staging; true only on production
   ```
   `next build` in API mode fetches the API during prerender, so the API must be reachable first (deploy the API before the web).
3. Runtime secret on the web Worker: `npx wrangler secret put REVALIDATE_SECRET --env staging` (same value as the API's
   `WEB_REVALIDATE_SECRET`). Optional runtime var `API_BASE_URL` (server-side override). Use `--keep-vars` on deploys if you also
   manage vars in the dashboard so they are not wiped. Do not set `DEV_TEST_JWT_SECRET` or `NEXT_PUBLIC_AUTH_MODE=dev` on a
   deployed Worker (`/api/dev/token` is 404 in any `next build` output regardless).
4. `npm run deploy:web:staging`.
5. Attach the domain after approval: add to the staging env in `wrangler.jsonc`
   `"routes": [{ "pattern": "staging.<domain>", "custom_domain": true }]` and redeploy (Custom Domain, not Route).
6. Set the API's `WEB_REVALIDATE_URL`/`WEB_REVALIDATE_SECRET` and `CORS_ALLOWED_ORIGINS` (section 4) and redeploy the API.

### 5.4 Revalidation check **[unverified]**
Public pages rely on `revalidateTag` (via `/api/revalidate/`) purging Next 16 `cacheComponents` / `"use cache"` entries across
isolates through the R2 + D1 caches. Not verified for OpenNext 1.20.x. On staging: publish a question, unpublish it, confirm the page
flips within seconds. If it does not, the worst case is staleness up to `cacheLife` revalidate 3600 s / expire 86400 s. Also verify
that `process.env.REVALIDATE_SECRET` is readable in the route on the deployed Worker (401 without the bearer, 200 with it) **[unverified]**.

### 5.5 Bundle limits
Worker size limit is 64 MiB uncompressed, startup must finish in 1 s. Record `wrangler deploy --dry-run` size/startup after the
first successful OpenNext build (not yet done).

### 5.6 Content-Security-Policy
`next.config.ts` (production builds only) sends:
* **Enforced** `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`.
* **Report-Only** full policy: `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'`;
  `img-src 'self' data: blob: https:`; `font-src 'self' data:`; `connect-src 'self'` + the origins of
  `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` (evaluated at build time); `worker-src 'self' blob:`; plus the same
  frame/base/object/form directives.
* `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

Why `script-src` is not enforced: Next emits inline bootstrap scripts (hashes change per build), the root layout has an inline
theme/splash script, and JSON-LD blocks are inline. Enforcing `script-src 'self'` needs a per-request nonce, i.e. dynamic rendering via
a proxy/middleware, which conflicts with `cacheComponents`/PPR static shells and Node.js middleware is not supported on OpenNext.
Open the staging site, watch the console for `script-src` violations, and decide between a nonce/hash approach and keeping
Report-Only. There is no report endpoint, so violations are visible only in the browser console. Whether the Report-Only header
survives OpenNext/Workers unchanged was not tested **[unverified]**.

## 6. Production
1. Repeat sections 1, 3, 4 and 5 with production values (separate Supabase project; its own R2 cache bucket and D1).
2. DNS / Custom Domains: `<domain>` (web), `api.<domain>` (API), `assets.<domain>` (public bucket). WAF backstop and cache rules:
   `infra/cloudflare/waf-rate-limit-rule.md`, `cache-rules.md`. Optional: Cloudflare Access on `/api/v1/admin/*`.
3. Production build env must have `NEXT_PUBLIC_ALLOW_INDEXING=true` only when you actually want indexing.
4. Do not load `supabase/fixtures` in production.

## 7. Post-deploy smoke tests (run on staging, then production)
1. `GET https://api.<domain>/api/v1/health` -> `ok`, `db: ok`.
2. `GET /api/v1/public/questions/<slug>` twice: second is a cache hit (`cf-cache-status: HIT`, or `X-Edge-Cache: HIT` in cache_api mode).
3. An authenticated route returns `Cache-Control: private, no-store`.
4. Hit a rate-limited route over its per-minute limit: 429 with `Retry-After`.
5. CORS: from the web origin, a browser request to the API succeeds; `curl -H "Origin: https://evil.example" -I <api>/api/v1/health` returns no
   `Access-Control-Allow-Origin` for it.
6. Web: `https://<domain>/` loads, no "Demo . mock data" ribbon (means `NEXT_PUBLIC_DATA_SOURCE=api` was set at build), a public question page renders.
7. Sign up with a real email: the confirmation email arrives (custom SMTP) and the link lands on `/onboarding/` (allowed redirect).
8. First admin: after the section 1.6 insert, `GET /api/v1/users/me` shows `roles: ["ADMIN"]` and an admin page loads.
9. Revalidation: `curl -i -X POST https://<domain>/api/revalidate/` without the bearer returns 401; with `Authorization: Bearer <secret>` and
   body `{"tags":["tax"]}` returns 200. Then publish/unpublish and watch the public page flip (5.4).
10. RLS-only read and `/users/me` through the real pooler/Hyperdrive work (the per-transaction role switching is unverified).
11. Response headers on the web: `content-security-policy` (enforced one) and `content-security-policy-report-only` present; no console errors from `connect-src`.
12. `GET /api/dev/token` on the web returns 404.

## 8. Operations and rollback
* Cache purge after taxonomy edits: `npm run cache:purge -w @projectx/edge -- --tags tax` [REQUIRES APPROVAL, calls live API].
* Weekly: `infra/cloudflare/usage-runbook.md`; weekly backup: `infra/cloudflare/backup-runbook.md`.
* **API rollback:** `cd apps/api && npx wrangler rollback --env production` [REQUIRES APPROVAL].
* **Web rollback:** `npx wrangler rollback --env production` from the repo root (the web config) [REQUIRES APPROVAL]. Rolling back the
  Worker does not roll back the R2/D1 cache contents; if stale pages persist after a rollback, purge via the revalidate endpoint with the affected tags.
  Safer pattern: `npm run upload:web` first (uploads a version), then promote/deploy a version from the dashboard (Versions) **[unverified]**.
* **Database rollback:** forward-fix migrations only (`0016_...`). `supabase migration repair` only fixes history, not data.
* A bad web build env (wrong `NEXT_PUBLIC_*`) cannot be fixed with a variable change: rebuild and redeploy.
* Upgrade triggers: `docs/COST_STRATEGY.md` section 5.

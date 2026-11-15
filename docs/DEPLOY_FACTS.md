# Deployment facts (verified 2026-11-15)

Input for the final cloud runbook. Each item is tagged:
**[V]** verified against the cited source on 2026-11-15 · **[U]** unverified or inferred, so test it on staging first.
Nothing here has been run against a real account.

Versions checked: Supabase CLI stable **v3.1.0** (2026-11-09; v4.0.0-next is a prerelease) · `@opennextjs/cloudflare` **1.20.17**
(peer deps: `next >=15.5.29 <16 || >=16.4.5`, `wrangler ^4.148.0`) · `wrangler` **4.162.0** · repo `next` 16.4.6.

---

## 1. Supabase

### 1.1 Project creation
- **[V]** Create the project in the dashboard. Get the project ref from `https://supabase.com/dashboard/project/<ref>`. Keep the DB password: the CLI needs it (`SUPABASE_DB_PASSWORD`). Source: https://supabase.com/docs/guides/deployment/managing-environments
- **[V]** Keys: use the publishable key (`sb_publishable_...`, safe in the browser) and the secret key (`sb_secret_...`, server only). The legacy `anon` and `service_role` keys are **deprecated by the end of 2026**. The web app already reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Source: https://supabase.com/docs/guides/getting-started/api-keys
- **[V]** Staging needs its own new project. A project that already has production's schema cannot be reused, because the CLI would apply the migrations again. Source: managing-environments (above).

### 1.2 Migrations with the CLI
- **[V] Docker is not needed for `db push` to a hosted project.** The handler connects to Postgres directly. It may call the Management API to mint a temporary login role. Docker is only needed for the local stack (`supabase start`, `db reset`, `db diff`). Source: CLI `apps/cli/src/commands/db/push/SIDE_EFFECTS.md` at tag v3.1.0, https://github.com/supabase/cli/tree/v3.1.0
- **[V] BREAKING in CLI v3: `supabase db push` targets the LOCAL database by default.** Pass `--remote` to push to the linked project. `--linked`, `--project-ref`, `--db-url` and `--local` still work in v3 but are deprecated, and v4 removes them. A hosted push asks for confirmation once, defaulting to No. Use `--yes` in non-interactive or agent runs. Source: `apps/cli/docs/supabase/db/push.md` at v3.1.0. (The supabase.com page https://supabase.com/docs/reference/cli/supabase-db-push still describes the old behaviour.) **Our `docs/DEPLOYMENT.md` §1.2 is wrong for v3:** `supabase link --project-ref <ref> && supabase db push` pushes to local.
- **[V] Correct v3 sequence:**
  ```bash
  supabase login                          # or SUPABASE_ACCESS_TOKEN
  supabase link <project-ref>             # positional ref; --project-ref still accepted
  supabase db push --remote --dry-run     # review the plan
  supabase db push --remote               # migrations only
  supabase db push --remote --include-seed  # also runs [db.seed].sql_paths (see 1.3)
  supabase migration list                 # local vs remote history
  ```
  Source: `link.md` and `push.md` at v3.1.0. The workflow is also at https://supabase.com/docs/guides/deployment/database-migrations
- **[V] Our filenames `0001_extensions_helpers.sql` … `0015_….sql` are accepted, so no rename is needed.** The CLI matches migration files with `MIGRATE_FILE_PATTERN = /^([0-9]+)_(.*)\.sql$/u`, so the version recorded is `0001`…`0015`. Versions are compared numerically (`sortMigrationPathsByVersion`). Source: `apps/cli/src/command-internal/migration-history.ts` line 67 (develop and v3.1.0). Notes:
  - **[V]** Any later `supabase migration new` creates a 14-digit timestamp (`YYYYMMDDHHMMSS_name.sql`), which sorts after `0015`. Keep one scheme going forward: either hand-number `0016_…` or switch to timestamps, but don't interleave them. A local migration that sorts before the last remote version is reported as `missing-remote`, an out-of-order error.
  - **[V]** History is stored in `supabase_migrations.schema_migrations` (version, name, statements). Fix it with `supabase migration repair --status applied|reverted <version>`. Source: database-migrations guide.
  - **[V]** Each migration is applied as one batch. `CREATE INDEX CONCURRENTLY`, `VACUUM` and similar statements break atomicity. Our migrations contain none (checked with grep).
  - **[U]** Do not also run our own `@projectx/db` migrator against the same database. It keeps its own ledger, and the two would disagree.
- **[V] Seeds:** `supabase/config.toml` sets `[db.seed] sql_paths = ["./seed/*.sql"]`. `db push` seeds only with `--include-seed`, and records the hashes in `supabase_migrations.seed_files`. Only `supabase/seed/*` runs. `supabase/fixtures/*` (demo questions and **dev users with an ADMIN role**) is never read. Source: push SIDE_EFFECTS.md.
- **[V] Shim:** `supabase/shim/00_supabase_shim.sql` is outside `supabase/migrations/`, so the CLI never reads it. Never paste it into the SQL editor: it creates `anon`, `authenticated`, `service_role` and `auth.users`, which already exist on hosted Supabase.
- **[U]** `supabase/config.toml [auth]` is local-only (it includes `enable_anonymous_sign_ins = true`). Do not run `supabase config push` unless you mean to overwrite remote Auth settings.

### 1.3 Auth settings
- **[V]** Email confirmation is **ON by default on hosted projects**. Setting: Auth > Providers. Source: https://supabase.com/docs/guides/auth/passwords
- **[V]** The default SMTP is not for production. It only sends to org team members, is limited to **2 messages/hour**, and has no SLA. Configure custom SMTP before launch. Custom SMTP starts at 30 msgs/hour, adjustable in Auth > Rate Limits. Source: https://supabase.com/docs/guides/auth/auth-smtp
- **[V]** Redirect URLs: set **Site URL** to the production web origin, and add every `redirectTo` / `emailRedirectTo` target to the allow list. Wildcards: `*` doesn't cross `/` or `.`, `**` matches anything. Use exact paths in production. Our signup sends `emailRedirectTo: ${origin}/onboarding/`, so allow `https://<web-domain>/onboarding/` (plus the staging origin). Source: https://supabase.com/docs/guides/auth/redirect-urls
- **[V]** JWT verification:
  - **JWKS:** `GET https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`, cached about 10 min at the edge plus up to 10 min in clients.
  - **Issuer:** `iss` is `https://<ref>.supabase.co/auth/v1`, which matches our derived `jwtIssuer`.
  - **Legacy setup:** projects on the legacy JWT secret sign with HS256. Moving to signing keys means: Settings > JWT signing keys > *Migrate JWT secret* (this creates an asymmetric **standby** key), then *Rotate keys* to start signing with it.
  - **Mode choice:** `AUTH_MODE=jwks` only works once an asymmetric key is the active signing key. Until then use `AUTH_MODE=hs256` with `SUPABASE_JWT_SECRET`.

  Sources: https://supabase.com/docs/guides/auth/signing-keys, https://supabase.com/docs/guides/auth/jwts
- **[U]** Whether a **new** hosted project starts on asymmetric (ES256) keys by default is not stated in the docs I found. Check the project's JWT signing keys page, and `curl` the JWKS URL: a non-empty `keys` array is required for `jwks` mode.

### 1.4 Connection string for Workers
- **[V]** Connection matrix (https://supabase.com/docs/guides/database/connecting-to-postgres):

  | Mode | Host:port | Free | Paid | Paid + IPv4 add-on | Best for |
  |---|---|---|---|---|---|
  | Direct | `db.<ref>.supabase.co:5432` | IPv6 | IPv6 | IPv4 | Migrations, `pg_dump`, long-lived backend |
  | Supavisor session | `aws-<region>.pooler.supabase.com:5432` | IPv4 | IPv4 | IPv4 | Persistent backend on IPv4 |
  | Supavisor transaction | `aws-<region>.pooler.supabase.com:6543` | IPv4 | IPv4 | IPv4 | Serverless and edge |
  | Dedicated PgBouncer | `db.<ref>.supabase.co:6543` | none | IPv6 | IPv4 | High-performance paid tiers |

  The pooler user name is `postgres.<ref>`.
- **[V]** Transaction mode **does not support prepared statements**. Our `@projectx/db/postgres` already defaults to `prepare: false` (`packages/db/src/postgres.ts:37`), so `DATABASE_URL` = Supavisor transaction pooler (6543) works as documented.
- **[V] Hyperdrive alternative:**
  - **Origin:** Cloudflare says to point Hyperdrive at Supabase's **Direct connection** string, not a pooler, because Hyperdrive does its own pooling (transaction mode).
  - **Create:** `npx wrangler hyperdrive create <name> --connection-string="postgres://…"`.
  - **Free plan:** 100,000 queries/day and about 20 origin connections.
  - **Paid plan:** unlimited queries. The 2026-11-11 changelog raised the origin-connection limit to 1,500 per config and the config limit to 100.

  Sources: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/, https://developers.cloudflare.com/hyperdrive/platform/pricing/, https://developers.cloudflare.com/hyperdrive/platform/limits/, https://developers.cloudflare.com/changelog/post/2026-11-11-hyperdrive-raised-limits/
- **[V] Hyperdrive caches eligible read queries by default** (max_age 60 s, SWR 15 s) and does not invalidate them on writes. Postgres.js with `prepare: false` makes queries uncacheable, but don't rely on that. Our RLS/user-scoped reads must never be cached, so **create the config with `--caching-disabled`**. Source: https://developers.cloudflare.com/hyperdrive/concepts/query-caching/, https://developers.cloudflare.com/hyperdrive/observability/troubleshooting/
- **[U]** Hyperdrive can only reach the direct host if it can connect over IPv6. The direct host is IPv6-only without the IPv4 add-on, and I found no Cloudflare statement on IPv6 origins. If it fails, use the IPv4 add-on or point Hyperdrive at Supavisor session mode (5432).
- **[U]** Our `set local role` and `set_config` per-transaction RLS pattern through the Supavisor transaction pooler or Hyperdrive has not been run (STATUS.md item 3). Smoke-test `/users/me` and an RLS-only read on staging.

### 1.5 First admin
- **[V]** Our schema: `user_roles(user_id uuid → auth.users, role app_role ('ADMIN','REVIEWER'), granted_by, created_at)` with PK `(user_id, role)`. `authenticated` has SELECT only. Steps:
  1. The admin signs up through the web app and confirms their email.
  2. In the SQL editor (runs as `postgres`), run:
  ```sql
  insert into public.user_roles (user_id, role)
  select id, 'ADMIN' from auth.users where email = '<admin email>'
  on conflict do nothing;
  ```
  Verify with `GET /api/v1/users/me` → `roles: ["ADMIN"]`.

---

## 2. Cloudflare

### 2.1 R2
- **[V]** `wrangler r2 bucket create <name> [--location <hint>] [--jurisdiction <j>] [--storage-class …]`. The location hint is honoured only on first creation.
- **[V]** Custom domain: `wrangler r2 bucket domain add <bucket> --domain <host> --zone-id <zone> [--min-tls 1.2]`. The domain must be a zone in the same account.
- **[V]** `wrangler r2 bucket dev-url get <bucket>` shows the r2.dev status. Keep it disabled on private buckets.
- **[V]** `wrangler r2 bucket lifecycle add <bucket> [NAME] [PREFIX] …` and `wrangler r2 bucket cors …` exist.

  Sources: https://developers.cloudflare.com/workers/wrangler/commands/r2/, https://developers.cloudflare.com/r2/buckets/public-buckets/

### 2.2 API Worker (`apps/api`)
- **[V]** Secrets: `wrangler secret put <NAME> --env <staging|production>` (prompts for the value). Required set for our config:
  - `DATABASE_URL`, unless the Hyperdrive binding is used
  - `SIGNING_SECRET`
  - `IP_HASH_SECRET`
  - `SUPABASE_JWT_SECRET`, only for `AUTH_MODE=hs256`
  - `CF_API_TOKEN_PURGE`, only for `CACHE_PURGE_DRIVER=zone_api|both`
  - `WEB_REVALIDATE_SECRET`, when `WEB_REVALIDATE_URL` is set; at least 32 chars, enforced by `parseConfig`

  **DEPLOYMENT.md §3 omits `WEB_REVALIDATE_SECRET`.** Source: https://developers.cloudflare.com/workers/wrangler/commands/
- **[V]** Vars to fill per env: `SUPABASE_URL`, `CORS_ALLOWED_ORIGINS` (**must include the web origin**, exact, no wildcard), `PUBLIC_ASSETS_BASE_URL`, `FILES_BASE_URL`, `CF_ZONE_ID`, `WEB_REVALIDATE_URL` (e.g. `https://<web-domain>/api/revalidate/`, trailing slash because `trailingSlash: true`).
- **[V]** Deploy: `cd apps/api && npx wrangler deploy --env staging`, then `--env production`. Roll back with `npx wrangler rollback`.
- **[V]** Custom domain in config:
  ```toml
  [[env.production.routes]]
  pattern = "api.<domain>"
  custom_domain = true
  ```
  Cloudflare creates the DNS record and certificate. This fails if a CNAME already exists on that hostname. A Worker can `fetch()` another Custom Domain in the same zone, which Routes cannot do. That is what lets the API's revalidation webhook reach the web Worker, so **put the web app on a Custom Domain, not a Route**. Source: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- **[V]** Rate-limit bindings:
  - `[[ratelimits]] name / namespace_id (integer string, unique per account) / simple = { limit, period }`, where **period must be 10 or 60** (ours use 60).
  - Limits are approximate and per Cloudflare location, not global.
  - The binding is GA and needs Wrangler ≥ 4.36.0. Optional `delta` weighting needs ≥ 4.157.0.

  Source: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

### 2.3 Workers Caching (`[cache] enabled = true`)
- **[V]** This is a real, documented feature and needs Wrangler ≥ 4.69.0. It has no separate price: every request, HIT or MISS, is billed as a Worker request, and CPU is billed only on a MISS. Source: https://developers.cloudflare.com/workers/cache/configuration/, https://developers.cloudflare.com/workers/cache/
- **[V]** Requests carrying `Authorization` or responses carrying `Set-Cookie` bypass the cache automatically. `Cache-Control: private` also bypasses.
- **[V]** The cache is partitioned **per Worker version**: every deploy starts cold, unless `cross_version_cache = true`.
- **[V]** `ctx.cache.purge({ tags | pathPrefixes | purgeEverything })` and `cache.purge()` (from `cloudflare:workers`) are scoped to the Worker's own entrypoint. **Zone purges (dashboard/API) do NOT affect Workers Caching.**
- **[V]** **Workers Caching purges always use the Free-tier purge limits**, whatever the plan: 5 requests/min, bucket 25, at most 100 tags per request. Rate-limited calls resolve with `success: false`; they do not throw. Source: https://developers.cloudflare.com/workers/cache/purge/, https://developers.cloudflare.com/workers/cache/limitations/, https://developers.cloudflare.com/cache/how-to/purge-cache/
- **[V]** Response-size limit: Free-plan cacheable size for all accounts "at launch", per the limitations page.

### 2.4 Cache purge API token (`CF_API_TOKEN_PURGE`, zone_api driver)
- **[V]** The token needs the **Cache Purge** permission (zone-scoped). `POST /zones/{zone_id}/purge_cache {"tags": [...]}`. All purge methods are available on all plans.
- **[V]** Free plan: 5 req/min (bucket 25). Pro: 5 req/s. Business: 10 req/s. Every plan allows at most 100 tags per request.

  Sources: https://developers.cloudflare.com/cache/how-to/purge-cache/, https://developers.cloudflare.com/changelog/post/2025-04-01-purge-for-all/

### 2.5 Web app (Next.js 16.4.6) with `@opennextjs/cloudflare` 1.x
- **[V]** Cloudflare now **recommends vinext** for new Next.js apps. OpenNext remains documented and supported "for existing OpenNext applications". Either path is acceptable; this repo plans OpenNext. Source: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/, https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- **[V]** Manual setup:
  ```bash
  npm i @opennextjs/cloudflare@latest && npm i -D wrangler@latest
  ```
  `wrangler.jsonc` (repo root, beside `next.config.ts`):
  ```jsonc
  {
    "$schema": "./node_modules/wrangler/config-schema.json",
    "name": "projectx-web",
    "main": ".open-next/worker.js",
    "upload_source_maps": true,
    "compatibility_date": "2026-10-13",
    "compatibility_flags": ["nodejs_compat"],
    "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
    "observability": { "enabled": true }
    // + "routes": [{ "pattern": "<web-domain>", "custom_domain": true }]
  }
  ```
  `open-next.config.ts`:
  ```ts
  import { defineCloudflareConfig } from "@opennextjs/cloudflare";
  export default defineCloudflareConfig();
  ```
  Scripts:
  ```json
  "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
  "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
  "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
  ```
  `nodejs_compat` is required, with compatibility_date ≥ 2024-09-23. Source: the OpenNext page above.
- **[V]** Feature table on the Cloudflare page: Composable Caching (`"use cache"`) is "Supported (experimental in Next.js)". PPR is supported. **Node.js middleware is not supported.**
- **[V]** On-demand revalidation (`revalidateTag`) needs a **tag cache** plus an **incremental cache**:
  - **Incremental cache:** binding `NEXT_INC_CACHE_R2_BUCKET` and a `WORKER_SELF_REFERENCE` service binding; config `incrementalCache: r2IncrementalCache`, optionally `withRegionalCache(…, { mode: "long-lived" })`.
  - **Tag cache, D1 option:** `d1NextTagCache` with binding `NEXT_TAG_CACHE_D1` and a `revalidations` table.
  - **Tag cache, Durable Object option:** `doShardedTagCache({ baseShardSize: 12 })` with binding `NEXT_TAG_CACHE_DO_SHARDED`, class `DOShardedTagCache` in `new_sqlite_classes`.
  - **Time-based revalidation queue:** `doQueue` with binding `NEXT_CACHE_DO_QUEUE`, class `DOQueueHandler`.
  - **Optional CDN purge:** `cachePurge: purgeCache({ type: "direct" })` with secrets `CACHE_PURGE_API_TOKEN` and `CACHE_PURGE_ZONE_ID`; needs a zone.
  - **Incompatibility:** `enableCacheInterception` does not work with PPR.

  Source: https://opennext.js.org/cloudflare/caching
- **[U] Not verified:** that OpenNext 1.20.x stores Next 16 `cacheComponents` / `"use cache"` entries in the configured R2/tag cache rather than in per-isolate memory, and that `revalidateTag(tag, { expire: 0 })` from `/api/revalidate/` purges them across isolates. Our public pages depend on this (`src/lib/data/api.ts`). **Must be tested on staging:** publish, unpublish, check the page flips within seconds. If it fails, the worst case is staleness up to `cacheLife` revalidate 3600 s / expire 86400 s.
- **[V]** Env vars:
  - `NEXT_PUBLIC_*` are inlined at build time. With Workers Builds they must be set as *build* variables.
  - Runtime secrets (`REVALIDATE_SECRET`) belong on the web Worker. Set them in the dashboard or with `wrangler secret put`, and use `--keep-vars` so deploys don't wipe dashboard vars.
  - `.env` / `.dev.vars` must not be committed.

  Source: https://opennext.js.org/cloudflare/howtos/env-vars
- **[U]** `process.env.REVALIDATE_SECRET` is readable inside the route handler on the deployed Worker; this relies on OpenNext populating `process.env`. Verify with a 401/200 probe.
- **[V]** `/api/dev/token` returns 404 in any `next build` output, including OpenNext, because `NODE_ENV=production` is inlined. It additionally needs `NEXT_PUBLIC_AUTH_MODE=dev`. The API rejects `AUTH_MODE=test` unless `APP_ENV` is development or test. (Code: `src/app/api/dev/token/route.ts:14`, `apps/api/src/config.ts`.)

### 2.6 Free vs Paid limits that matter
**[V]** Source: https://developers.cloudflare.com/workers/platform/limits/

| | Workers Free | Workers Paid |
|---|---|---|
| Requests | 100,000/day | unlimited |
| CPU per request | **10 ms** | up to 5 min |
| Subrequests | 50 external / 1,000 to CF services | 10,000 (configurable to 10M) |
| Worker size (uncompressed) | 64 MiB | 64 MiB |
| Startup time | 1 s | 1 s |
| Env vars | 64 | 128 |
| Static asset files | 20,000 | 100,000 |
| Hyperdrive | 100k queries/day, ~20 origin connections | unlimited queries |
| Purge (zone) | 5/min | 5/s (Pro) |
| Workers Caching purge | Free-tier limits | Free-tier limits |

- **[U]** A Next.js SSR render plus JWT/JWKS verification will regularly exceed **10 ms CPU**. Plan on **Workers Paid** for the web Worker, and very likely for the API too.

---

## 3. Things in our repo this contradicts

1. `docs/DEPLOYMENT.md:21`: `supabase db push` needs `--remote` on CLI v3, and `supabase link <ref>`.
2. `docs/DEPLOYMENT.md:19`: says "anon key"; use the publishable / secret keys, since legacy keys are deprecated by end of 2026.
3. `docs/DEPLOYMENT.md` §3/§4: add `WEB_REVALIDATE_SECRET` and `WEB_REVALIDATE_URL`; `CORS_ALLOWED_ORIGINS` must list the web origin; there is no web-app (OpenNext) section at all.
4. `docs/DEPLOYMENT.md:79`: Hyperdrive should point at the Direct connection and use `--caching-disabled`.
5. `packages/edge/src/invalidators.ts` `createWorkersCacheInvalidator`: does not check `result.success` and does not chunk to ≤ 100 tags. Under Workers Caching's fixed 5/min purge budget, rate-limited purges are reported as success.
6. `docs/STATUS.md:10`: says migrations 0001–0014; it is now 0001–0015.

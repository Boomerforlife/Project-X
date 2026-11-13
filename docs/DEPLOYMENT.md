# ProjectX Deployment Guide (staging and production)

**Every step marked `[REQUIRES APPROVAL]` changes remote state (accounts, DNS, routes, buckets, secrets, deploys) and must
not be run without explicit sign-off from the project owner.** Nothing in this repo runs them automatically. Steps marked
`[local]` are safe and offline.

Inputs still needed from the owner (WORK_SPLIT section 8): production domain names (`api.<domain>`, `assets.<domain>`),
Supabase project ref, a Cloudflare API token with Workers/R2/Cache-Purge scope, confirmation that Workers Caching is
available on the plan, and PYQ licensing clearance (until then only editorial/synthetic content may be published).

## 0. Pre-flight [local]
1. `npm install && npm run typecheck && npm test`
2. `workers\.venv\Scripts\python -m pytest workers/tests -q`
3. `npm run openapi` (commit the regenerated `packages/contracts/openapi/openapi.json`)
4. `npm run deploy:dry -w @projectx/api` (builds the Worker bundle into `apps/api/dist`, no account needed)
5. Confirm `.env.example` is complete (`npm test -w @projectx/edge` covers this).

## 1. Supabase [REQUIRES APPROVAL]
1. Create the project (region near users; India: `ap-south-1`). Note project ref, anon key (public), service role key (secret, never in the Worker).
2. Apply migrations from `supabase/migrations/*.sql` in order, then `supabase/seed/*.sql`. Do **not** apply `supabase/shim/` or `supabase/fixtures/`.
   `supabase link --project-ref <ref> && supabase db push` (CLI), or run the files in the SQL editor in order.
3. Run the RLS suite against it if Docker/CLI available: `npm run test:rls -w @projectx/db -- --url $DATABASE_URL`.
4. Auth settings: enable email + the providers Owner A needs; decide on anonymous sign-ins (treated as guests). Set JWT signing keys to asymmetric (JWKS) and use `AUTH_MODE=jwks`.
5. Take the **transaction pooler** connection string (port 6543) as `DATABASE_URL`.
6. Bootstrap the first admin: insert a `user_roles` row for the admin user via the SQL editor (service role only).

## 2. Cloudflare resources [REQUIRES APPROVAL]
```bash
wrangler r2 bucket create projectx-source-docs       # private
wrangler r2 bucket create projectx-public-assets     # public via custom domain only
wrangler r2 bucket create projectx-user-uploads      # private
# staging: same with the -staging suffix
wrangler r2 bucket cors put projectx-public-assets --file infra/cloudflare/r2-cors.json        # edit the origins first
wrangler r2 bucket lifecycle add ...   # apply rules from infra/cloudflare/r2-lifecycle.json (dashboard or API; verify current wrangler syntax)
```
Never enable the public `r2.dev` URL on the private buckets. Attach `assets.<domain>` to `projectx-public-assets` (dashboard, Custom domains).

## 3. Secrets [REQUIRES APPROVAL]
```bash
cd apps/api
wrangler secret put DATABASE_URL --env staging           # transaction pooler URL (:6543)
wrangler secret put SIGNING_SECRET --env staging         # openssl rand -hex 32
wrangler secret put IP_HASH_SECRET --env staging         # openssl rand -hex 32
wrangler secret put CF_API_TOKEN_PURGE --env staging     # only if CACHE_PURGE_DRIVER is zone_api or both
wrangler secret put SUPABASE_JWT_SECRET --env staging    # only if AUTH_MODE=hs256
```
Repeat for `--env production` with different values. `GEMINI_API_KEY` and `R2_*` S3 keys stay on the operator machine only.

## 4. Configure vars [REQUIRES APPROVAL to commit real values]
Fill the empty `[env.<name>.vars]` entries in `apps/api/wrangler.toml`: `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`,
`CORS_ALLOWED_ORIGINS` (exact Owner A origins, no wildcard), `PUBLIC_ASSETS_BASE_URL`, `FILES_BASE_URL`, `CF_ZONE_ID`.
Production must have `AUTH_MODE` of `jwks` or `hs256` (never `test`), `ENABLE_API_DOCS=false`.
Workers Caching unavailable? set `CACHE_MODE="cache_api"` and `CACHE_PURGE_DRIVER="zone_api"` (see `infra/cloudflare/cache-rules.md`).

## 5. Deploy staging [REQUIRES APPROVAL]
```bash
cd apps/api && wrangler deploy --env staging
```
No route is configured, so staging is reachable only on the `workers.dev` URL if you enable `workers_dev = true`
(currently `false`). Attaching `api-staging.<domain>` is a DNS/route change: add `routes = [{ pattern = "api-staging.<domain>", custom_domain = true }]` under `[env.staging]` **only after approval**.

Smoke test: `GET /api/v1/health` -> `ok` with `db: ok`; `GET /api/v1/public/questions/<slug>` twice, second shows cache hit
(`cf-cache-status: HIT`, or `X-Edge-Cache: HIT` in cache_api mode); an authenticated route returns `Cache-Control: private, no-store`;
repeat a rate-limited route > limit -> 429 with `Retry-After`.

## 6. Production [REQUIRES APPROVAL]
1. Repeat sections 1 to 4 with production values (separate Supabase project recommended).
2. DNS: `api.<domain>` proxied (orange cloud) to the Worker custom domain; `assets.<domain>` custom domain on the public bucket. [REQUIRES APPROVAL]
3. `wrangler deploy --env production` [REQUIRES APPROVAL].
4. WAF backstop and cache rules: `infra/cloudflare/waf-rate-limit-rule.md`, `cache-rules.md` [REQUIRES APPROVAL].
5. Optional: Cloudflare Access on `/api/v1/admin/*` as an extra layer.
6. Do not load `supabase/fixtures` (demo questions) in production.

## 7. Operations
* Cache purge after taxonomy edits: `npm run cache:purge -w @projectx/edge -- --tags tax` [REQUIRES APPROVAL, calls live API].
* Weekly: `infra/cloudflare/usage-runbook.md`; weekly backup: `infra/cloudflare/backup-runbook.md`.
* Rollback: `wrangler rollback --env production` [REQUIRES APPROVAL]; database rollbacks are forward-fix migrations only.
* Upgrade triggers: `docs/COST_STRATEGY.md` section 5.
* Hyperdrive: create a config pointing at the direct DB URL, uncomment `[[hyperdrive]]` in `wrangler.toml` [REQUIRES APPROVAL].

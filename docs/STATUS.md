# ProjectX status, 2026-11-15

> **Superseded for current status (2026-11-17):** see `docs/LAUNCH_READINESS.md` (what is done, blocked and pending),
> `docs/PRODUCTION_SETUP.md` (deploy and Supabase steps, including Google sign-in) and `docs/API_CONTRACTS.md` §3.8–3.9
> (problem set and study plans). Hosting is Cloud Run for both API and web; the Cloudflare notes below are historical.

Branch `integration/web-api` (local only; NOT pushed). Backend milestones M0-M5 (Owner B) and the web/API integration
(INTEGRATION_PLAN phases) are built and verified **locally on PGlite with mocks**. Nothing has been applied to or run against
a real Supabase or Cloudflare account.

## State
* **Database:** migrations `0001`-`0015` in `supabase/migrations/` (0014 publication-guard hardening, 0015 profile class level / session UI).
  Applied only to local PGlite / local Postgres.
* **Backend:** API (Hono, `apps/api`), edge helpers, AI pipeline and Python workers as in the M0-M5 milestones.
* **Web/API integration (done, commit `4d86446`):** typed API client, adapters, Supabase auth, practice sessions, public pages, revalidation webhook
  route (`/api/revalidate/`). Data source is switchable (`NEXT_PUBLIC_DATA_SOURCE=mock|api`).
* **Cloud setup prepared, not run:** OpenNext-on-Cloudflare config for the web app (`open-next.config.ts`, root `wrangler.jsonc`,
  `@opennextjs/cloudflare` 1.20.17 + `wrangler` 4.156.0, scripts `preview:web` / `upload:web` / `deploy:web[:staging|:production]`), CSP headers in
  `next.config.ts` (enforced frame/base/object/form directives; `script-src` is Report-Only), rewritten `docs/DEPLOYMENT.md`, owner-facing
  `docs/CLOUD_SETUP_CHECKLIST.md`, `docs/DEPLOY_FACTS.md` (sourced facts, verified vs unverified).

## Verified (actual runs)
* 2026-11-15: `npm run typecheck` (all workspaces) and `npm run typecheck:web` pass; `npm test -w @projectx/edge` passes (40 tests, includes the
  `.env.example` completeness check). `open-next.config.ts` type-checks standalone.
* Earlier (2026-11-14, before integration): contracts 10, shared 36, edge 30, db 246, ai 124, api 39 (TS); Python 99 passed / 2 skipped;
  ruff clean; OpenAPI 3.1 (57 paths, 61 ops); `wrangler deploy --dry-run` for the API OK; ingestion e2e on local Postgres (synthetic PDF -> 5 questions).
  These counts were not re-run in this pass.
* Opus review of the backend: no blockers; 4 HIGH + 5 MED findings fixed (migration 0014, API/AI hardening).

## Known issues
1. **Flaky test:** a flaky test is known to the team but is not recorded in this repo (no `flaky` marker or note found). Name it here when
   identified (suspects: timing-based tests in `packages/edge` retry/sleep and session tests).
2. `createWorkersCacheInvalidator` (`packages/edge/src/invalidators.ts`) did not check `result.success` nor chunk to 100 tags (Workers Caching
   purges are limited to 5/min on every plan); another worker has uncommitted changes in that file, re-check before deploying.
3. Two source questions with byte-identical images share one `question_assets` row (needs a join table).
4. Fixture bank is bundled into the web Worker and client bundles in API mode (INTEGRATION_PLAN risk R3).
5. `.open-next/` is not in `.gitignore` or the ESLint ignores yet (needed before the first OpenNext build; owners of those files must add it).
6. SSR calls from the web Worker share one egress identity, so per-IP `RL_PUBLIC` (300/min) may throttle SSR/`next build` (risk R4).
7. `npm run build:web` was **not** re-run after adding the headers/OpenNext dependencies (other node processes were running; skipped to avoid
   disturbing `.next`).

## NOT done / needs you (blocked on access or decisions)
1. Supabase project(s) and CLI push: `supabase link <ref>` then `supabase db push --remote --yes` (CLI v3: `--remote` is mandatory). See `docs/DEPLOYMENT.md` section 1.
2. Cloudflare: Workers Paid plan, zone, R2 buckets (API + web cache), D1 tag-cache database, secrets, Custom Domains, deploys. Prior MCP token
   returned 403 on R2/Workers/zones. Every step is "REQUIRES APPROVAL".
3. Licensing: NTA source stays `reuse_permitted=false`; no real PYQs ingested or committed.
4. Syllabus seed (20/20/14 chapters) should be checked against the current NTA bulletin; Gemini model ids/prices are placeholders.
5. First admin: SQL insert into `user_roles` after the admin signs up (docs/DEPLOYMENT.md 1.6).

## Unverified (never run for real; test on staging first)
* Gemini (mock only), RapidOCR on real images, the `jwks` auth verifier (also whether a new hosted project starts on asymmetric keys).
* Supabase pooler / Hyperdrive with our per-transaction `set local role` + `set_config` RLS pattern; Hyperdrive reaching the IPv6-only direct host.
* Workers Caching purge API (feature-detected only).
* OpenNext 1.20.17: that `revalidateTag` from `/api/revalidate/` purges Next 16 `cacheComponents` / `"use cache"` entries across isolates via R2 + D1;
  that `process.env.REVALIDATE_SECRET` is readable in the deployed route; Worker bundle size and startup time (no OpenNext build/dry-run done yet).
* CSP: the Report-Only header reaching browsers unchanged on Workers; a nonce/hash plan for enforcing `script-src`.
* That SSR + JWT verification fits Workers CPU limits (Free is 10 ms; Paid assumed).
* Exact Cloudflare API token permission names for the deploy token.

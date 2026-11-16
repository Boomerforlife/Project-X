# ProjectX backend

AI-verified question bank and practice API for JEE/NEET ("LeetCode for JEE/NEET"). This repo is the backend (Owner B):
Supabase/Postgres schema, Hono API (Cloudflare Worker or Node), AI pipeline (Gemini, batch/CLI only), Python ingestion
workers, and Cloudflare edge config. Start with `docs/BRIEF.md`, then `docs/ARCHITECTURE.md`.

## Prerequisites
* Node 22.18 (`.nvmrc`), npm 10+
* Python 3.13 (for `workers/`)
* No Docker, no cloud account, no credentials needed for local development and tests

## Quickstart
```bash
npm install                      # installs all workspaces
cp .env.example .env             # PowerShell: Copy-Item .env.example .env   (safe local defaults, secrets blank)

npm run db:serve                 # local Postgres (PGlite) on 127.0.0.1:54322, migrations + seed + dev fixtures
npm run dev:api                  # API on http://localhost:8787/api/v1  (in another terminal)
curl http://localhost:8787/api/v1/health

npm run token -w @projectx/api -- --user <uuid> [--admin]   # dev JWT for authenticated routes (AUTH_MODE=test)
```
`db:serve` is single-connection: run the API with `DB_DRIVER=pglite` (own in-process DB, default for `dev:api`) or stop
other clients. See `docs/ARCHITECTURE.md` section 5.

## Tests and checks
```bash
npm run typecheck                # all workspaces
npm test                         # all TypeScript workspaces (offline, in-process PGlite)
npm run openapi                  # regenerate packages/contracts/openapi/openapi.json
npm run deploy:dry -w @projectx/api   # wrangler dry-run build of the Worker (no account, no deploy)
```

## Python workers
```powershell
python -m venv workers/.venv
workers\.venv\Scripts\python -m pip install -e "workers[dev]"
workers\.venv\Scripts\python -m pytest workers/tests -q
workers\.venv\Scripts\pxw --help
```
(POSIX: `workers/.venv/bin/...`.)

## Layout
`apps/api` (Hono API, `wrangler.toml`) · `packages/{contracts,shared,db,database-types,edge,ai}` · `supabase/` (migrations, seed, tests) ·
`workers/` (Python `pxw`) · `infra/cloudflare/` (R2 CORS/lifecycle, WAF/cache notes, runbooks) · `docs/`.

## Deployment
Nothing deploys automatically. Every Cloudflare/Supabase change is a manual, approved step: see `docs/DEPLOYMENT.md`
and `infra/cloudflare/`. Never commit secrets; `.env` and `.dev.vars` are git-ignored.


## Frontend & SEO (Person 1 / Owner A)

Next.js 16 (App Router, Cache Components) · TypeScript strict · Tailwind CSS v4 · KaTeX · Zod · Vitest.

See `CLAUDE.md`, `docs/PERSON-1-PERSON-2-INTEGRATION.md`, and `docs/api-contract-draft.md` for frontend handoff and integration details.

Main student surfaces: `/practice/` (quick start + the problem library on `/problems`), `/plan/` (diagnostic and study plan on
`/plans`, Tabby Plus), `/tests/` + `/cbt/` (papers, demo-only until PYQ papers exist). Contracts: `docs/API_CONTRACTS.md` §3.8–3.9.

Run the whole stack locally (API with an in-process database and sample questions, web against it, dev sign-in):
```bash
npm run dev:api                                   # :8787
NEXT_PUBLIC_DATA_SOURCE=api NEXT_PUBLIC_API_BASE_URL=http://localhost:8787/api/v1 API_BASE_URL=http://localhost:8787/api/v1 \
NEXT_PUBLIC_AUTH_MODE=dev DEV_TEST_JWT_SECRET=dev-test-secret-change-me-32-chars-min npm run dev:web
```
Plus features locally: grant the dev user Plus with an admin dev token via `POST /api/v1/admin/billing/entitlements`.
Without the API variables the web runs in demo mode on fixtures (everything stays in the browser).

### Frontend Commands
```bash
npm run dev:web        # http://localhost:3000
npm run build:web
npm run typecheck:web
npm run lint:web
npm run test:web
```

# TabbyPrep (ProjectX)

JEE / NEET practice platform ("LeetCode for JEE/NEET"), live at **https://tabbyprep.in**. One repo for the web app
(Next.js, Owner A) and the backend (Owner B): Supabase/Postgres schema, Hono API, AI pipeline (Gemini, batch/CLI only) and
Python ingestion workers.

Where to start:
* What is live and what is open: `docs/LAUNCH_READINESS.md`
* How it is built: `docs/ARCHITECTURE.md`, `docs/TECH_STACK.md`
* Deploying and operating it (Google Cloud Run + Firebase Hosting + Supabase): `docs/DEPLOYMENT_GCP.md`, `docs/PRODUCTION_SETUP.md`
* Payments, ads and difficulty classification: `docs/MONETIZATION_HANDOVER.md`
* API contract: `docs/API_CONTRACTS.md` and `packages/contracts` (OpenAPI in `packages/contracts/openapi/openapi.json`)
* Frontend rules and product principles: `CLAUDE.md`

## Prerequisites
* Node 22.18 (`.nvmrc`), npm 10+
* Python 3.13 (for `workers/`)
* No Docker, no cloud account, no credentials needed for local development and tests

## Quickstart (backend)
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
`src/` (Next.js web app) · `apps/api` (Hono API) · `packages/{contracts,shared,db,database-types,edge,ai,plans}` ·
`supabase/` (migrations, seed, tests) · `workers/` (Python `pxw`) · `infra/gcp/` (deploy and secret scripts) ·
`infra/cloudflare/` (legacy, unused) · `docs/`.

## Deployment
Nothing deploys automatically. Web and API run on Cloud Run (`asia-south1`, project `projectx-staging-a7k2`); the site is
served at tabbyprep.in through Firebase Hosting; the database is Supabase. Steps: `docs/DEPLOYMENT_GCP.md`.
Razorpay is in **Live** mode (real payments). Never commit secrets: `.env`, `.env.local` and `.dev.vars` are git-ignored, and
payment keys go into Secret Manager with `infra/gcp/set-razorpay-secrets.ps1`.

## Frontend & SEO (Owner A)

Next.js 16 (App Router, Cache Components) · TypeScript strict · Tailwind CSS v4 · KaTeX · Zod · Vitest.

Main student surfaces: `/practice/` (quick start + the problem library on `/problems`), `/plan/` (diagnostic and study plan on
`/plans`; free basic plan, longer plans with Plus), `/tests/` + `/cbt/` (papers), `/pricing/` (Plus passes),
`/admin/questions/` (difficulty classification, reviewers and admins). Contracts: `docs/API_CONTRACTS.md`.

Run the whole stack locally (API with an in-process database and sample questions, web against it, dev sign-in):
```bash
npm run dev:api                                   # :8787
NEXT_PUBLIC_DATA_SOURCE=api NEXT_PUBLIC_API_BASE_URL=http://localhost:8787/api/v1 API_BASE_URL=http://localhost:8787/api/v1 \
NEXT_PUBLIC_AUTH_MODE=dev DEV_TEST_JWT_SECRET=dev-test-secret-change-me-32-chars-min npm run dev:web
```
Plus features locally: grant the dev user Plus with an admin dev token via `POST /api/v1/admin/billing/entitlements`.
Without the API variables the web runs in demo mode on fixtures (everything stays in the browser).
On Windows, start `next dev` from PowerShell (Turbopack's CSS worker fails under Git Bash).

### Frontend Commands
```bash
npm run dev:web        # http://localhost:3000
npm run build:web
npm run typecheck:web
npm run lint:web
npm run test:web
```

# Production setup

Every dashboard step and credential needed to run Tabby in production, by service. Owner noted per step.
Stack (fixed, free tier): **Google Cloud Run** for the web (`projectx-web`, Next.js standalone) and the API (`projectx-api`), asia-south1 → → **Supabase** (Postgres + Auth, `gardheietftxyforposh`, ap-south-1). Payments: **Razorpay** (test mode only at launch). Scraper: **GitHub Actions**.

Secrets never go in git, chat, or any `NEXT_PUBLIC_*` variable.

## 0. Status of the connectivity check (2026-11-15)

| Check | Result |
|---|---|
| API `GET /api/v1/health` (live Cloud Run) | `{"status":"ok","db":"ok"}` |
| API taxonomy from the real database | JEE Main + 3 subjects (20/20/14 chapters) |
| Web (local, API mode) → live API: 24 public + private routes | all render (HTTP 200); chapter lists come from the live DB |
| CORS from `http://localhost:3000` | allowed (preflight 204) |
| Web billing UI → API billing (local API with billing on) | pricing renders server prices; checkout opens only with real test keys |
| Live auth E2E (2026-11-16): Supabase sign-up + password sign-in → API verifies the token → `/users/me`, PATCH profile, PUT exam preferences, bookmarks, mistakes, streak, progress | all 200 (two test accounts `e2e-test-*@tabby-e2e.dev` created; delete them in Auth → Users) |
| Practice against the live API (2026-11-16, after loading 433 questions) | sign-up → chapter session (5 questions) → graded attempts with solutions → mistakes (4) → bookmark → complete → streak/progress: all pass |
| Live API has `/billing/*`, `/analytics/*` | **no**: needs a redeploy from this branch after merge (step 2.4) |

Local dev on the Windows workstation: start `next dev` from **PowerShell**. From Git Bash, Turbopack's CSS worker dies with `0xc0000142`.

## 1. Supabase (owner: Owner B, with the user for the dashboard)

1. **Migrations.** `0001`–`0017` are applied (0016/0017 by Owner B). Ours: `0018_billing`, `0019_analytics`.
   `supabase link --project-ref gardheietftxyforposh` then `supabase db push` (the CLI uses a temporary login role; no DB password needed).
   Check: `select count(*) from billing_plans` = 4.
2. **Auth → URL configuration.** Site URL = the production web origin. Redirect URLs: `https://<prod domain>/**`, `https://projectx-web-*.run.app/**`, `http://localhost:3000/**`.
3. **Auth → providers.** Email on; decide on email confirmation (on is safer). Custom SMTP before launch (Supabase's default sender is rate-limited).
4. **JWT signing keys.** Asymmetric keys (the API verifies through JWKS, `AUTH_MODE=jwks`). Nothing to copy.
5. **API keys.** Copy the **publishable** key (`sb_publishable_…`) for the web build. Never use the secret/service-role key in the web app.
6. **First admin.** After the admin signs up: `insert into user_roles (user_id, role) values ('<auth user id>', 'ADMIN');`
7. **Backups.** Enable PITR or daily backups on the paid plan before taking payments (orders are financial records).

## 2. Google Cloud Run API (owner: Owner B)

Project `projectx-staging-a7k2`, service `projectx-api`. Runbook: `docs/DEPLOYMENT_GCP.md` (Owner B's branch).

1. **Secrets (Secret Manager) → env:** `DATABASE_URL` (transaction pooler, :6543), `SIGNING_SECRET`, `IP_HASH_SECRET`, `WEB_REVALIDATE_SECRET`, and for billing `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
2. **Plain env:** `APP_ENV=production|staging`, `AUTH_MODE=jwks`, `SUPABASE_URL=https://gardheietftxyforposh.supabase.co`, `DB_DRIVER=postgres`, `STORAGE_DRIVER=gcs` + 3 bucket names,
   `CORS_ALLOWED_ORIGINS=https://<prod domain>,https://<preview domain>`, `WEB_REVALIDATE_URL=https://<prod domain>/api/revalidate/`,
   `WEB_BASE_URL=https://<prod domain>` (parent payment links), `RAZORPAY_KEY_ID=rzp_test_…`, `FREE_FULL_PAPERS_PER_MONTH=2`. Leave `BILLING_ALLOW_LIVE` unset (live keys are refused).
3. **CPU allocation.** Deploy with `--no-cpu-throttling` (or move webhook side effects before the response). The API finishes background work (cache revalidation) after replying, and throttled CPU can stall it.
4. **Redeploy from the merged branch** so `/billing/*` and `/analytics/events` exist. Check: `GET /api/v1/billing/plans` returns 4 plans and `payments_enabled: true`.
5. **Cold starts.** Scales to zero; the first request after idle takes a few seconds. The image runs TypeScript through `tsx` at start-up; shipping compiled JS shortens that. `--min-instances=1` removes it (small cost).
6. Budget alert ≈ ₹450 stays the safety net.

## 3. Web app on Cloud Run (owner: Owner B)

Hosting decision (2026-11-16): Cloud Run, not Vercel (Vercel Hobby forbids commercial use; Pro is about $20/month).
Full runbook: **`docs/DEPLOY_WEB_CLOUD_RUN.md`** (`Dockerfile.web`, `cloudbuild.web.yaml`, build-time `NEXT_PUBLIC_*` substitutions,
`REVALIDATE_SECRET` from Secret Manager). Build-time values: `NEXT_PUBLIC_DATA_SOURCE=api`, `NEXT_PUBLIC_API_BASE_URL`,
`NEXT_PUBLIC_AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_ALLOW_INDEXING=false` (true only at launch). Never set `DEV_TEST_JWT_SECRET` or `NEXT_PUBLIC_AUTH_MODE=dev` in a deployed build.
`vercel.json` and the Cloudflare `deploy:web*` scripts remain from earlier plans and are unused.

## 4. Razorpay (owner: the user, test mode)

1. Account in **Test mode**. Settings → API Keys → generate test keys: Key Id → `RAZORPAY_KEY_ID` (public), Key Secret → Secret Manager.
2. Settings → Webhooks → add `https://<API host>/api/v1/billing/webhooks/razorpay`, secret → `RAZORPAY_WEBHOOK_SECRET`,
   events: `order.paid`, `payment.captured`, `payment.failed`, `refund.processed`.
3. Test: buy Plus Quarterly with a test card or test UPI, then check that `/billing/success/` turns "Plus is active". Resend the webhook from the dashboard; access must not double.
4. Live mode later needs KYC: the Terms / Privacy / Refund / Contact pages must be final (the drafts have `[TO FILL]` blanks) and the business details filled in. Then set `BILLING_ALLOW_LIVE=true` together with live keys.

## 5. GitHub (owner: the user)

1. The `scraper` workflow runs on pushes to `scraper`. Its **daily schedule starts once `.github/workflows/scraper.yml` is on `main`** (merge the PR).
2. Optional ingest job (off by default): repo variables `PXW_INGEST_ENABLED=true`, `GCS_PROJECT`, `GCS_BUCKET_SOURCE_DOCS`, `GCS_BUCKET_PUBLIC_ASSETS`, `GCS_BUCKET_USER_UPLOADS`; secrets `PXW_DATABASE_URL` and `GCP_SA_KEY` (JSON key of a service account with objectAdmin on the buckets). It still refuses unapproved sources.

## 6. Credentials checklist

| Credential | Where it lives | Who |
|---|---|---|
| Supabase DB password / pooler URI | Secret Manager `database-url` | Owner B |
| Supabase publishable key | Cloud Build substitution for the web image (+ local `.env.local`, git-ignored) | Owner B |
| Signing / IP-hash / revalidate secrets (≥ 32 chars) | Secret Manager (API + web `REVALIDATE_SECRET`) | Owner B |
| Razorpay test key id / secret / webhook secret | Cloud Run env / Secret Manager | User → Owner B |
| GCP service-account key (optional ingest) | GitHub secret `GCP_SA_KEY` | Owner B |
| gcloud login on this workstation | `gcloud auth login` (expired here) | User |

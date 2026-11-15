# Production setup

Every dashboard step and credential needed to run Tabby in production, by service. Owner noted per step.
Stack (fixed): **Vercel** (web, Next.js) → **Google Cloud Run** (API, `projectx-api`, asia-south1) → **Supabase** (Postgres + Auth, `gardheietftxyforposh`, ap-south-1). Payments: **Razorpay** (test mode only at launch). Scraper: **GitHub Actions**.

Secrets never go in git, chat, or any `NEXT_PUBLIC_*` variable.

## 0. Status of the connectivity check (2026-11-15)

| Check | Result |
|---|---|
| API `GET /api/v1/health` (live Cloud Run) | `{"status":"ok","db":"ok"}` |
| API taxonomy from the real database | JEE Main + 3 subjects (20/20/14 chapters) |
| Web (local, API mode) → live API: 24 public + private routes | all render (HTTP 200); chapter lists come from the live DB |
| CORS from `http://localhost:3000` | allowed (preflight 204) |
| Web billing UI → API billing (local API with billing on) | pricing renders server prices; checkout opens only with real test keys |
| Sign-in, practice session, results, bookmarks, mistakes against live API | **not run**: needs `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and questions in the DB (the DB has 0 questions) |
| Live API has `/billing/*`, `/analytics/*` | **no**: needs a redeploy from this branch after merge (step 2.4) |

Local dev on the Windows workstation: start `next dev` from **PowerShell**. From Git Bash, Turbopack's CSS worker dies with `0xc0000142`.

## 1. Supabase (owner: Owner B, with the user for the dashboard)

1. **Migrations.** Apply in order: `0016_pin_helper_search_path` (Owner B's branch), `0017_billing`, `0018_analytics`.
   `supabase link --project-ref gardheietftxyforposh` then `supabase db push`. If 0016 is already applied remotely, 0017/0018 are simply newer.
   Check: `select count(*) from billing_plans` = 4.
2. **Auth → URL configuration.** Site URL = the production web origin. Redirect URLs: `https://<prod domain>/**`, `https://<project>-*.vercel.app/**` (previews), `http://localhost:3000/**`.
3. **Auth → providers.** Email on; decide on email confirmation (on is safer). Custom SMTP before launch (Supabase's default sender is rate-limited).
4. **JWT signing keys.** Asymmetric keys (the API verifies through JWKS, `AUTH_MODE=jwks`). Nothing to copy.
5. **API keys.** Copy the **publishable** key (`sb_publishable_…`) for Vercel. Never use the secret/service-role key in the web app.
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

## 3. Vercel web app (owner: Owner B)

Build: `npm run build:web` (see `vercel.json`). Env vars, set for **Production** and **Preview** separately. `NEXT_PUBLIC_*` values are inlined at build time, so redeploy after any change.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_DATA_SOURCE` | `api` |
| `NEXT_PUBLIC_API_BASE_URL` / `API_BASE_URL` | `https://projectx-api-989800061583.asia-south1.run.app/api/v1` (or the custom API domain) |
| `NEXT_PUBLIC_AUTH_MODE` | `supabase` (never `dev` in production) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://gardheietftxyforposh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | from Supabase step 1.5 |
| `NEXT_PUBLIC_SITE_URL` | `https://<prod domain>` |
| `NEXT_PUBLIC_ALLOW_INDEXING` | `false` until the SEO checklist passes, then `true` (Production only) |
| `NEXT_PUBLIC_FEATURE_PAPERS` / `_LEADERBOARD` | `off` |
| `REVALIDATE_SECRET` | secret, equal to the API's `WEB_REVALIDATE_SECRET` |

Do **not** set `DEV_TEST_JWT_SECRET` on Vercel. The `deploy:web*` scripts in `package.json` target Cloudflare/OpenNext from the earlier plan and are not used on Vercel.

## 4. Razorpay (owner: the user, test mode)

1. Account in **Test mode**. Settings → API Keys → generate test keys: Key Id → `RAZORPAY_KEY_ID` (public), Key Secret → Secret Manager.
2. Settings → Webhooks → add `https://<API host>/api/v1/billing/webhooks/razorpay`, secret → `RAZORPAY_WEBHOOK_SECRET`,
   events: `order.paid`, `payment.captured`, `payment.failed`, `refund.processed`.
3. Test: buy Plus Quarterly with a test card or test UPI, then check that `/billing/success/` turns "Plus is active". Resend the webhook from the dashboard; access must not double.
4. Live mode later needs KYC: the Terms / Privacy / Refund / Contact pages must be final (the drafts have `[TO FILL]` blanks) and the business details filled in. Then set `BILLING_ALLOW_LIVE=true` together with live keys.

## 5. GitHub (owner: the user)

1. The `scraper` workflow runs on pushes to `scraper`. Its **daily schedule starts once `.github/workflows/scraper.yml` is on `main`** (merge the PR).
2. Optional ingest job (off by default): repo variable `PXW_INGEST_ENABLED=true`, `GCS_BUCKET_SOURCE_DOCS`; secrets `PXW_DATABASE_URL`, `GCS_HMAC_ACCESS_ID`, `GCS_HMAC_SECRET` (Cloud Storage → Settings → Interoperability → HMAC key for a service account with objectAdmin on the source-docs bucket). It still refuses unapproved sources.

## 6. Credentials checklist

| Credential | Where it lives | Who |
|---|---|---|
| Supabase DB password / pooler URI | Secret Manager `database-url` | Owner B |
| Supabase publishable key | Vercel env | Owner B (from user) |
| Signing / IP-hash / revalidate secrets (≥ 32 chars) | Secret Manager + Vercel (`REVALIDATE_SECRET`) | Owner B |
| Razorpay test key id / secret / webhook secret | Cloud Run env / Secret Manager | User → Owner B |
| GCS HMAC key (optional ingest) | GitHub secrets | Owner B |
| gcloud login on this workstation | `gcloud auth login` (expired here) | User |

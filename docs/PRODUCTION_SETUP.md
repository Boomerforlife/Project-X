# Production setup

Every dashboard step and credential needed to run Tabby in production, by service. Owner noted per step.
Stack (fixed, free tier): **Google Cloud Run** for the web (`projectx-web`, Next.js standalone) and the API (`projectx-api`), asia-south1 → → **Supabase** (Postgres + Auth, `gardheietftxyforposh`, ap-south-1). Web served at **https://tabbyprep.in** through Firebase Hosting. Payments: **Razorpay**, **Live** since 2026-11-19. Scraper: **GitHub Actions**.

Secrets never go in git, chat, or any `NEXT_PUBLIC_*` variable.

## 0. Connectivity checks (history, 2026-11-15/16)

Current status of every piece: `docs/LAUNCH_READINESS.md`.

| Check | Result |
|---|---|
| API `GET /api/v1/health` (live Cloud Run) | `{"status":"ok","db":"ok"}` |
| API taxonomy from the real database | JEE Main + 3 subjects (20/20/14 chapters) |
| Web (local, API mode) → live API: 24 public + private routes | all render (HTTP 200); chapter lists come from the live DB |
| CORS from `http://localhost:3000` | allowed (preflight 204) |
| Web billing UI → API billing (local API with billing on) | pricing renders server prices; checkout opens only with real test keys |
| Live auth E2E (2026-11-16): Supabase sign-up + password sign-in → API verifies the token → `/users/me`, PATCH profile, PUT exam preferences, bookmarks, mistakes, streak, progress | all 200 (two test accounts `e2e-test-*@tabby-e2e.dev` created; delete them in Auth → Users) |
| Practice against the live API (2026-11-16, after loading 433 questions) | sign-up → chapter session (5 questions) → graded attempts with solutions → mistakes (4) → bookmark → complete → streak/progress: all pass |
| Live API has `/billing/*`, `/analytics/*`, `/plans/*` | yes since the redeploy from `main` (2026-11-18/19) |

Local dev on the Windows workstation: start `next dev` from **PowerShell**. From Git Bash, Turbopack's CSS worker dies with `0xc0000142`.

## 1. Supabase (owner: Owner B, with the user for the dashboard)

1. **Migrations.** The live DB has 0001–0028 (0026, 0027 and 0028 applied 2026-11-20; 0028 recorded in `supabase_migrations.schema_migrations`). For a new migration, back up first (see
   `docs/MONETIZATION_HANDOVER.md` §6). `supabase link --project-ref gardheietftxyforposh` then `supabase db push`
   (the CLI uses a temporary login role; no DB password needed). Check after 0026: `select code from ad_reward_rules` returns `extra_full_paper`.
2. **Auth → URL configuration** (done). Site URL `https://tabbyprep.in`. Redirect URLs: `https://tabbyprep.in/**`, `https://projectx-staging-a7k2.web.app/**`, `https://projectx-web-*.run.app/**`, `http://localhost:3000/**`.
   The `/**` patterns already cover the Google return URL (`/login/?oauth=1&next=…`).
3. **Auth → providers.** Email on; decide on email confirmation (on is safer). Custom SMTP before launch (Supabase's default sender is rate-limited).
   **Google** (on since 2026-11-19; the button is behind the build flag `NEXT_PUBLIC_AUTH_GOOGLE=on`, Cloud Build substitution
   `_AUTH_GOOGLE=on`; the steps below are how it was set up):
   1. Google Cloud Console → APIs & Services → OAuth consent screen: External, app name "Tabby", support email, the production
      domain under authorised domains; scopes `email`, `profile`, `openid` only. Publish it (testing mode limits sign-in to test users).
   2. Credentials → Create credentials → OAuth client ID → *Web application*.
      Authorised JavaScript origins: the production web origin (and `http://localhost:3000` for local testing).
      Authorised redirect URI: **`https://gardheietftxyforposh.supabase.co/auth/v1/callback`** (Supabase's, not the web app's).
   3. Supabase → Authentication → Sign In / Providers → Google: enable, paste the client ID and client secret, save.
   4. Check: `curl -s https://gardheietftxyforposh.supabase.co/auth/v1/settings -H "apikey: <publishable key>"` shows
      `"google": true`. Then rebuild the web with `_AUTH_GOOGLE=on`: the login page shows the Google button; signing in
      returns to `/login/?oauth=1` and continues to the dashboard (new accounts go through onboarding; the profile name is
      filled from the Google account if empty).
4. **JWT signing keys.** Asymmetric keys (the API verifies through JWKS, `AUTH_MODE=jwks`). Nothing to copy.
5. **API keys.** Copy the **publishable** key (`sb_publishable_…`) for the web build. Never use the secret/service-role key in the web app.
6. **First admin.** After the admin signs up: `insert into user_roles (user_id, role) values ('<auth user id>', 'ADMIN');`
7. **Backups.** Payments are live and orders are financial records: confirm daily backups (or PITR on a paid plan) in Supabase → Database → Backups, and take one before each migration.

## 2. Google Cloud Run API (owner: Owner B)

Project `projectx-staging-a7k2`, service `projectx-api`. Runbook: `docs/DEPLOYMENT_GCP.md`. Deploy with `infra/gcp/deploy-api-staging.sh`, which sets all of the below.

1. **Secrets (Secret Manager) → env:** `DATABASE_URL` (transaction pooler, :6543), `SIGNING_SECRET`, `IP_HASH_SECRET`, `WEB_REVALIDATE_SECRET`, and for billing `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (stored with `infra/gcp/set-razorpay-secrets.ps1`).
2. **Plain env:** `APP_ENV=production|staging`, `AUTH_MODE=jwks`, `SUPABASE_URL=https://gardheietftxyforposh.supabase.co`, `DB_DRIVER=postgres`, `STORAGE_DRIVER=gcs` + 3 bucket names,
   `CORS_ALLOWED_ORIGINS` (tabbyprep.in, www, web.app, run.app web URL, localhost), `WEB_REVALIDATE_URL=<run.app web URL>/api/revalidate/`,
   `WEB_BASE_URL=https://tabbyprep.in` (parent payment links), `FREE_FULL_PAPERS_PER_MONTH=2` (default). `BILLING_ALLOW_LIVE=true` is set
   automatically by the deploy script while live keys are stored (the API refuses live keys without it). Optional `REWARDED_ADS_ENABLED=true`.
3. **CPU allocation.** Default (throttled) CPU is fine: the server waits for each request's background work before releasing the response (`DEPLOYMENT_GCP.md`, hardening).
4. **Redeploy from `main`** (after migration 0026, done 2026-11-20) adds `/entitlements`, `/rewards/*`, `/admin/classify/*` and checkout verify.
   Checks: `GET /api/v1/billing/plans` returns 4 plans and `payments_enabled: true`; `GET /api/v1/entitlements` returns 200.
5. **Cold starts.** Scales to zero; the first request after idle takes about 2 s (precompiled `dist/server.mjs`). `--min-instances=1` removes it (small cost).
6. Budget alert ≈ ₹450 stays the safety net.

## 3. Web app on Cloud Run (owner: Owner B)

Hosting decision (2026-11-16): Cloud Run, not Vercel (Vercel Hobby forbids commercial use; Pro is about $20/month).
Full runbook: **`docs/DEPLOY_WEB_CLOUD_RUN.md`** (`Dockerfile.web`, `cloudbuild.web.yaml`, build-time `NEXT_PUBLIC_*` substitutions,
`REVALIDATE_SECRET` from Secret Manager). Build-time values: `NEXT_PUBLIC_DATA_SOURCE=api`, `NEXT_PUBLIC_API_BASE_URL`,
`NEXT_PUBLIC_AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_ALLOW_INDEXING=false` (true only at launch), `NEXT_PUBLIC_AUTH_GOOGLE=on`, ad settings in `docs/MONETIZATION_HANDOVER.md` §5.
Never set `DEV_TEST_JWT_SECRET` or `NEXT_PUBLIC_AUTH_MODE=dev` in a deployed build. After each web deploy, release Firebase Hosting
(`infra/gcp/firebase-hosting.sh deploy`) to clear its CDN. `vercel.json` and the Cloudflare `deploy:web*` scripts remain from earlier plans and are unused.

## 4. Razorpay (owner: the user, **Live** since 2026-11-19)

1. Account activated (KYC done), website `https://tabbyprep.in/` approved. Live API keys generated; stored with
   `infra/gcp/set-razorpay-secrets.ps1` (run it yourself; values never in chat or git), then redeploy the API.
2. Webhooks are separate per mode. Both Test and Live have one at
   `https://projectx-api-989800061583.asia-south1.run.app/api/v1/billing/webhooks/razorpay` with `order.paid`, `payment.captured`,
   `payment.failed`, `refund.processed`; the Live one must use the secret stored in `razorpay-webhook-secret`.
3. Verified in Test mode (2026-11-19): purchase → webhook granted Plus; a duplicate `order.paid` was ignored. To do: one real ₹29
   Launch Pass purchase and refund in Live mode.
4. Back to Test mode: re-run the script with test keys and redeploy (or route traffic to revision `projectx-api-00013-qtl`).
5. Legal pages required by Razorpay are final (`src/lib/legal.ts`).

## 5. GitHub (owner: the user)

1. The `scraper` workflow runs on pushes to `scraper`. Its **daily schedule starts once `.github/workflows/scraper.yml` is on `main`** (merge the PR).
2. Optional ingest job (off by default): repo variables `PXW_INGEST_ENABLED=true`, `GCS_PROJECT`, `GCS_BUCKET_SOURCE_DOCS`, `GCS_BUCKET_PUBLIC_ASSETS`, `GCS_BUCKET_USER_UPLOADS`; secrets `PXW_DATABASE_URL` and `GCP_SA_KEY` (JSON key of a service account with objectAdmin on the buckets). It still refuses unapproved sources.

## 6. Credentials checklist

| Credential | Where it lives | Who |
|---|---|---|
| Supabase DB password / pooler URI | Secret Manager `database-url` | Owner B |
| Supabase publishable key | Cloud Build substitution for the web image (+ local `.env.local`, git-ignored) | Owner B |
| Signing / IP-hash / revalidate secrets (≥ 32 chars) | Secret Manager (API + web `REVALIDATE_SECRET`) | Owner B |
| Razorpay live key id / secret / webhook secret | Secret Manager `razorpay-key-id`, `razorpay-key-secret`, `razorpay-webhook-secret` | User (script) |
| GCP service-account key (optional ingest) | GitHub secret `GCP_SA_KEY` | Owner B |
| gcloud login on this workstation | `gcloud auth login` (works from PowerShell) | User |

# Deployment on Google Cloud (replaces the Cloudflare Workers/R2 plan for the API)
Project `projectx-staging-a7k2` (region `asia-south1`). Billing alert ≈ USD 5 (INR 450; alerts only, it does not stop spending).
* **API** = Cloud Run service `projectx-api`, image built by Cloud Build from the root `Dockerfile` (entry `apps/api/src/server.ts`).
* **Storage** = 3 private Cloud Storage buckets (`…-source-docs`, `…-public-assets`, `…-user-uploads`), public access prevention enforced.
  Opening `public-assets` for approved images is a separate, deliberate step.
* **Secrets** = Secret Manager: `database-url` (you set it with `infra/gcp/set-database-url.ps1`), `signing-secret`, `ip-hash-secret`, `web-revalidate-secret`.
* **Identity** = service account `projectx-api@…` (bucket objectAdmin on the 3 buckets, secretAccessor on its secrets).
* **No CDN purge**: Vercel/Next caches pages; the API sets Cache-Control; the web app is told to refresh via the revalidate webhook.
* **Rate limit** is per instance (in memory). Add Cloud Armor only if abuse appears.
Build: `CLOUDSDK_API_ENDPOINT_OVERRIDES_CLOUDBUILD=https://cloudbuild.googleapis.com/ gcloud builds submit . --tag asia-south1-docker.pkg.dev/projectx-staging-a7k2/projectx/api:<tag> --project projectx-staging-a7k2 --region asia-south1`
(the override is needed only if your gcloud has a regional Cloud Build endpoint configured).
Deploy: `infra/gcp/deploy-api-staging.sh <tag> <comma-separated web origins>`.
Verify: `<service url>/api/v1/health` returns `{"data":{"status":"ok",...,"db":"ok"}}`.
Auth: Supabase signs logins with asymmetric keys (JWKS verified live), so `AUTH_MODE=jwks`; no JWT secret is needed.
Python workers: later as Cloud Run Jobs using `workers/` (GCS store for `pxw` still to be written).

## Staging status (2026-11-15)
Live: `https://projectx-api-989800061583.asia-south1.run.app` (Cloud Run, revision from image `staging-2`).
Checked: `/api/v1/health` -> db ok; `/api/v1/taxonomy/exams` returns JEE Main from the Supabase project; `/users/me` and `/admin/*` return 401 without a token.
Gotcha fixed: `.gcloudignore` uses gitignore semantics, so a bare `src` also excluded `apps/api/src`; the root web app dir must be written `/src`.
Database URL = Supabase transaction pooler (port 6543) held in Secret Manager `database-url`.

## Hardening after Owner A's review (2026-11-15, image `staging-4`)
* **Background work no longer runs after the response.** `server.ts` collects each request's `waitUntil()` tasks
  (AsyncLocalStorage) and releases the response only after they settle, so Cloud Run's post-response CPU throttling
  can't stall them. Chosen over `--no-cpu-throttling` because that bills for idle CPU. Purge/webhook calls have their own timeouts.
* **Pre-compiled JS.** `npm run build -w @projectx/api` bundles `src/server.ts` to `dist/server.mjs` with esbuild
  (workspace packages inlined, npm deps external). Two-stage `Dockerfile`, runs as the `node` user, started with plain `node`.
  Deploy uses `--cpu-boost`. Measured on Cloud Run: container start to ready went from 3.4 s (tsx) to 1.7 s.
* **Shared rate limits.** Migration 0017 adds `app_private.rate_limit_windows` + `rate_limit_hit()`. `RL_WRITE`, `RL_ATTEMPTS`,
  `RL_DOUBTS`, `RL_ADMIN` count in Postgres across all instances; `RL_PUBLIC`/`RL_SEARCH` stay in memory per instance.
  Fails open if the DB call errors. Verified live: the 6th doubt POST in a minute returns 429 with `Retry-After`.
  Payment endpoints (later) should use a shared class.
* **Fetcher/ingestion can write to Cloud Storage.** `pxw --storage gcs` with `GCS_BUCKET_SOURCE_DOCS/PUBLIC_ASSETS/USER_UPLOADS`
  (optional extra `pip install -e "workers[gcs]"`). Auth = Application Default Credentials. Verified with a real put/get/delete.

## Website on Cloud Run + API from `main` (2026-11-16)
Hosting decision: commercial use (Razorpay) rules out Vercel Hobby, so the website runs on Cloud Run next to the API.
* **Web** `projectx-web` -> https://projectx-web-989800061583.asia-south1.run.app (image `web:web-staging-1`, service account
  `projectx-web@…` with access to `web-revalidate-secret` only). Build: `cloudbuild.web.yaml`; deploy: `infra/gcp/deploy-web-staging.sh`.
* **API** `projectx-api` revision from `main` (`api:staging-5`): billing and analytics endpoints live; `WEB_BASE_URL`,
  `WEB_REVALIDATE_URL`/`WEB_REVALIDATE_SECRET` and the web origin in CORS are set by `infra/gcp/deploy-api-staging.sh`.
* **Billing is OFF** until `infra/gcp/set-razorpay-secrets.ps1` stores the three Razorpay test secrets; then redeploy the API.
  Live keys stay refused unless `BILLING_ALLOW_LIVE=true`.
* Verified live: home/hub/chapter/pricing/login 200; pricing shows server prices and "Payments are not open yet";
  robots allows crawling but every page is noindex and the sitemap is empty (`NEXT_PUBLIC_ALLOW_INDEXING=false`);
  AI-checked question URLs 404; `/api/revalidate/` refuses a wrong secret (401); dev token route 404; API CORS allows the web origin.
* Build gotchas fixed: the web build prerenders against the live API, so it must be deployed AFTER the API it calls;
  it used to prerender 433 practice-only pages and hit the API's public rate limit (429) - those pages are no longer built,
  and server-side fetches now wait out 429s. `Dockerfile.web` no longer fails when there is no `public/` folder.
* Network note: if `gcloud builds submit` keeps crashing with ConnectionResetError, use the regional endpoint
  `CLOUDSDK_API_ENDPOINT_OVERRIDES_CLOUDBUILD=https://asia-south1-cloudbuild.googleapis.com/` with `--async`.

## Question ingestion (Cloud Run Job `pxw-ingest`, 2026-11-17)
Runs inside GCP (the job reaches Supabase and the buckets; a laptop may not reach the database port).
Build: `gcloud builds submit . --config cloudbuild.workers.yaml --ignore-file .gcloudignore.workers --substitutions _TAG=workers-N`
(use `CLOUDSDK_API_ENDPOINT_OVERRIDES_CLOUDBUILD=https://asia-south1-cloudbuild.googleapis.com/` and `--async` if the global endpoint drops).
1. Papers: `infra/gcp/ingest-job.sh workers-N ingest fetch --manifest workers/manifests/<file>.manifest.json --auto-promote`
2. Extract: `TASKS=3 infra/gcp/ingest-job.sh workers-N jobs run --once --max-jobs 3` (OCR on; NTA image layout auto-detected)
3. Official keys: `infra/gcp/ingest-job.sh workers-N keys nta-final --url <NTA final key PDF> --year <yyyy>`
Done so far: JEE Main 2026 Session 2 (April), 9 shifts, 675 questions as DRAFT with images in `…-source-docs`;
official NTA final key linked to 673 (2 in review: one dropped by NTA, one where any integer was accepted).
Not yet publishable: no chapter and no approved solution (needs the classify/solve step) - see the PR description.
Availability (checked on NTA's sites 2026-11-17): question papers are only online for JEE Main 2026 Session 2;
final keys exist for 2025 S1/S2 and 2026 S1/S2 without their papers; NEET has keys but no papers except 2020 scans.

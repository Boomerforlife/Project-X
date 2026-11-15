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

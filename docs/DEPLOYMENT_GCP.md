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

JEE Advanced 2016-2025 (manifest `jee-advanced-2016-2025.manifest.json`, layout `jee_adv_crop`, 20 English papers
from jeeadv.ac.in/past_qps): 1,059 questions extracted, 1,053 promoted as DRAFT (each question cropped with its
options as printed; 2016-2019 are scans read by OCR). Answers the board printed in its own booklet (2016, 2017,
2025) are linked as OFFICIAL keys - 302 so far - and are cut out of the crops. Held for review: 4 where OCR missed the
next question's marker (`POSSIBLE_MERGED_QUESTIONS`), 3 near-duplicates of earlier questions. Of the booklets with
printed answers, 4 answers list alternative option sets (kept in review, never guessed) and 6 questions had no printed
answer read (5 in the 2017 scans, 1 in 2025 Paper 2); those have no answer yet. 2020/2021 booklets print no subject names: the subject of each block is
decided from its own wording (checked by eye) or the block is flagged `SUBJECT_UNKNOWN`.
To re-extract a paper: delete its unused DRAFT rows (guarded: no attempts, never published), then enqueue
`app_private.enqueue_pipeline_job('PROCESS_DOCUMENT', 'PROCESS_DOCUMENT:<doc id>:<new suffix>', ...)` and run step 2.
Enqueue once: a second run of a "cancel queued + enqueue" script cancels the jobs the first run created.

### Question bank (2026-11-18). Priority: JEE Main and NEET; JEE Advanced is parked (drafts).
| Set | Source | Papers | Promoted (DRAFT) | Official answers |
|---|---|---|---|---|
| JEE Main 2026 April | NTA (`nta_cbt_image`) | 9 | 675 | 673 (+2 review) |
| JEE Main 2019-2025 | NTA's own CBT papers via mirror (`NTA_MIRROR`, `nta_cbt_mirror`) | 64 | 5,339 (+133 review) | 2021: 1,881; 2024: 1,154 |
| NEET 2021 (code N2), 2020 (code E5) | NTA booklets via mirror (`neet_booklet`) | 2 | 290 (+90 biology to classify) | not yet (keys exist in the Internet Archive) |
| JEE Advanced 2016-2025 | JAB (`jee_adv_crop`) | 20 | 1,053 | 302 |

Mirrors (`NTA_MIRROR`, owner-approved 2026-11-18): only NTA's own documents qualify (NTA "Question Paper Name" header /
NEET booklet cover), identity from NTA's paper name, never the file name; the mirror's watermark (large or corner images
repeated on most pages, its name in the text) is removed before cropping; mirrors' own re-typed papers are excluded.
English only: bilingual papers keep the version whose stem reads as English (OCR); unconfirmed ones are held.
Not loaded: JEE Main 2025-04-04 S1 (the copy is blank where questions should be), 4 incomplete files, 10 sets whose NTA
name has no date/shift (2023 "SET 1xx"), NEET 2022/2024 (only re-typed copies found).
Official keys: `keys nta-final` reads NTA final keys (2021 from NTA's site; 2024 from Internet Archive copies of NTA's
site with `--source NTA_MIRROR --allowed-host web.archive.org`). Answers link by NTA question/option ids.

### Custom domain (tabbyprep.in) via Firebase Hosting (2026-11-19)
Cloud Run's own domain mapping is not offered in asia-south1 and a global load balancer costs ~USD 18/month, so the
site is served through Firebase Hosting (same GCP project; Firebase was added to it), which rewrites every path to
`projectx-web` in asia-south1. Script: `infra/gcp/firebase-hosting.sh deploy | domain <d> | status <d>`.
* Live through Hosting: https://projectx-staging-a7k2.web.app ; `tabbyprep.in` (apex) and `www.tabbyprep.in` (redirects to
  the apex) are connected and go live once the registrar has these records (GoDaddy DNS):
  `A @ 199.36.158.100` (replacing GoDaddy's parking A records), `TXT @ hosting-site=projectx-staging-a7k2`,
  `CNAME www projectx-staging-a7k2.web.app`. TLS certificates are issued automatically afterwards.
* Hosting drops cookies (except `__session`): fine, the session lives in the browser and the API gets Bearer tokens.
  60 s request timeout. Hosting's CDN honours Next's `s-maxage`; running `firebase-hosting.sh deploy` again (a new release)
  clears it - do that after publishing content until revalidation also purges Hosting.
* The API stays on its run.app URL (browsers call it with CORS; no cookies), so no `api.` record is needed.
  `deploy-api-staging.sh` now defaults to `WEB_URL=https://tabbyprep.in` (links, CORS) with www, web.app and the
  run.app web URL as extra origins; the revalidate webhook goes straight to the run.app web URL.
* Web image `web-staging-5` is built with `_SITE_URL=https://tabbyprep.in` (canonical URLs), `_AUTH_GOOGLE=on`.
* Supabase Auth URL configuration: Site URL `https://tabbyprep.in`; redirect URLs `https://tabbyprep.in/**`,
  `https://projectx-staging-a7k2.web.app/**` (keep the run.app one while it is used). Google OAuth client: JS origin
  `https://tabbyprep.in` (the redirect URI stays Supabase's `/auth/v1/callback`).
* Search Console (for SEO later): add a Domain property and its TXT record; indexing stays off until content is publishable.

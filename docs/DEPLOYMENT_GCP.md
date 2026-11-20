# Deployment on Google Cloud (replaces the Cloudflare Workers/R2 plan for the API)
Project `projectx-staging-a7k2` (region `asia-south1`). Billing alert ≈ USD 5 (INR 450; alerts only, it does not stop spending).
Live (2026-11-20): API `projectx-api-00023-c4q` (image `api:staging-16`; rollback `projectx-api-00022-2pp`), web `projectx-web-00023-7t5` (image `web-ownera-20261120-3e73fd0` = `main` 3e73fd0, build with `_FEATURE_PAPERS=on _ADS=live _ADSENSE_SLOT_DISPLAY=5382495553 _ADSENSE_SLOT_INFEED=4910441008 _ADSENSE_INFEED_LAYOUT_KEY=-fb+5w+4e-db+86 _ADSENSE_SLOT_MULTIPLEX=6312433849`; previous `projectx-web-00022-kmd`; rollback `projectx-web-00014-rtc`; older: rollback `projectx-web-00010-rqb`), served at https://tabbyprep.in through Firebase Hosting.
* **API** = Cloud Run service `projectx-api`, image built by Cloud Build from the root `Dockerfile` (entry `apps/api/src/server.ts`).
* **Storage** = 3 Cloud Storage buckets (`…-source-docs`, `…-public-assets`, `…-user-uploads`). `source-docs` and `user-uploads` are private
  (public access prevention enforced). `public-assets` was opened on 2026-11-20, when the first image questions were published:
  public access prevention off and `allUsers` has `roles/storage.legacyObjectReader` (read a known object; listing the bucket is
  still refused). Only the publish path copies images there. To close it again: remove that binding and run
  `gcloud storage buckets update gs://projectx-staging-a7k2-public-assets --public-access-prevention` (image questions then break).
* **Jobs** (Cloud Run Jobs, API image, same env and secrets as the service, no Razorpay keys): `pyq-official` (publish official-key
  PYQs without AI, `docs/CONTENT_SOURCES.md` §7.1), `rate-difficulty` (difficulty from students' first attempts, live mode; Cloud Scheduler `rate-difficulty-nightly` at 03:00 IST runs it; `projectx-api@…` has `roles/run.invoker` on the job) and `publish-official` (AI route, unused). `pyq-official` and `publish-official` default to dry run.
  After changing the API image, point the jobs at it: `gcloud run jobs update <job> --image=<api image>`.
  PowerShell: quote env lists (`--update-env-vars 'A=1,B=2'`); unquoted, gcloud receives one variable `A="1 B=2"`.
* **Secrets** = Secret Manager: `database-url` (you set it with `infra/gcp/set-database-url.ps1`), `signing-secret`, `ip-hash-secret`, `web-revalidate-secret` (version 2 is the clean one: version 1 ended in a carriage return, so cache purges failed until it was replaced on 2026-11-20; the code now trims it).
* **Identity** = service account `projectx-api@…` (bucket objectAdmin on the 3 buckets, secretAccessor on its secrets).
* **Caching**: Next caches pages and is told to refresh via the revalidate webhook; the API sets Cache-Control; Firebase Hosting's CDN (in front of the web) is cleared by a new Hosting release (`infra/gcp/firebase-hosting.sh deploy`).
* **Rate limit** is per instance (in memory). Add Cloud Armor only if abuse appears.
Build: `gcloud builds submit . --config cloudbuild.api.yaml --substitutions _TAG=<tag> --project projectx-staging-a7k2 --region asia-south1`
(add `CLOUDSDK_API_ENDPOINT_OVERRIDES_CLOUDBUILD=https://asia-south1-cloudbuild.googleapis.com/` and `--async` if the global endpoint drops).
Deploy: `infra/gcp/deploy-api-staging.sh <tag> <comma-separated web origins>`.
Verify: `<service url>/api/v1/health` returns `{"data":{"status":"ok",...,"db":"ok"}}`.
Auth: Supabase signs logins with asymmetric keys (JWKS verified live), so `AUTH_MODE=jwks`; no JWT secret is needed.
Python workers: later as Cloud Run Jobs using `workers/` (the GCS store for `pxw` exists, see hardening below).

## Staging status (history, 2026-11-15)
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
* **Billing** (updated 2026-11-19): **Live**. `infra/gcp/set-razorpay-secrets.ps1` stored live keys; the API runs with
  `BILLING_ALLOW_LIVE=true` (revision `projectx-api-00014-lz5`), which `deploy-api-staging.sh` now sets automatically when the stored
  key id is `rzp_live_…`. Details: `docs/PRODUCTION_SETUP.md` §4.
* Verified live (2026-11-16): home/hub/chapter/pricing/login 200; pricing showed server prices (payments were not open yet then);
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

## Access for Owner A (2026-11-19)
Owner A uses their own Google account (no shared keys or tokens): `gcloud auth login`, then
`gcloud config set project projectx-staging-a7k2`. Full access since 2026-11-19: `editor`, `secretmanager.admin`
(reads secret values) and `resourcemanager.projectIamAdmin` on the project. `owner` itself cannot be granted from the CLI
on a project outside an organization (SOLO_MUST_INVITE_OWNERS): send it from IAM & Admin -> IAM -> Grant access; Owner A
accepts the emailed invite. The earlier deploy-only grants below are still in place:
`run.developer`, `cloudbuild.builds.editor`, `artifactregistry.reader`, `serviceusage.serviceUsageConsumer`,
`logging.viewer`, `firebasehosting.admin` (project); `iam.serviceAccountUser` on `projectx-web@`, `projectx-api@`,
`projectx-build@` only; `storage.objectAdmin` + `legacyBucketReader` on the `projectx-staging-a7k2_cloudbuild` bucket only.
Revoke in IAM & Admin -> IAM.
All builds run as `projectx-build@` (push to the `projectx` registry, write logs, read uploaded source); the default
compute account has Editor, so builds must not run as it (the `cloudbuild.*.yaml` files set `serviceAccount`).
Web builds must pass every current substitution (as on the live line above) (check the last web build's `_ADS`, `_FEATURE_PAPERS`, ad slots) and use a new `_TAG`: reusing a tag or dropping a substitution silently turns a feature off.
Redeploy:
* Web: `gcloud builds submit . --config cloudbuild.web.yaml --ignore-file .gcloudignore.web --substitutions _TAG=web-staging-N,_SITE_URL=https://tabbyprep.in,_AUTH_GOOGLE=on,_SUPABASE_PUBLISHABLE_KEY=<publishable key>`
  then `infra/gcp/deploy-web-staging.sh web-staging-N`, then `infra/gcp/firebase-hosting.sh deploy` (clears the CDN).
* API: `gcloud builds submit . --config cloudbuild.api.yaml --substitutions _TAG=staging-N`, then `infra/gcp/deploy-api-staging.sh staging-N`.
  Deploy the API before the web build (the web build prerenders against the live API).

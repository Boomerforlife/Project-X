# Deploy the web app to Cloud Run (handover for Owner B)

Decision (2026-11-16): the website runs on **Google Cloud Run**, next to the API, to stay on the free tier.
Vercel Hobby forbids commercial use and Pro is about $20/month; the Cloudflare free plan's limits (10 ms CPU, 3 MB bundle) are
too tight for server-rendered Next 16. Cloud Run's free tier (2M requests/month) covers early traffic, and commercial use is allowed.

Files (all new; the API's `Dockerfile`, `.dockerignore` and `.gcloudignore` are untouched):

| File | Purpose |
|---|---|
| `Dockerfile.web` | Two-stage build: `npm ci` → `npm run build:web` → Next **standalone** server (`node server.js`, port 8080, non-root) |
| `Dockerfile.web.dockerignore` | Ignore file for that Dockerfile (BuildKit picks it up automatically) |
| `.gcloudignore.web` | Upload filter for Cloud Build (the root `.gcloudignore` excludes `/src`, which the web needs) |
| `cloudbuild.web.yaml` | Cloud Build config; build-time `NEXT_PUBLIC_*` values come in as substitutions |
| `next.config.ts` | `output: "standalone"` (verified locally: the standalone server serves every route against the live API) |

## 1. Build (once per environment: `NEXT_PUBLIC_*` values are baked into the image)

```bash
P=projectx-staging-a7k2
gcloud builds submit . --project=$P --region=asia-south1 \
  --config=cloudbuild.web.yaml --ignore-file=.gcloudignore.web \
  --substitutions=_TAG=web-staging-1,_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...,_SITE_URL=https://<web url>
```
The publishable key is public by design (it is in every browser bundle). Never pass a secret or service-role key.
For the very first deploy `_SITE_URL` can be a placeholder. After step 2, rebuild with the real `https://projectx-web-…run.app` URL (or the custom domain), because canonicals and the sitemap use it.

## 2. Deploy

```bash
gcloud run deploy projectx-web --project=$P --region=asia-south1 \
  --image=asia-south1-docker.pkg.dev/$P/projectx/web:web-staging-1 \
  --allow-unauthenticated --min-instances=0 --max-instances=3 --cpu=1 --memory=512Mi --concurrency=80 --timeout=60 \
  --set-secrets=REVALIDATE_SECRET=web-revalidate-secret:latest
```
`REVALIDATE_SECRET` must equal the API's `WEB_REVALIDATE_SECRET` (same Secret Manager secret).

## 3. Wire the API to the web

Update the `projectx-api` service:
- `CORS_ALLOWED_ORIGINS` += the web URL (and the custom domain later).
- `WEB_REVALIDATE_URL=https://<web url>/api/revalidate/` (cache refresh when content is published).
- `WEB_BASE_URL=https://<web url>` (parent payment links).
- Redeploy the API **from `main`** so `/api/v1/billing/*` and `/api/v1/analytics/events` exist. Billing stays off until the Razorpay keys are set, and the pricing page then says "Payments are not open yet".

## 4. Supabase Auth

Authentication → URL configuration: Site URL = the web URL, and add `https://<web url>/**` to the redirect URLs.

## 5. Verify

```bash
W=https://<web url>
curl -s -o /dev/null -w '%{http_code}\n' $W/                   # 200
curl -s $W/jee/ | grep -o '[0-9]* questions' | head -1          # live counts (433 questions loaded)
curl -s $W/robots.txt; curl -s $W/sitemap.xml | head            # sitemap stays empty until NEXT_PUBLIC_ALLOW_INDEXING=true
```
Then sign up in the browser, start a chapter practice, answer, finish, and check Mistakes / Bookmarks / Progress.

## Notes

- Cold start: with `--min-instances=0` the first request after idle takes a few seconds. `--min-instances=1` removes it, but it is not free.
- Cache: the Next data cache is per instance (fine at this scale). Publishing calls the revalidate webhook, which refreshes the instance it reaches; other instances refresh within the cache lifetimes (≤ 1 h for content).
- Known: unknown chapter/question slugs render the not-found page with `noindex` but HTTP 200 (streaming starts before the lookup). `/nope/`-style unknown routes return a real 404.

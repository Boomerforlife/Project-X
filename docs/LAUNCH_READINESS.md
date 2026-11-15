# Launch readiness

Snapshot 2026-11-15, branch `launch/production`. Each item sits in exactly one bucket.
Setup steps are in `docs/PRODUCTION_SETUP.md`, SEO in `docs/SEO_LAUNCH_CHECKLIST.md`, and content policy in `docs/CONTENT_SOURCES.md`.

## Done (built and tested in this branch)

| Area | What | Evidence |
|---|---|---|
| Connectivity | Web in API mode against the live Cloud Run API: all 24 main routes render; taxonomy comes from the real DB | `PRODUCTION_SETUP.md` §0 |
| Billing backend | Separate module: server-side plans and prices, Razorpay one-time Orders, signed webhook as the only path to access (idempotent, single transaction), passes stack from current expiry, refunds revoke and pull later passes earlier, ₹29 launch pass (new account, first purchase), promo codes, parent payment links, free full-paper quota (2/month), live keys refused | `apps/api/test/billing.sql.test.ts` (15 tests) |
| Admin | Orders list, refund request, promo codes, grant/revoke access (audit_log), daily analytics + revenue + signups | same tests + `apps/api/src/analytics/routes.ts` |
| Pricing UI | `/pricing/` (Free, Monthly ₹59, Quarterly ₹149 Recommended, Annual ₹499 Best value, launch pass), Razorpay Checkout, real success page (polls until the webhook confirms), cancel page, `/pay/[token]/` parent page, Account → Billing, upgrade prompt (≤ once a week, free users, never in sessions/CBT/checkout), full-paper lock screen | `next build` passes; rendered against a local billing API |
| Analytics | Cookieless aggregate counters (signups, sessions, pricing views, checkout funnel, payments); DNT/GPC honoured; revenue reported from orders, not client events | `src/lib/analytics.ts`, migration 0019 |
| Legal | Draft Terms, Privacy, Refund, Contact pages with `[TO FILL]` blanks (noindex) | `src/app/(site)/{terms,privacy,refund-policy,contact}` |
| SEO | Twitter cards, canonical/OG, sitemap = only pages with enough approved content, noindex on thin hubs/chapters, honest hub copy | `SEO_LAUNCH_CHECKLIST.md` |
| Content tools | `pxw content` validate / import / coverage: CSV/JSON/JSONL; source + licence required per row; checks duplicates (file + DB), answers, options, LaTeX structure, chapter mapping, approved source; imports land as DRAFT with provenance in audit_log; coverage by exam × year × chapter | `workers/tests/test_content_*.py` (117 tests) |
| Live content | 433 AI-generated JEE Main practice questions (physics 160, maths 161, chemistry 112; 43 chapters) published on the live DB: answers computed by template code **and** matched by an independent blind solve; labelled AI-checked, practice-only (NOINDEX, no public page); migration 0020 allows this for `AI_GENERATED` only | live E2E: sign-up → chapter session → graded attempts with solutions → mistakes, bookmarks, completion, streak, progress all pass |
| Scraper | Branch `scraper`: discovery crawler for official PDFs (NTA JEE Main + NEET, JEE Advanced archive), 240 PDFs catalogued, GitHub Actions run green, GCS storage for workers | `workers/scraper/`, Actions run on `scraper` |
| Quality | typecheck (web + all packages), ESLint, tests: web 75, api 65, db 246, contracts 10, shared 36, edge 40, ai 124, workers 244 (+ruff); `next build` OK | see PR |

## Blocked (cannot finish until something else exists)

| Item | Blocked by |
|---|---|
| Real PYQ content | Licence decision for NTA / JEE Advanced papers (sources unapproved by design) |
| Live `/billing/*` and `/analytics/events` | API redeploy from the merged branch (Owner B) |
| Scraper daily schedule | Workflow file must be on `main` (merge the PR) |
| Indexing | Content (≥ 5 published, solved questions per chapter) + domain |

## Needs you (decisions or actions only you can take)

1. Test the whole suite locally (see the PR / `PRODUCTION_SETUP.md`), and on Cloud Run once Owner B deploys the web.
2. Set up Razorpay test keys when ready (`PRODUCTION_SETUP.md` §4).
3. Decide the refund window and eligibility (the refund page has a blank for it).
4. Pick the production domain.
5. Content: replace or extend the AI-checked bank with editorial or licensed questions through `pxw content import`.

## Needs credentials

| Credential | For |
|---|---|
| Razorpay **test** key id, key secret, webhook secret | Payments on staging |
| `GCP_SA_KEY` + `PXW_DATABASE_URL` (optional) | Scraper ingest job |
| `REVALIDATE_SECRET` / `WEB_REVALIDATE_SECRET` pair | Cache refresh on publish |

## Needs legal

- Fill in and sign off Terms, Privacy, Refund, Contact (company name, address, GSTIN if any, grievance officer, jurisdiction, effective date). Razorpay KYC needs these pages live.
- Minors (DPDP Act): verifiable parental consent mechanism before processing under-18 data at scale; payments by minors go through the parent link and the Terms clause.
- Written permission or a legal opinion before ingesting or publishing NTA / JEE Advanced papers.
- GST: whether prices include GST and invoice requirements.

## For Owner B

Done by Owner B after the review (merged into this branch from `ownerBkamain`): leaked `.env.local`/`.vercel`/`supabase/.temp` untracked and ignored, background work finishes before responding, precompiled API bundle, shared Postgres rate limits (`0017_shared_rate_limits`), GCS store for the workers.

Still open:
1. The removed `.env.local` is still in the public git **history**. The Vercel OIDC token in it is short-lived, but rotate or confirm expiry.
2. Redeploy the API from `main` (billing + analytics routes) and add the web origin to `CORS_ALLOWED_ORIGINS` (`PRODUCTION_SETUP.md` §2).
3. Deploy the web to Cloud Run: `docs/DEPLOY_WEB_CLOUD_RUN.md`.
4. Supabase Auth URL configuration for the web URL.

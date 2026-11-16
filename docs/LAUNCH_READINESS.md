# Launch readiness

Snapshot 2026-11-17, branch `main`. Each item sits in exactly one bucket.
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
| Problem library | `/practice/` lists Owner B's problem set (`/problems*`): chapter groups in syllabus order with solved progress, an All view, difficulty / status / text filters in the URL, today's problem, "pick one for me"; maths rendered with KaTeX; opening a problem starts a one-question Learning session graded by the server; works at 360 px | local API run: solve → row shows Solved; live API returns 94 problems (60 Easy, 34 Medium, 0 Hard) |
| Study plans (Plus) | `packages/plans` algorithm (diagnostic assembly, per-chapter bands, spaced day-by-day plan, re-plan on read), API `/plans/*` + migration 0024, web `/plan/` (setup → diagnostic → report → plan). Diagnostic + top-3 report free; full report, plan and plan items Plus, enforced by the API | `packages/plans` 23 tests, `apps/api/test/plans.sql.test.ts` 7 tests, local end-to-end run (free path shows upsell; Plus path builds a plan and starts sessions) |
| Google sign-in (code) | "Continue with Google" on login and signup through Supabase OAuth (Owner B), behind `NEXT_PUBLIC_AUTH_GOOGLE`; Google mark on the button and profile name filled from the Google account (Owner A) | typecheck/lint; provider still off in Supabase (see Needs you) |
| Quality | typecheck (web + all packages), ESLint, tests: web 75, api 87, db 254, contracts 10, plans 23, shared 36, edge 40, ai 124, workers 244 (+ruff); `next build` OK | see commits on `main` |

## Blocked (cannot finish until something else exists)

| Item | Blocked by |
|---|---|
| Real PYQ content | Licence decision for NTA / JEE Advanced papers (sources unapproved by design) |
| Live `/billing/*`, `/analytics/events`, `/plans/*` | Migration 0024 + API redeploy from `main` (Owner B). Until then `/plan/` on the live site says plans aren't switched on |
| Hard questions in the library and diagnostics | Content: the bank has 0 Hard (the UI says so; the diagnostic moves the Hard share to Medium and states it) |
| Readable titles for every problem | Backend excerpt field (contract item C1 in the design doc); some auto titles lose their maths, the UI shows "open to read" for those |
| Indexing | Content (≥ 5 published, solved questions per chapter) + domain |

## Needs you (decisions or actions only you can take)

1. Test the whole suite locally (see the PR / `PRODUCTION_SETUP.md`), and on Cloud Run once Owner B deploys the web.
2. Set up Razorpay test keys when ready (`PRODUCTION_SETUP.md` §4).
3. Decide the refund window and eligibility (the refund page has a blank for it).
4. Pick the production domain.
5. Content: replace or extend the AI-checked bank with editorial or licensed questions through `pxw content import`.
6. Google sign-in: create the OAuth client in Google Cloud Console and switch the provider on in Supabase (`PRODUCTION_SETUP.md` §1.3), then rebuild the web with `_AUTH_GOOGLE=on`.
7. Decide whether `study_plan` goes into `billing_plans.features` (and the pricing copy) when the API with `/plans` is live.

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
2. Apply migration `0024_study_plans`, redeploy the API from `main` (billing, analytics, problems, plans routes) and add the web origin to `CORS_ALLOWED_ORIGINS` (`PRODUCTION_SETUP.md` §2). Review `apps/api/src/plans/` (additive module by Owner A).
3. Deploy the web to Cloud Run: `docs/DEPLOY_WEB_CLOUD_RUN.md`.
4. Supabase Auth URL configuration for the web URL.
5. Rebuild and redeploy the web from `main` (problem library, `/plan/`, Google button).
6. Contract items from the plans design doc: C1 problem excerpt with LaTeX kept; C4 per-chapter totals on `/problems/summary`.

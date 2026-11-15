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
| Analytics | Cookieless aggregate counters (signups, sessions, pricing views, checkout funnel, payments); DNT/GPC honoured; revenue reported from orders, not client events | `src/lib/analytics.ts`, migration 0018 |
| Legal | Draft Terms, Privacy, Refund, Contact pages with `[TO FILL]` blanks (noindex) | `src/app/(site)/{terms,privacy,refund-policy,contact}` |
| SEO | Twitter cards, canonical/OG, sitemap = only pages with enough approved content, noindex on thin hubs/chapters, honest hub copy | `SEO_LAUNCH_CHECKLIST.md` |
| Content tools | `pxw content` validate / import / coverage: CSV/JSON/JSONL; source + licence required per row; checks duplicates (file + DB), answers, options, LaTeX structure, chapter mapping, approved source; imports land as DRAFT with provenance in audit_log; coverage by exam × year × chapter | `workers/tests/test_content_*.py` (117 tests) |
| Scraper | Branch `scraper`: discovery crawler for official PDFs (NTA JEE Main + NEET, JEE Advanced archive), 240 PDFs catalogued, GitHub Actions run green, GCS storage for workers | `workers/scraper/`, Actions run on `scraper` |
| Quality | typecheck (web + all packages), ESLint, tests: web 75, api 65, db 246, contracts 10, shared 36, edge 40, ai 124, workers 127+; `next build` OK | see PR |

## Blocked (cannot finish until something else exists)

| Item | Blocked by |
|---|---|
| Sign-up → practice → results → bookmarks → mistakes end to end on the live stack | Supabase publishable key in the web env **and** questions in the DB (live DB has 0 questions) |
| Real PYQ content | Licence decision for NTA / JEE Advanced papers (sources unapproved by design) |
| Live `/billing/*` and `/analytics/events` | API redeploy from the merged branch (Owner B) |
| Scraper daily schedule | Workflow file must be on `main` (merge the PR) |
| Indexing | Content (≥ 5 published, solved questions per chapter) + domain |

## Needs you (decisions or actions only you can take)

1. Send the Supabase **publishable key** and add the Vercel and localhost redirect URLs in Supabase Auth.
2. Re-login gcloud on this machine (`gcloud auth login`). The stored token has expired.
3. Decide the refund window and eligibility (the refund page has a blank for it).
4. Pick the production domain.
5. Content plan: editorial (owned) questions to import first, through `pxw content import`.
6. Merge the PR (this also enables the scraper schedule).
7. Tell Owner B about the review items below (we don't touch their branch).

## Needs credentials

| Credential | For |
|---|---|
| Razorpay **test** key id, key secret, webhook secret | Payments on staging |
| Supabase publishable key | Web sign-in |
| GCS HMAC key + `PXW_DATABASE_URL` (optional) | Scraper ingest job |
| `REVALIDATE_SECRET` / `WEB_REVALIDATE_SECRET` pair | Cache refresh on publish |

## Needs legal

- Fill in and sign off Terms, Privacy, Refund, Contact (company name, address, GSTIN if any, grievance officer, jurisdiction, effective date). Razorpay KYC needs these pages live.
- Minors (DPDP Act): verifiable parental consent mechanism before processing under-18 data at scale; payments by minors go through the parent link and the Terms clause.
- Written permission or a legal opinion before ingesting or publishing NTA / JEE Advanced papers.
- GST: whether prices include GST and invoice requirements.

## For Owner B (from the backend review; their branch was not touched)

1. **Urgent:** `ownerBkamain` (public repo) contains a committed `.env.local` with a `VERCEL_OIDC_TOKEN`, plus `.vercel/` and `supabase/.temp/`. Remove them from git and check nothing longer-lived leaked.
2. Cloud Run: `--no-cpu-throttling` so background work (cache revalidation) after the response completes.
3. Start-up: ship compiled JS instead of running `tsx` at runtime, to shorten cold starts.
4. Rate limiting is per instance (max 3), so the effective limit is up to 3× the configured value. Fine for launch; revisit for payment endpoints.
5. Add the Vercel origins to `CORS_ALLOWED_ORIGINS`; set the new billing env vars (`PRODUCTION_SETUP.md` §2).
6. Migrations 0017/0018 are numbered after their 0016; `packages/db/test/migrator.test.ts` will need both lists merged.

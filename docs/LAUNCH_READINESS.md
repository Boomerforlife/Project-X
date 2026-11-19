# Launch readiness

Snapshot **2026-11-19**, branch `main`. This is the one status page; each item sits in exactly one bucket.
Details live elsewhere: deploy and operations `docs/DEPLOYMENT_GCP.md`, per-service setup `docs/PRODUCTION_SETUP.md`,
billing / ads / classification `docs/MONETIZATION_HANDOVER.md`, SEO `docs/SEO_LAUNCH_CHECKLIST.md`, content policy
`docs/CONTENT_SOURCES.md`.

## What is live

| Piece | Where | State |
|---|---|---|
| Website | https://tabbyprep.in (Firebase Hosting → Cloud Run `projectx-web`, image `web-staging-7`) | Live. Built from `main` before the monetisation merge: no ad placements, no admin classification page yet |
| API | Cloud Run `projectx-api`, revision `projectx-api-00014-lz5` (image `api:staging-8`) | Live: auth, practice, problems, plans, billing, analytics. Not yet: `/entitlements`, `/rewards`, `/admin/classify` |
| Database | Supabase (Mumbai) | Migrations 0001–0025 applied. **0026 is in the repo, not applied** |
| Payments | Razorpay, **Live mode** since 2026-11-19 | Account activated, tabbyprep.in approved, live keys in Secret Manager, `BILLING_ALLOW_LIVE=true`, live webhook (4 events) |
| Ads | AdSense publisher `ca-pub-2970121715798701` | Site submitted for review 2026-11-19; verification tag live. Ads are not switched on in any build yet |
| Sign-in | Supabase Auth | Email and Google |
| Legal | `/terms/`, `/privacy/`, `/refund-policy/`, `/contact/` | Final, live. Business facts in `src/lib/legal.ts` (operator FIFO, unregistered; 5-day refund) |
| Content | Live DB | 433 published AI-checked practice questions; 7,357 draft PYQs (JEE Main 2019–2026, JEE Advanced, NEET) awaiting chapter, difficulty and solutions |

## Done (built and tested on `main`)

| Area | What | Evidence |
|---|---|---|
| Billing | Server-side plans and prices, Razorpay one-time Orders, signed webhook as the grant path plus checkout-signature verify, idempotent single-transaction grants, passes stack, partial and full refunds, ₹29 launch pass, promo codes (in-flight reservation), parent payment links, admin orders / refunds / grants | `apps/api/test/billing.sql.test.ts`, `monetization.sql.test.ts`; real Test-mode purchase verified 2026-11-19 |
| Entitlements and rewards | `GET /entitlements` (tier, ads, quotas), rewarded-ad offers with server nonces, daily / monthly caps and minimum watch time (migration 0026) | `monetization.sql.test.ts` |
| Ads | Manual AdSense units only (display, in-feed, multiplex) with a route policy (never in questions, tests, CBT, sign-in, checkout, account) and frequency caps; `ads.txt`; non-personalised by default; rewarded ads via Google Ad Manager behind `REWARDED_ADS_ENABLED` | `src/lib/ads/policy.test.ts` |
| Difficulty classification | Admin UI `/admin/questions/` (filters, bulk set, preview), provenance columns and trigger (`difficulty_source` ADMIN / AI / IMPORT) | `monetization.sql.test.ts` |
| Study plans | Diagnostic, report, day-by-day plan; free basic plan (≤ 7 days, ≤ 60 min/day, free problems), Plus up to 14 days and 120 min/day | `packages/plans` tests, `plans.sql.test.ts` |
| Problem library | `/practice/` chapter groups, filters, solved state, today's problem | live API returns problems |
| Analytics | Cookieless daily counters; DNT / GPC honoured | `src/lib/analytics.ts`, migration 0019 |
| Legal | Final Terms, Privacy (AdSense / Google cookie disclosure, DPDP rights, under-18 rules), Refund and cancellation, Contact | `src/app/(site)/{terms,privacy,refund-policy,contact}` |
| Quality | Lint and typecheck clean; tests: web 83, workspaces 596 (api, db, contracts, plans, shared, edge, ai, workers) | run on the merge commit, 2026-11-19 |

## Blocked

| Item | Blocked by |
|---|---|
| Ad placements, rewarded credits, admin classification on the live site | Apply migration 0026, then deploy the API and web from `main` (`MONETIZATION_HANDOVER.md` §6) |
| Showing ads | AdSense site approval (review takes days to weeks), then ad unit ids and `NEXT_PUBLIC_ADS=live` in the web build |
| Publishing the 7,357 draft PYQs | Chapter, difficulty and solutions per question; licence position per source (`CONTENT_SOURCES.md`) |
| Hard questions | Classification: the published bank has no Hard questions yet |
| Indexing | Enough published, solved questions per chapter |
| `www.tabbyprep.in` | www does not load yet (DNS record or its certificate); the apex works |

## Needs you

1. Make one real ₹29 Launch Pass purchase on a fresh account, confirm Plus appears, then refund it from the Razorpay dashboard. This proves the live webhook secret matches.
2. Decide whether the Plus passes granted by the Test-mode purchases (valid to mid-December) stay or are revoked.
3. When AdSense approves the site: create the display, in-feed and multiplex units and send their ids (`MONETIZATION_HANDOVER.md` §5).
4. Rewarded ads: create a Google Ad Manager account and rewarded unit, or leave them off.
5. Classify difficulty for the draft PYQs in `/admin/questions/` once 0026 is applied.

## Needs legal

- Register FIFO (planned private limited company) and then add the registered name, address, CIN / GSTIN, a named grievance officer and a courts city in `src/lib/legal.ts`.
- Minors (DPDP Rules, in force around May 2027): a guardian-consent step at sign-up. The privacy policy already states the rule; sign-up does not ask yet.
- GST: whether prices include GST, and invoices, once turnover requires registration.
- Written permission or a legal opinion before publishing NTA / JEE Advanced papers at scale.

## For Owner B

1. Apply migration `0026_classification_rewards_billing_fixes.sql` (additive; rollback SQL in its comments).
2. Redeploy the API, then the web, from `main`; add the ad build args from `MONETIZATION_HANDOVER.md` §5 to `Dockerfile.web` / `cloudbuild.web.yaml` (the publisher id now defaults in `src/lib/ads/config.ts`, so verification and `ads.txt` work without them).
3. The removed `.env.local` is still in public git history; confirm the Vercel OIDC token in it has expired.
4. Open known issues: two source questions with byte-identical images share one `question_assets` row (needs a join table); problem excerpts lose LaTeX for some auto titles (contract item C1); per-chapter totals on `/problems/summary` (C4).
5. Point `www.tabbyprep.in` at Firebase Hosting (`CNAME www projectx-staging-a7k2.web.app`).

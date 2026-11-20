# Launch readiness

Snapshot **2026-11-20 (night)**, branch `main`. This is the one status page; each item sits in exactly one bucket.
Details live elsewhere: deploy and operations `docs/DEPLOYMENT_GCP.md`, per-service setup `docs/PRODUCTION_SETUP.md`,
billing / ads / classification `docs/MONETIZATION_HANDOVER.md`, SEO `docs/SEO_LAUNCH_CHECKLIST.md`, content policy
`docs/CONTENT_SOURCES.md`.

## What is live

| Piece | Where | State |
|---|---|---|
| Website | https://tabbyprep.in (Firebase Hosting → Cloud Run `projectx-web`, revision `projectx-web-00015-mpg`, image `web-staging-14`; each question image drawn once, PR #35) | Live from `main` (PRs #24–#29): question links open the exact question, Free/Plus pricing, security headers, past-year questions with official keys, NTA/JAB credits and takedown terms. Rollback: `projectx-web-00010-rqb` (pre-PYQ) |
| API | Cloud Run `projectx-api`, revision `projectx-api-00022-2pp` (image `api:staging-15`: keyset fix, all 1,956 published questions reachable by paging; publish checks image fingerprints, PR #35; rollback `projectx-api-00021-wbc`) | Everything on `main` incl. `public_page`, premium filter, 1 MiB body cap, worker publish paths. Jobs `pyq-official`, `rate-difficulty` (live mode; nightly schedule needs one IAM grant, see Needs you) and `publish-official` (dry run). Rewarded credits off |
| Database | Supabase (Mumbai) | Migrations 0001–0027 applied (0026 and 0027 on 2026-11-20; 0027: publish guard allows null difficulty for official-key PYQs, PYQs stay out of problem families, `difficulty_source` accepts STATS) |
| Payments | Razorpay, **Live mode** since 2026-11-19 | Account activated, tabbyprep.in approved, live keys in Secret Manager, `BILLING_ALLOW_LIVE=true`, live webhook (4 events) |
| Ads | AdSense publisher `ca-pub-2970121715798701` | Site submitted for review 2026-11-19; verification tag live. Ads are not switched on in any build yet |
| Sign-in | Supabase Auth | Email and Google |
| Legal | `/terms/`, `/privacy/`, `/refund-policy/`, `/contact/` | Live. Terms add NTA/JAB credit, official-key accuracy and a copyright takedown procedure (2026-11-20); footer credit; PYQ pages credit their paper. Business facts in `src/lib/legal.ts` |
| Content | Live DB | **1,956 published**: 433 AI-checked practice questions + **1,523 JEE Main previous-year questions** (2021, 2024, 2026) with the official NTA answer key, answer-only, chapter from keyword rules, difficulty not rated yet (Physics 749, Chemistry 489, Maths 718 in total). Drafts left: 2,185 keyed JEE Main without a confident chapter, 302 keyed JEE Advanced (no JEE Advanced chapters in the taxonomy), 3,347 without an official key |

**Image repair, 2026-11-20.** 692 published past-year questions showed a wrong image (953: a later re-processing run had overwritten the derived crop before publish) or a blank option (232: an identical image was already public, so the asset stayed private and the API dropped it). All 1,185 were re-cut from the source papers (every re-cut matched its recorded sha256 exactly) and moved to fresh public names (`assets/xx/<sha>-<asset id prefix>.png`, so the one-year cache on the old names does not matter). Re-audit: 5,687 of 5,687 published images match their fingerprint. Publish now refuses a changed crop and gives shared images their own key.

**Full papers, 2026-11-20 (PR #38).** `/tests/` lists **43 complete JEE Main papers** (2021: 21, 2024: 13, 2026: 9; 74-90 questions each) from `GET /public/papers` and runs them in the CBT as `PYQ_PAPER` server sessions (Free: monthly allowance enforced by the API; Plus: unlimited). Migration 0028 (applied 2026-11-20) adds a hidden `Not yet tagged` chapter per JEE Main subject; `pyq-official` with `PYQ_PAPER_ONLY=true` published the 2,185 keyed questions without a confident chapter there (paper-only: never on chapter pages, lists, counts, search or ordinary practice). 965 of them first failed the new fingerprint check (overwritten crops); their 4,301 crops were re-cut from the source papers (all matched) and they published. Live: API `projectx-api-00023-c4q` (`api:staging-16`), web `projectx-web-00018-7xh` (`web-staging-16`: `_FEATURE_PAPERS=on`, `_ADS=live` as Owner A set). Published total 4,141 (1,956 listed + 2,185 paper-only).
**Marking (PR #43, migration 0029 applied 2026-11-20):** 2021 and 2024 papers count only the best 5 answered numericals per subject (`exam_papers.numerical_counted_per_subject`; a trigger recomputes the paper session score; web results apply the same rule); 2021 numericals have no negative mark (`exam_papers.numerical_negative_marks = 0`, 629 questions corrected, applied to re-imports by trigger). Live: API `projectx-api-00024-cj5` (`api:staging-17`), web `projectx-web-00024-6fg` (`web-ownerb-20261120-marking`). Open: Moving paper-only questions to real chapters: admin questions page, chapter filter "Not yet tagged".

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
| Quality | Lint and typecheck clean; tests: web 92, api 121, db 255 (plus ai, contracts, plans, shared, edge) | run on main, 2026-11-20 |
| Previous-year publishing (no AI) | Keyword chapter classifier (100 % precision on 433 tagged questions), official answer-only publish job, migration 0027, admin bulk chapter tagging for the rest | `apps/api/test/pyq-official.sql.test.ts`, `docs/CONTENT_SOURCES.md` §7.1 |

## Blocked

| Item | Blocked by |
|---|---|
| Showing ads | AdSense site approval (review takes days to weeks), then ad unit ids and `NEXT_PUBLIC_ADS=live` in the web build |
| Remaining 2,185 keyed JEE Main PYQs | A person sets their chapter in `/admin/questions/` (filter chapter = none, bulk set), then re-run `pyq-official` with `PYQ_STEP=publish` |
| JEE Advanced PYQs (302 keyed) | JEE Advanced has no subjects/chapters in the taxonomy yet |
| 3,347 PYQs without an official key | Link NTA final keys (`keys nta-final` via `pxw-ingest`): 2025 is on NTA's site, 2019–2020 via the Internet Archive |
| Worked solutions for PYQs | Written by people (admin solutions editor), or an AI step if one is approved later |
| Difficulty for PYQs | Built: `rate-difficulty` rates from first attempts once 20+ students tried (no AI; `apps/api/src/content/difficulty-stats.ts`). Until then "not rated yet" |
| Hard questions | Classification: the published bank has no Hard questions yet |
| Indexing | Enough published, solved questions per chapter |

## Needs you

1. Make one real ₹29 Launch Pass purchase on a fresh account, confirm Plus appears, then refund it from the Razorpay dashboard. This proves the live webhook secret matches.
2. Decide whether the Plus passes granted by the Test-mode purchases (valid to mid-December) stay or are revoked.
3. When AdSense approves the site: create the display, in-feed and multiplex units and send their ids (`MONETIZATION_HANDOVER.md` §5).
4. Rewarded ads: create a Google Ad Manager account and rewarded unit, or leave them off.
5. Give your account the ADMIN or REVIEWER role (`insert into user_roles …`, `PRODUCTION_SETUP.md` §1.6), then tag the remaining PYQ chapters in `/admin/questions/` and re-run `pyq-official` (publish).
6. Spot-check a few published PYQ pages per chapter (wrong chapter → change it in the question editor; wrong question → unpublish).
7. Before switching on search indexing: decide whether PYQ pages should be indexed at all (licence risk accepted 2026-11-20, see `CONTENT_SOURCES.md` §3).
8. Done 2026-11-20: the scheduler can start `rate-difficulty` (`roles/run.invoker` for `projectx-api@…` on the job); `rate-difficulty-nightly` runs at 03:00 IST (verified with a forced run).
9. Question reports from students land in the `doubts` table as `[REPORT:reason] …`; there is no admin screen for them yet. Read them with `select created_at, question_id, body from doubts where body like '[REPORT:%' order by created_at desc`.

## Needs legal

- Register FIFO (planned private limited company) and then add the registered name, address, CIN / GSTIN, a named grievance officer and a courts city in `src/lib/legal.ts`.
- Minors (DPDP Rules, in force around May 2027): a guardian-consent step at sign-up. The privacy policy already states the rule; sign-up does not ask yet.
- GST: whether prices include GST, and invoices, once turnover requires registration.
- NTA / JEE Advanced papers: the owner chose (2026-11-20) to publish without written permission or a legal opinion, accepting the risk; credits and a takedown route are in the Terms. A legal opinion is still advisable before search indexing or paid use.

## For Owner B

1. Done 2026-11-20 (by Owner A): migration 0026 applied, API (`staging-9`) and web (`web-staging-8`) deployed from `main`.
2. Add the ad build args from `MONETIZATION_HANDOVER.md` §5 to `Dockerfile.web` / `cloudbuild.web.yaml` before AdSense units can be switched on (the publisher id defaults in `src/lib/ads/config.ts`, so verification and `ads.txt` already work). `deploy-api-staging.sh` now keeps `BILLING_ALLOW_LIVE=true` while live keys are stored.
3. The removed `.env.local` is still in public git history; confirm the Vercel OIDC token in it has expired.
4. Open known issues: two source questions with byte-identical images share one `question_assets` row (needs a join table); problem excerpts lose LaTeX for some auto titles (contract item C1); per-chapter totals on `/problems/summary` (C4).
5. Done 2026-11-19: `www.tabbyprep.in` points at Firebase Hosting and redirects to the apex.

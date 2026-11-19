# Monetisation, ads, classification: handover (2026-11-19)

Merged to `main` on 2026-11-19 (built on `feat/monetization-ads-difficulty`). Domain: `tabbyprep.in`. Deploy steps: `docs/DEPLOYMENT_GCP.md`.

> **Status 2026-11-19 (evening).** Razorpay is **Live** (real payments) on the API that is already deployed (revision `projectx-api-00014-lz5`, `BILLING_ALLOW_LIVE=true`, live webhook). **Deployed 2026-11-20:** migration 0026 applied (counts unchanged), API `staging-9` (revision `projectx-api-00015-njg`) and web `web-staging-8` from `main`, so `/entitlements`, `/rewards`, `/admin/classify`, checkout verify and the ad placements are live; ads stay off until AdSense approves and unit ids are set; rewarded credits stay off. AdSense site review was requested 2026-11-19; the verification tag and legal pages are live. Section 0 below is the audit as found before this work.

## 0. What I found first (audit)

| Area | State before this work |
|---|---|
| Live DB (Supabase `gardheietftxyforposh`, read-only check) | migrations to 0025; **433 PUBLISHED** AI-checked practice questions (262 Easy, 171 Medium, 0 Hard); **7,357 DRAFT PYQs** (JEE Main 6,014, JEE Adv 1,053, NEET 290). Every draft has subject, year and paper, but **no chapter, no topic, no difficulty, no solution** (4,010 have an answer key). The publication guard needs a difficulty, so classification is what unblocks them. 1 user. `study_plans` empty. |
| Live API | healthy; payments OFF (no Razorpay secrets); `/plans/*` 404 (API not redeployed since 0024). |
| Razorpay | Already built (0018): server prices, one-time Orders, signed + idempotent webhook as the only grant path, passes stack, refunds revoke, promo codes, parent links, free quota of 2 full papers/month. Gaps: no checkout-signature verification, partial refunds revoked the whole pass, promo cap could be beaten by concurrent checkouts. |
| Study plans | Already real (0024 + `packages/plans`): diagnostic → per-chapter mastery → day-by-day plan of real questions by chapter and difficulty, spaced revision, mistakes, ladder step-up, re-planned on every read. Gap: Plus only, nothing for free users. |
| Ads | none. |
| Admin | API had per-question PATCH; **no admin web UI at all**, no bulk edit, no unclassified filter. |

Pricing kept exactly as configured: Monthly ₹59/30 d, Quarterly ₹149/90 d (Recommended), Annual ₹499/365 d (Best value), Launch ₹29/30 d. These are prepaid passes, not auto-renewing subscriptions: "renewal" means buying another pass, which stacks after the current one. I didn't switch to Razorpay Subscriptions (recurring mandates); that is a product decision for you (section 7).

## 1. Implementation summary

**A. Built and tested**

| Feature | Where |
|---|---|
| Checkout verification: `POST /billing/orders/{id}/verify` checks the HMAC (`order_id\|payment_id`, key secret) **and** Razorpay's own payment record (captured, this order, exact amount) before granting. Shares the locked, idempotent `markPaid` with the webhook, so it can't double-grant. The webhook stays as backstop. Web calls it from the Checkout handler. | `apps/api/src/billing/*`, `src/lib/billing/checkout.ts`, `PricingPlans.tsx` |
| Partial refunds keep access (only a refund reaching the full amount revokes). The same refund id can't be counted twice. | `billing/service.ts`, `billing_orders.refunded_paise` |
| Promo cap counts other people's open checkouts (30 min), so a single-use code can't be redeemed twice concurrently | `billing/service.ts` |
| **Entitlements** `GET /entitlements` (optional auth): one server answer for tier, features, limits, ads eligibility. Fails closed (no ads) on error. | `apps/api/src/entitlements/` |
| Free **basic study plan** (≤ `FREE_PLAN_MAX_DAYS`=7 days, ≤ `FREE_PLAN_MAX_DAILY_MINUTES`=60 min/day, free problems only). Plus: 14 days / 120 min / every problem. A lapsed Plus plan longer than the free limits locks read-only as before. | `plans/routes.ts`, `plans/service.ts`, `StudyPlan.tsx` |
| **Rewarded-ad credits** engine: rules are DB rows (`ad_reward_rules`). Single-use server nonce, minimum seconds, daily and monthly caps under a per-user lock; grants only on `GRANTED`. Seeded rule: +1 full paper/month, 1/day, 3/month. The credit raises the real full-paper quota. | `apps/api/src/rewards/`, migration 0026 |
| **Admin classification**: list any status with filters (exam, subject, chapter / "no chapter", difficulty incl. **UNCLASSIFIED**, year, type, status, id/text search) and real counts; bulk set difficulty / chapter / topic (≤ 200, one transaction, rule-breaking rows skipped with reasons, audit-logged, family difficulty refreshed, caches purged); preview with the original crops via 10-minute signed URLs. Web page `/admin/questions/` (reviewer/admin; keyboard 0–3, J/K). | `apps/api/src/classify/`, `src/components/admin/ClassifyQuestions.tsx` |
| Difficulty provenance: `difficulty_source` (ADMIN/AI/IMPORT), `difficulty_set_by`, `difficulty_set_at`, kept honest by a trigger (a writer that doesn't declare itself is stored as "not recorded"). Unclassified stays `NULL`, deliberately not a new enum value, because the publication guard relies on NULL to refuse publishing. **Nothing was auto-classified.** | migration 0026 |
| **Ad manager** (web): server eligibility + placement registry + blocked routes + per-page budget (mobile 1, desktop 2) + per-session caps + in-feed spacing, overridable with `NEXT_PUBLIC_ADS_POLICY`. Never in CBT, sessions, tests, diagnostic/plan, auth, onboarding, pricing, checkout, account, admin, legal or error pages, and never inside a question or solution. | `src/lib/ads/policy.ts` (+ tests), `src/components/ads/*` |
| AdSense units: display (dashboard bottom, tests list, results bottom, notebook/progress bottom), in-feed (problem library, between rows / subject sections only), multiplex (public content pages). Labelled "Advertisement", lazy-loaded near the viewport, unfilled/blocked slots collapse, no ad-blocker nagging, non-personalised by default (audience includes minors), test mode via `data-adtest`. | `AdSlot.tsx`, `loaders.ts` |
| Rewarded ad (Google Ad Manager GPT) on the full-paper limit screen: opt-in, with "No thanks", cancel, honest outcome messages and "Go ad-free with Plus". Google's player provides the close/skip control and countdown. **No fake skip button and no simulated completion.** | `RewardedOffer.tsx`, `FullPaperLimit.tsx` |
| Free/Plus indicator in the header and mobile menu ("Plus" / "Free · Upgrade") | `TierBadge.tsx`, `NavLinks.tsx` |
| `/ads.txt` and the `google-adsense-account` meta from the publisher id (defaults to `ca-pub-2970121715798701` in `src/lib/ads/config.ts`, overridable with `NEXT_PUBLIC_ADSENSE_CLIENT`); Google ad origins in the (report-only) CSP | `src/app/ads.txt/route.ts`, `layout.tsx`, `next.config.ts` |
| Fixed a pre-existing bug: the theme-before-paint `<head>` script rendered as a throwing stub (server layout imported a string from a `"use client"` module), so the saved theme never applied before first paint. | `src/components/theme/theme-script.ts` |

**B. Implemented, waiting on credentials or account setup**: AdSense units (site approval, then unit ids), rewarded ads (Ad Manager account + rewarded unit + `REWARDED_ADS_ENABLED=true`). Razorpay live payments: done 2026-11-19.

**C. Needs your manual action**: section 5, plus classifying the 7,357 drafts (the tool is ready; the judgement is a human's).

**D. Needs Google approval**: AdSense site approval for tabbyprep.in (requested 2026-11-19); Ad Manager account approval (rewarded web inventory). Razorpay KYC and live activation: done 2026-11-19.

**E. Not done / blocked (honest list)**: see section 7.

### Advertising formats: what is and isn't possible (checked 2026-11-19)
- AdSense manual units: display, in-feed, in-article, multiplex. Implemented: display, in-feed, multiplex. In-article is not used, because ads never go inside explanations.
- **Vignette (interstitial) and anchor ads are AdSense Auto ads only.** In a single-page app they can't be kept out of the CBT/tests, so **keep Auto ads OFF**. Interstitials are deliberately not implemented.
- **Rewarded ads on the web need Google Ad Manager (GPT), not AdSense.** Google offers server-side reward verification for apps only. On the web, completion is GPT's browser event `rewardedSlotGranted`. That's why the reward is small, capped, nonce-bound and time-checked: a forged claim gains at most one extra paper a day.
- AdSense Offerwall is a Google-run content gate with no reward callback for app benefits, so it is not used.
- Skipping: rewarded ads can be closed any time in Google's player (the student just forfeits the reward); display/in-feed units never block anything.

## 2. Database changes (migration `0026_classification_rewards_billing_fixes.sql`, additive only)
- `questions`: + `difficulty_source text` (check ADMIN/AI/IMPORT), + `difficulty_set_by uuid → auth.users`, + `difficulty_set_at timestamptz`. All nullable, no default, **no existing row touched**.
- Trigger `questions_difficulty_meta` (before update of difficulty) + function `app_private.questions_difficulty_meta()`.
- Indexes: `questions_exam_unclassified_idx (exam_id, subject_id, year desc) where difficulty is null`, `questions_exam_difficulty_idx (exam_id, publication_status, difficulty)`, `questions_exam_year_paper_idx (exam_id, year desc, paper_id)`.
- `billing_orders`: + `refunded_paise integer not null default 0` (metadata-only change).
- New tables `ad_reward_rules` (seeded `extra_full_paper`) and `ad_reward_claims`, with RLS on and no client grants.
- Rollback statements are at the bottom of the migration. Generated types (`packages/database-types`) and `packages/contracts/openapi/openapi.json` are regenerated.
- Numbering: 0026 was free on `main` at `77fff97`. If Owner B lands another 0026 first, rename this file to the next number (no content depends on the number).

## 3. Testing report (all run on this branch, 2026-11-19)
| Suite | Result |
|---|---|
| API (Vitest, PGlite with real migrations) | **106 passed** (87 before; +1 auth-matrix entry, +18 new in `test/monetization.sql.test.ts`, plans tests updated for free plans) |
| DB package | 255 passed (migration list + regenerated types) |
| contracts 10 · plans 23 · edge 42 · shared 36 · ai 124 · web (Vitest) 83 (+5 ad-policy tests) | all passed (679 tests in total across suites) |
| Typecheck (all workspaces + web), ESLint (web) | clean |
| `next build` (mock data, ads test mode) | succeeds |
| Local E2E vs running API (`.local/e2e-journeys.mjs`) | **25/25**: new free user, free basic plan built and started with real questions, rewarded skip/too-fast/grant/daily cap, quota 2→3, checkout with unreal keys fails closed (503, nothing granted), server prices unchanged, Plus = ad-free + no rewards, revocation → back to free with ads, admin classify/filter/preview, non-admin refused |
| Headless browser E2E (web dev server + local API, ads test mode) | 15/16 checks. The 16th (desktop dashboard ad) was a first-compile timing artefact: the screenshot of that same run shows the unit, and the mobile and after-expiry checks pass. Verified: no ads on pricing/account/plan/limit/admin, rewarded offer with "No thanks", **Google's sample rewarded ad actually rendered** (test unit), mobile 1 unit and no horizontal scroll, Plus badge and no ads for Plus, ads return after expiry, admin keyboard classification saves. |

Payment tests covered by SQL tests with signed payloads: success, failure, invalid signature, duplicate webhook, duplicate refund, amount mismatch, partial/full refund, expiry, activation and revocation. Later (2026-11-19, deployed API): a real Razorpay **Test-mode** purchase succeeded end to end (webhook `payment.captured` granted Plus; `order.paid` idempotent). **Not yet run: a real Live-mode purchase** (checklist).
Not run: workers Python tests (no worker code changed).

## 4. Credentials you provide (never in git, never in chat)
| Credential | Where you get it | Where it goes |
|---|---|---|
| Razorpay Key Id (`rzp_test_…`, later `rzp_live_…`) | Razorpay Dashboard → Account & Settings → API Keys | Secret Manager `razorpay-key-id` via `infra/gcp/set-razorpay-secrets.ps1` → API `RAZORPAY_KEY_ID` |
| Razorpay Key Secret | same page (shown once) | `razorpay-key-secret` → `RAZORPAY_KEY_SECRET` |
| Razorpay Webhook Secret | the secret you type when adding the webhook | `razorpay-webhook-secret` → `RAZORPAY_WEBHOOK_SECRET` |
| AdSense publisher id **`ca-pub-2970121715798701`** (account created 2026-11-19 for tabbyprep.in) | AdSense → Account → Account information | Built in as the default (`src/lib/ads/config.ts`); `NEXT_PUBLIC_ADSENSE_CLIENT` / `_ADSENSE_CLIENT` only overrides it. The verification meta tag and `/ads.txt` work in every build |
| AdSense unit ids: Display, In-feed (+ layout key), Multiplex | AdSense → Ads → By ad unit | `NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY`, `…_SLOT_INFEED`, `…_INFEED_LAYOUT_KEY`, `…_SLOT_MULTIPLEX` |
| Ad Manager rewarded unit path `/NETWORK/unit` | Ad Manager → Inventory → Ad units (Out-of-page: Rewarded) | `NEXT_PUBLIC_GAM_REWARDED_UNIT`; then API `REWARDED_ADS_ENABLED=true` |

All variables are in `.env.example`.

## 5. Manual configuration
**Razorpay (done 2026-11-19, Live)**: account activated and `https://tabbyprep.in/` approved. Webhooks exist in **both** Test and Live mode (they are separate in Razorpay) at `https://projectx-api-989800061583.asia-south1.run.app/api/v1/billing/webhooks/razorpay` with `order.paid`, `payment.captured`, `payment.failed`, `refund.processed`; both must use the secret stored in `razorpay-webhook-secret`. Keys are stored by running `infra/gcp/set-razorpay-secrets.ps1` yourself (values never in chat or git), then the API is redeployed so new instances read them. The API runs with `BILLING_ALLOW_LIVE=true`. To go back to Test mode: re-run the script with test keys and route traffic to revision `projectx-api-00013-qtl`.

**AdSense**: site `tabbyprep.in` added and review requested 2026-11-19 (meta tag live) → wait for approval (days to weeks; payment details are only needed once earnings start) → create Display, In-feed and Multiplex units → **Ads → By site → Auto ads: OFF** (critical: Auto ads/vignettes can't be kept out of the CBT) → Privacy & messaging: set up the GDPR/consent message (Google's CMP; only EEA/UK traffic sees it) → keep "personalised ads" off, or leave `NEXT_PUBLIC_ADS_NPA=on` (the default).

**Google Ad Manager (only for rewarded)**: create an account (linked to AdSense) → new ad unit, Out-of-page format **Rewarded**, web → line item / AdSense backfill as offered → put the unit path in `NEXT_PUBLIC_GAM_REWARDED_UNIT`. Test first with `NEXT_PUBLIC_ADS=test` (it uses Google's sample unit). Never click your own ads.

**Supabase**: Auth URL configuration for tabbyprep.in is done (see `docs/DEPLOYMENT_GCP.md` → Custom domain).

**Owner B, two deploy files (not edited, per our boundary).** Additive; defaults keep ads off. `_ADSENSE_CLIENT` is now optional (the publisher id is built in):
```dockerfile
# Dockerfile.web: after ARG NEXT_PUBLIC_AUTH_GOOGLE=off
ARG NEXT_PUBLIC_ADS=off
ARG NEXT_PUBLIC_ADSENSE_CLIENT
ARG NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY
ARG NEXT_PUBLIC_ADSENSE_SLOT_INFEED
ARG NEXT_PUBLIC_ADSENSE_INFEED_LAYOUT_KEY
ARG NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX
ARG NEXT_PUBLIC_GAM_REWARDED_UNIT
ARG NEXT_PUBLIC_ADS_NPA=on
ENV NEXT_PUBLIC_ADS=$NEXT_PUBLIC_ADS NEXT_PUBLIC_ADSENSE_CLIENT=$NEXT_PUBLIC_ADSENSE_CLIENT \
    NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY=$NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY NEXT_PUBLIC_ADSENSE_SLOT_INFEED=$NEXT_PUBLIC_ADSENSE_SLOT_INFEED \
    NEXT_PUBLIC_ADSENSE_INFEED_LAYOUT_KEY=$NEXT_PUBLIC_ADSENSE_INFEED_LAYOUT_KEY NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX=$NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX \
    NEXT_PUBLIC_GAM_REWARDED_UNIT=$NEXT_PUBLIC_GAM_REWARDED_UNIT NEXT_PUBLIC_ADS_NPA=$NEXT_PUBLIC_ADS_NPA
```
```yaml
# cloudbuild.web.yaml: substitutions (defaults) + matching --build-arg lines
  _ADS: "off"
  _ADSENSE_CLIENT: ""
  _ADSENSE_SLOT_DISPLAY: ""
  _ADSENSE_SLOT_INFEED: ""
  _ADSENSE_INFEED_LAYOUT_KEY: ""
  _ADSENSE_SLOT_MULTIPLEX: ""
  _GAM_REWARDED_UNIT: ""
      - --build-arg=NEXT_PUBLIC_ADS=${_ADS}
      - --build-arg=NEXT_PUBLIC_ADSENSE_CLIENT=${_ADSENSE_CLIENT}
      - --build-arg=NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY=${_ADSENSE_SLOT_DISPLAY}
      - --build-arg=NEXT_PUBLIC_ADSENSE_SLOT_INFEED=${_ADSENSE_SLOT_INFEED}
      - --build-arg=NEXT_PUBLIC_ADSENSE_INFEED_LAYOUT_KEY=${_ADSENSE_INFEED_LAYOUT_KEY}
      - --build-arg=NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX=${_ADSENSE_SLOT_MULTIPLEX}
      - --build-arg=NEXT_PUBLIC_GAM_REWARDED_UNIT=${_GAM_REWARDED_UNIT}
```
To turn rewarded on, deploy the API with `REWARDED_ADS_ENABLED=true infra/gcp/deploy-api-staging.sh <tag>` (the script passes it through; it also keeps `BILLING_ALLOW_LIVE=true` automatically while live keys are stored).

## 6. Deployment sequence (code is on `main`)
1. Done 2026-11-19: merged into `main`.
2. Back up first: Supabase Dashboard → Database → Backups (confirm a recent daily backup or take one; PITR if on a paid plan). The migration is additive and has rollback SQL, but back up anyway.
3. `npx supabase link --project-ref gardheietftxyforposh` then `npx supabase db push` (applies 0026 only; don't use `config push`).
4. Check: `npx supabase db query --remote=gardheietftxyforposh --read-only "select count(*) from questions"` matches before/after (7,790), and `select code from ad_reward_rules`.
5. Owner B redeploys the API from `main` (brings `/plans`, `/entitlements`, `/rewards`, `/admin/classify`, verify), then the web with the ad build args (section 5).
6. Payments are **Live**: make one real ₹29 Launch Pass purchase on a fresh account → success page shows Plus within seconds (verify path) → Razorpay webhook delivery shows 200 → refund from the Razorpay dashboard → refund webhook → back to Free.
7. Grant yourself the REVIEWER/ADMIN role (`insert into user_roles …` as before), open `/admin/questions/`, classify a few drafts.

## 7. Outstanding issues and decisions
- **Content**: 7,357 PYQs still need chapter + difficulty + a solution + verification before publishing. The classification tool handles chapter/difficulty; solutions and verification are the existing pipeline (Owner B). Hard is still 0 in the published bank, so plans and diagnostics say so honestly.
- **Recurring subscriptions**: kept prepaid passes (your existing design). Razorpay Subscriptions (auto-debit/UPI mandates) is a separate build and a product call.
- **Rewarded ads trust limit** (above): acceptable for a one-paper reward; don't attach bigger rewards without server-verifiable inventory.
- **Ads on minors' devices**: non-personalised by default; get a legal view (DPDP) before turning that off.
- AdSense on signed-in pages: allowed, but Google can only judge content it can crawl; public hubs carry the multiplex unit.
- Owner B's deploy files need the patch in section 5 before any ad can appear in production (unit ids and `NEXT_PUBLIC_ADS`).
- Passes granted by the two Test-mode purchases on the live DB (valid to mid-December) are still active; decide whether to revoke them.
- Pre-existing dev-only warning on `/pricing/` (Next "instant shell" from `searchParams` outside Suspense). Unrelated, not changed.
- Promo `redeemed` can still exceed `max_redemptions` if two payments for codes reserved more than 30 minutes apart both complete (paid users keep access; only the count is off).

## 8. Launch checklist
- [x] Merged into `main` (2026-11-19)
- [x] Migration 0026 applied after a JSON export of the touched tables; counts unchanged (2026-11-20)
- [x] API + web redeployed from `main` (2026-11-20)
- [ ] Web rebuilt with the ad build args once AdSense units exist
- [x] tabbyprep.in live via Firebase Hosting, Supabase Auth URLs set (www still to fix)
- [x] Legal pages final (operator FIFO, 5-day refund), live 2026-11-19
- [x] Razorpay Test keys + webhook → real test purchase granted Plus (2026-11-19)
- [x] Razorpay KYC → live keys → `BILLING_ALLOW_LIVE=true` (2026-11-19)
- [ ] One real ₹29 Live purchase and refund
- [x] AdSense account, site added, review requested (2026-11-19)
- [ ] AdSense approved; Auto ads OFF; consent message on; units created; `NEXT_PUBLIC_ADS=live`; `/ads.txt` shows your pub id
- [ ] (Optional) Ad Manager rewarded unit; test with `NEXT_PUBLIC_ADS=test`; then `REWARDED_ADS_ENABLED=true`
- [ ] Spot check: no ad in CBT, practice session, tests, pricing, checkout, account, admin; Plus account sees none
- [ ] Reviewer classifies the first batch of drafts; Owner B's pipeline adds solutions; publish

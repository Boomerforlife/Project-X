# Executive Summary — Tabby Monetization Audit

Date: 2026-11-15. Based on the frontend (`feature/frontend-implementation`) and the backend/integration branch (`origin/integration/web-api`). No code was changed.

## Where the product stands

- **Built:** a polished practice platform: public SEO hubs and question pages, auth/onboarding, dashboard, chapter practice in learning and test modes, solutions with verification labels, mistake notebook, bookmarks, progress and weak areas, streaks, XP/achievements, a kitty wardrobe. The backend (Hono on Cloudflare Workers, Supabase Postgres, batch AI with SymPy verification) and the web/API integration are verified **locally only**.
- **Demo or hidden in API mode:** full papers and CBT, leaderboard, AI hints, review list, mistake categories. Doubts are stored but never answered.
- **Doesn't exist:** payments, pricing page, subscriptions/entitlements, ads, product analytics. The only hook is an unused `access_tier FREE|PREMIUM` enum on questions. "Plans" in the nav means *study plans*, which is an empty page.
- **Biggest non-technical blocker:** no real, licensed question content is in production (the NTA source is marked not reusable).

## Recommendations

**What should be free?** The whole learning loop: unlimited practice in both modes, every solution and answer, calculator/scratchpad, chapter and difficulty filters, mistake notebook, bookmarks (with notes), review list, basic results and progress (subject/chapter stats, top-5 weak chapters), streaks, XP, achievements and **2 full papers/CBT attempts per month**.

**What should be premium (Tabby Plus)?** Unlimited full papers and CBT; deep test analysis (time per question, time sinks, attempt order, accuracy by difficulty, paper-vs-paper); topic-level accuracy and mistake-category analytics; a smart revision queue (spaced repetition over mistakes); advanced practice filters and custom timed tests; unlimited AI hints when they ship; ad-free. Later add-ons: AI doubt solving (capped), personalised study plans, curated packs.

**Where should ads appear?** Only in three places in the signed-in app, one unit each: **dashboard** (below Performance), **practice results** and **paper/CBT results** (after the score summary). On public pages: below the solution on question pages, at the foot of chapter pages, and inside resource guides. **Never** in practice sessions, the CBT, between a question and its solution, onboarding, notebook, progress or account pages. Plus users see no ads.

**Which advertising model first?** **House upgrade prompts now, direct contextual sponsorships at ~10k MAU, affiliate links when the resources section has real guides.** Don't start with a third-party network in the app. The audience is mostly minors, so personalised or behavioural ads are off the table (DPDP Act §9). Network ads would show competitor coaching and low-quality creatives, and they'd earn only ₹2k–₹23k/month at 10k MAU. One direct sponsor can earn as much. Consider a non-personalised network only on high-traffic public pages, later.

**What should we charge?** Your hypothesis prices are inverted: ₹100/quarter (₹33/month) undercuts ₹500/year (₹41.7/month), so the annual plan wouldn't sell. Recommended:

| Plan | Price | Per month |
|---|---|---|
| Monthly | ₹59 | ₹59 |
| **Quarterly (default)** | **₹149** | ₹49.67 |
| Annual ("Exam year", best value) | ₹499 | ₹41.58 |
| Launch | ₹29 one-time 30-day pass, new accounts, real end date | — |

Also: a 7-day no-card trial after the first session; "give a month, get a month" referrals (access, never cash); **one plan for JEE and NEET**. Launch with **prepaid passes** (Razorpay Orders) rather than auto-renewing subscriptions, which fits students whose parents pay by UPI.

**What is the minimum viable monetization setup?**
1. `plans`, `orders`, `payment_events`, `entitlements`, `usage_quota` tables and a `has_plus()` check.
2. Razorpay one-time Orders + signature-verified, idempotent webhook as the source of truth.
3. `/users/me` returns plan, features and quota; API middleware enforces `requireFeature` / `consumeQuota`.
4. A `/pricing/` page, checkout, success/cancel pages, a billing section in Account, a parent payer link.
5. Lock states and one upgrade prompt on dashboard, results and the CBT quota.
6. Terms, Privacy, Refund and Contact pages; cookieless analytics and funnel events.

No ads in the MVP.

**What should we implement first?** In order:
1. **M0:** deploy for real, get licensed content in, ship papers/CBT server-side (backend L5) and add analytics and legal pages.
2. **M1:** the MVP setup above, with unlimited mocks as the first Plus feature.
3. **M2:** deep test analysis and the revision queue, which are what make students renew.
4. Sponsorship and affiliate only once traffic justifies them.

## Expected revenue (monthly contribution, after gateway, infra and support; excludes salaries, marketing, legal, content licensing)

| MAU | Conservative (1% convert) | Moderate (2.5%) | Optimistic (5%) |
|---|---|---|---|
| 1,000 | −₹4.6k | −₹3.5k | −₹0.8k |
| 10,000 | −₹5.2k | +₹6.7k | +₹33k |
| 50,000 | −₹6.0k | +₹53k | +₹186k |
| 100,000 | −₹10k | +₹108k | +₹374k |

Subscriptions carry the business in every scenario. Ads become a real second line only from ~50k MAU. Conversion rate is the lever that matters most, so invest in mocks and analytics quality rather than ad load. All inputs are assumptions until analytics exists (REVENUE_MODEL §2).

## Major risks

1. **Content licensing.** Without real PYQs, conversion and SEO traffic stay near zero.
2. **Minors' data (DPDP).** Verifiable parental consent compliance is reported as due May 2027, and targeted ads to children are banned. Get legal review before ads or payments launch.
3. **Low conversion at low prices.** At 1% conversion the business is loss-making at every scale modelled.
4. **Trust erosion.** Ads near solutions, or paywalls on essentials, would undercut the "serious, calm" positioning that is the product's edge.
5. **Seasonality.** Demand spikes around Jan/Apr/May exam windows. Expect churn after results; annual and quarterly passes help.
6. **Free competitors.** PYQ apps (e.g. MARKS) give PYQs free. Plus must sell analysis and mocks, not access.
7. **Unverified infrastructure.** Nothing has run on real Supabase/Cloudflare yet; costs are estimates.

## Documents
`PRODUCT_AUDIT.md` · `ADVERTISING_AUDIT.md` · `PREMIUM_FEATURES.md` · `PRICING_STRATEGY.md` · `REVENUE_MODEL.md` · `MONETIZATION_ARCHITECTURE.md` · `IMPLEMENTATION_ROADMAP.md`

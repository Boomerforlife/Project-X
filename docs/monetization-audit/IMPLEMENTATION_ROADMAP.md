# Implementation Roadmap

Complexity: **S** ≤ 2 dev-days, **M** 3–7, **L** 1–3 weeks, **XL** > 3 weeks (one experienced developer; rough). "P1" = Person 1 (frontend/SEO), "P2" = Person 2 (backend).

## M0 — Prerequisites (before charging anyone)

| Item | Owner | Size | Why it blocks monetization |
|---|---|---|---|
| Real, licensed or original question bank in production (`STATUS.md`: NTA source `reuse_permitted=false`, nothing ingested) | P2 + founders | XL | Nobody pays for sample questions |
| Deploy Supabase + Cloudflare (all steps in `CLOUD_SETUP_CHECKLIST.md` still pending) | P2 | M | No live product |
| Backend L5: papers + CBT server-side (currently demo-only) | P2 | L | Unlimited mocks is the main Plus value |
| Backend L3: server-side test autosave | P2 | M | Trust before paid mocks |
| Analytics: cookieless public analytics + Search Console + funnel events table | P1 + P2 | S–M | Can't validate conversion assumptions without it |
| Legal pages: Terms, Privacy, Refund & Cancellation, Contact/Grievance | P1 + founders/lawyer | M | Needed for Razorpay KYC and consumer law |
| Age band at onboarding + parental-consent plan for under-18s (DPDP compliance reported due May 2027) | P1 + P2 + lawyer | M | Affects all processing, not only payments |
| Decide final name (Tabby is a working name) and GST registration status | Founders | — | Appears on invoices and the pricing page |

## M1 — Minimum viable monetization (paid Plus, no ads)

| Item | Owner | Size | Depends on |
|---|---|---|---|
| Migrations: `plans`, `orders`, `payment_events`, `entitlements`, `promo_codes`, `usage_quota`; `has_plus()` | P2 | M | M0 deploy |
| API: `/billing/plans`, `/billing/orders`, verify, Razorpay webhook (idempotent), `/users/me` plan + features + quota | P2 | M | Razorpay account + KYC |
| `requireFeature` / `consumeQuota` middleware + `PLUS_REQUIRED` / `QUOTA_EXCEEDED` errors in contracts | P2 | S | — |
| `/pricing/` page (public, indexable), nav label "Plus"/"Pricing" | P1 | M | Plans API |
| Checkout integration, `/billing/success/`, `/billing/cancelled/`, billing section in `/account/` | P1 | M | Orders API |
| "Ask a parent to pay" payment links | P1 + P2 | S | Razorpay Payment Links |
| Lock states + upgrade prompts (dashboard A4, results/progress D3, CBT quota) | P1 | M | `/users/me` features |
| Launch offer (₹29 one-time 30-day pass) + 7-day no-card trial | P2 + P1 | S | promo_codes |
| Admin: grant/revoke entitlement, list orders, refunds via webhook | P2 | S | — |
| **First Plus features:** unlimited full papers/CBT (quota for free), ad-free flag (no-op until ads exist), advanced practice filters (backend already supports `filters`) | P1 + P2 | M | L5 |

**Exit criteria:** a real ₹29 payment in test and live mode grants Plus through the webhook alone. A replayed webhook does not double-grant. Refunds revoke access. Expiry works without cron. The paywall never appears inside `/practice/session/` or `/cbt/`.

## M2 — Premium depth (what makes people renew)

| Item | Owner | Size | Depends on |
|---|---|---|---|
| Deep test analysis: time per question, time sinks, attempt order, accuracy by difficulty/type, paper-vs-paper | P2 (aggregation endpoint) + P1 | L | L5, per-question time already stored (`time_spent_ms`) |
| Smart revision queue (spaced repetition over mistakes) | P2 + P1 | L | L1 mistake categories |
| Topic-level accuracy + mistake-category analytics + historical comparisons | P2 + P1 | M | `user_chapter_stats` extension |
| Review list server-side (L2), bookmark notes UI (backend field exists) | P2 + P1 | S–M | — |
| AI hints with free daily limit (L7, batch-generated to keep per-use cost ~0) | P2 + P1 | M | AI pipeline |

## M3 — Direct sponsorship

| Item | Owner | Size | Depends on |
|---|---|---|---|
| Migrations: sponsors, campaigns, creatives, placement_targets, placement_daily | P2 | M | — |
| `/placements`, `/placements/events`, admin CRUD + approval + report | P2 | M | — |
| `<SponsoredSlot>` + ESLint import restriction + tests ensuring no slot in focus/exam | P1 | M | API |
| Slots A1 (dashboard), B1/C3 (results) | P1 | S | above |
| Sponsor rate card, rules, and a one-page media kit (aggregate audience only) | Founders | S | ~10k MAU to be sellable |

**Trigger:** start M3 at roughly 10k MAU or when a sponsor asks, whichever comes first. Below that, revenue doesn't justify the work (REVENUE_MODEL §5).

## M4 — Referral programme

| Item | Owner | Size |
|---|---|---|
| referral_codes / referrals, qualification at 20 answered questions, entitlement reward, caps, fraud checks | P2 | M |
| Share UI on `/account/` and post-result screen (not inside sessions) | P1 | S |

## M5 — Content-led affiliate and public-page sponsorship

| Item | Owner | Size | Depends on |
|---|---|---|---|
| Publish real guides on `/resources/` (currently empty) and book recommendations per chapter | Founders/editorial + P1 | L (content) | — |
| `/go/:id` redirect + `affiliate_links` + disclosure component | P2 + P1 | S | Affiliate accounts |
| Slots E2 (chapter footer), E4 (guides) | P1 | S | M3 components |

## M6 — Optional: ad network on public SEO pages

Only if public traffic is large (e.g. hundreds of thousands of page views a month) and legal review is done. AdSense (or similar) on E1/E3 only, non-personalised with age-treatment tags, auto-ads off, lazy-loaded, CSP updated, Core Web Vitals checked before/after. Size **S–M**. Reversible with a flag.

## M7 — Recurring subscriptions

Razorpay Subscriptions (UPI Autopay, card mandates), renewal handling, halted/failed retries, pre-debit notices, one-click cancel. Size **L**. Do this once renewal data shows manual renewals are losing a meaningful share of users.

## Suggested rollout sequence

```
M0 prerequisites ──► M1 MVP Plus (passes, pricing, quota, lock states)
                         │
                         ├──► M2 premium depth (analytics, revision queue)  ← main retention driver
                         ├──► M4 referrals
                         └──► (≈10k MAU) M3 direct sponsors ──► M5 affiliate/resources ──► M6 optional network ads
                                                                     M7 subscriptions when renewal data warrants
```

Rough calendar (one person per side, part-time not assumed): M1 ≈ 3–4 weeks after M0; M2 ≈ 4–6 weeks; M3 ≈ 2–3 weeks. M0 content work is the long pole and runs in parallel.

## Open questions for the team (blocking decisions)

1. Final product name and legal entity (appears on invoices, Razorpay KYC).
2. GST registration now or at the threshold?
3. Free full-paper quota: 2/month (recommended) or another number?
4. Content licensing plan for PYQs. This determines whether public SEO pages ever carry real traffic.
5. Who answers support and refund requests?

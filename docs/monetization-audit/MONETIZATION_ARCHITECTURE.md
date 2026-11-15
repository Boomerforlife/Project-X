# Monetization Architecture (proposal)

This fits the existing stack on `integration/web-api`: Next.js 16 web app → Hono API on Cloudflare Workers → Supabase Postgres (RLS) + Supabase Auth, with R2 and edge caching. **Nothing here is implemented.** Database and API work is Person 2's; UI, gating presentation and SEO are Person 1's. Contracts must be agreed first (CLAUDE.md §14).

## 1. Principles

1. **The server decides entitlement.** The web app only renders what `/users/me` says. Every premium API response is checked in the API (and, where data lives in Postgres, by RLS or a security-definer function).
2. **The Razorpay webhook is the source of truth for payment.** The browser callback is a hint used to show "confirming…".
3. **Advertising never sees user data.** Placements are chosen from page context only. Impression/click logs hold no user IDs.
4. **Structural ad exclusion.** Ad components cannot be rendered in `(focus)` or `(exam)` route groups.
5. **Reuse what exists:** `audit_log`, admin role guards (`ADMIN`/`REVIEWER`), idempotency patterns (`client_request_id`), `usage_counters`, cache tags and the `/api/revalidate/` webhook.

## 2. Database changes (new migrations, owned by Person 2)

```sql
-- 0016_billing.sql
create type plan_interval as enum ('PASS_30D','PASS_90D','PASS_365D','MONTHLY','QUARTERLY','ANNUAL');
create type order_status  as enum ('CREATED','PAID','FAILED','REFUNDED','EXPIRED');
create type entitlement_source as enum ('PURCHASE','TRIAL','REFERRAL','PROMO','SUPPORT_GRANT');

plans(id text pk,                    -- 'plus_quarterly'
      name text, interval plan_interval, price_paise int not null, currency text default 'INR',
      duration_days int not null, active boolean default true, features text[] not null,  -- e.g. {'ad_free','analytics_advanced','cbt_unlimited'}
      created_at, updated_at)

orders(id uuid pk, user_id uuid not null references auth.users, payer_email text null,  -- payer may be a parent
       plan_id text references plans, amount_paise int, currency text,
       promo_code text null, razorpay_order_id text unique, razorpay_payment_id text unique null,
       status order_status, created_at, paid_at, refunded_at, receipt text unique)

payment_events(id text pk,           -- Razorpay event id → idempotency
               type text, razorpay_order_id text, payload jsonb, received_at, processed_at, error text)

entitlements(id uuid pk, user_id uuid not null references auth.users,
             tier text not null default 'PLUS', source entitlement_source, order_id uuid null references orders,
             starts_at timestamptz not null, ends_at timestamptz not null,
             revoked_at timestamptz null, note text, created_at)
-- index (user_id, ends_at desc) where revoked_at is null
-- Passes STACK: a new purchase starts at max(now(), current ends_at).

promo_codes(code text pk, kind text check (kind in ('LAUNCH','REFERRAL','CAMPAIGN')), discount_paise int null, percent_off int null,
            plan_ids text[], max_redemptions int, redeemed int default 0, new_users_only bool, valid_from, valid_to, active bool)
promo_redemptions(code text, user_id uuid, order_id uuid, created_at, primary key (code, user_id))

referral_codes(user_id uuid pk, code text unique, created_at)
referrals(referred_user_id uuid pk, referrer_user_id uuid, status text check (status in ('PENDING','QUALIFIED','REWARDED','REJECTED')),
          qualified_at, rewarded_at)

-- 0017_quota.sql (free-tier limits, e.g. full papers per month)
usage_quota(user_id uuid, period date, metric text, used int default 0, primary key (user_id, period, metric))

-- 0018_sponsorship.sql
sponsors(id uuid pk, name text, website text, contact_email text, notes text, active bool, created_at)
sponsor_campaigns(id uuid pk, sponsor_id uuid, name text, starts_at, ends_at, status text check (status in ('DRAFT','APPROVED','LIVE','PAUSED','ENDED')),
                  pricing_model text check (pricing_model in ('FLAT','CPM')), price_paise int, approved_by uuid, approved_at)
sponsor_creatives(id uuid pk, campaign_id uuid, headline text check (char_length(headline) <= 60),
                  body text check (char_length(body) <= 90), cta_label text, destination_url text, logo_asset_id uuid null,
                  review_status text, created_at)
placement_targets(creative_id uuid, slot text check (slot in ('dashboard_card','results_card','public_question_footer','chapter_footer','resource_block')),
                  exam_slug text null, subject_slug text null, chapter_slug text null, weight int default 1,
                  primary key (creative_id, slot, coalesce(exam_slug,''), coalesce(subject_slug,''), coalesce(chapter_slug,'')))
-- Aggregated counters only: NO user_id, NO ip.
placement_daily(day date, creative_id uuid, slot text, impressions int, clicks int, dismissals int, primary key (day, creative_id, slot))

-- 0019_affiliate.sql
affiliate_links(id text pk,          -- short id used in /go/:id
                partner text, destination_url text, label text, context text, active bool, created_at)
affiliate_daily(day date, link_id text, clicks int, primary key (day, link_id))
```

**RLS:** `entitlements`, `orders`, `usage_quota`, `referrals`: owner `SELECT` only. All writes go through the API with the service role or security-definer functions. Sponsor, campaign, creative, plan and promo tables are admin-only (RLS on, no student grants), following the pattern for editorial tables in migration `0012`.

**DB function** (used by both API and any RLS policy that needs it):
```sql
app_private.has_plus(p_user uuid) returns boolean   -- exists entitlement with now() between starts_at and ends_at and revoked_at is null
```
Expiry needs no cron. Access is a time comparison. A daily job only sends reminder emails.

## 3. API additions (names are proposals until agreed)

| Method & path | Access | Purpose |
|---|---|---|
| `GET /billing/plans` | public, cache TAXONOMY | Active plans with GST-inclusive price, features |
| `POST /billing/orders` | user, RL_WRITE | Body `{ client_request_id, plan_id, promo_code? }`. Server prices the order (never trusts a client amount), creates a Razorpay Order, returns `{ order_id, razorpay_order_id, amount, key_id }` |
| `POST /billing/orders/:id/verify` | user | Optional fast path: verifies the checkout signature (`HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)`) and grants immediately if valid; webhook remains authoritative and idempotent |
| `POST /billing/webhooks/razorpay` | public, signature required | Verifies `X-Razorpay-Signature` (HMAC-SHA256 of raw body with webhook secret), dedupes by event id in `payment_events`, handles `order.paid` / `payment.captured` → grant; `payment.failed` → mark failed; `refund.processed` → revoke or shorten. Returns 2xx fast |
| `GET /billing/orders` | user | Payment history + invoice links |
| `POST /billing/payer-links` | user | Creates a Razorpay Payment Link for a parent to pay (`notes.user_id`, plan); same webhook path |
| `GET /users/me` (extend) | user | Add `plan: { tier: 'FREE'|'PLUS', ends_at, source }`, `features: string[]`, `quota: { cbt_full_papers: { used, limit, resets_on } }` |
| `POST /users/me/trial` | user | One-time 7-day trial (guarded by a `trial_used` flag) |
| `GET /users/me/referral` / `POST /referrals/claim` | user | Referral code, status |
| `GET /placements?slot=&exam=&subject=&chapter=` | public or user | Returns one creative or `null`. **Returns `null` for Plus users.** Never accepts user identifiers beyond the auth token used for the Plus check |
| `POST /placements/events` | public, RL_PUBLIC | Batched `{ creative_id, slot, type: impression|click|dismiss }`; increments `placement_daily` |
| `GET /go/:linkId` | public | Affiliate/sponsor redirect (302), increments a daily counter, appends partner tag server-side |
| Admin: `/admin/plans`, `/admin/promo-codes`, `/admin/sponsors`, `/admin/campaigns`, `/admin/creatives` (+approve), `/admin/placements/report`, `/admin/entitlements/grant|revoke`, `/admin/orders` | admin | All mutations write `audit_log` |

**Feature gating middleware** (Hono, alongside existing guards in `apps/api/src/middleware/guards.ts`):
```ts
requireFeature('analytics_advanced')   // 402-style error code PLUS_REQUIRED with { feature }
consumeQuota('cbt_full_papers', 1)     // atomic upsert on usage_quota; 429-style QUOTA_EXCEEDED with resets_on
```
Add `PLUS_REQUIRED` and `QUOTA_EXCEEDED` to the shared error enum in `packages/contracts/src/errors.ts` so the web app can render lock states consistently.

**Caching:** all billing, entitlement and placement-for-user responses are `private, no-store`. Public HTML stays CDN-cached and identical for everyone (see §5).

## 4. Razorpay integration flow (one-time passes, phase 1)

```
Browser                     Web (Next)              API (Worker)                  Razorpay
  | click "Get Quarterly"     |                        |                              |
  |-------------------------->| POST /billing/orders ->| price from plans table       |
  |                           |                        | create Order ---------------->|
  |<----- order + key_id -----|<-----------------------| store orders(CREATED)        |
  | Razorpay Checkout (UPI/card/netbanking) ---------------------------------------->|
  |<-------------------------------------------------- handler(payment_id, signature)|
  |--> /billing/success?order=… (shows "Confirming…")  |                              |
  |   POST /billing/orders/:id/verify ---------------->| verify signature → grant     |
  |                                                    |<--- webhook order.paid ------|
  |                                                    | verify, dedupe, grant (idempotent)
  |   poll GET /users/me until plan.tier = PLUS        |                              |
```
- Keys: `RAZORPAY_KEY_ID` (public, sent to browser), `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` as Worker secrets only. Never in `NEXT_PUBLIC_*`.
- Webhook signature verification must use the **raw** request body (Hono `c.req.raw.arrayBuffer()` before JSON parsing), with a constant-time compare (Web Crypto `crypto.subtle`).
- CSP in `next.config.ts` must allow Razorpay Checkout's script/frame origins (`checkout.razorpay.com` and the API domain); verify the exact list in Razorpay docs.
- Refunds: admin-initiated through the Razorpay dashboard or API; the `refund.processed` webhook revokes or shortens the entitlement.
- Phase 2 (subscriptions): Razorpay Subscriptions with UPI Autopay / card mandates; handle `subscription.activated/charged/halted/cancelled`; pre-debit notification handled by Razorpay/NPCI rules; one-click cancel in `/account/billing`.

## 5. Advertising architecture

**Frontend components (Person 1):**
- `<SponsoredSlot slot="dashboard_card" context={{ exam, subject, chapter }} />`: a client component that renders nothing until it knows the viewer is not Plus, then fetches `/placements`, reserves fixed height, records an impression when 50% visible for 1 second (IntersectionObserver), batches events, honours the 7-day dismissal (localStorage convenience only).
- Lives in `src/components/monetization/` and may only be imported from `(app)` and `(site)` routes. Enforce with an ESLint `no-restricted-imports` rule for files under `src/app/(focus)/**`, `src/app/(exam)/**`, `src/components/practice/**`, `src/components/cbt/**`. Add a unit test that greps those paths.
- **Public CDN-cached pages:** the HTML is identical for all users and contains only an empty placeholder. Whether to fill it is decided client-side after the session check, so Plus users never see an ad and the cache never varies by user.
- If a third-party network is ever added (public pages only): load its script lazily on those routes only, after consent logic, with child-directed/age-treatment and non-personalised settings (Google's current tag is TFAT; TFUA/TFCD are deprecated) and auto-ads disabled. Update CSP accordingly.

**Frequency and visibility controls (server config per slot):** max 1 unit per page; dashboard card not on the first 2 days after signup; dismissal → hidden 7 days; global kill switch per slot (`placements_enabled` env/flag) for exam weeks.

**Reporting:** `placement_daily` → admin report (impressions, clicks, CTR per creative/day). Sponsors get aggregate reports only, and cells with fewer than 50 impressions are suppressed.

## 6. Analytics and conversion tracking

No analytics exists today. Proposal:
- **Public pages:** a cookieless, privacy-first analytics tool (e.g. Cloudflare Web Analytics) — page views and Core Web Vitals only. Search Console by DNS verification.
- **Funnel events (first-party, server-side table, internal only):** `paywall_viewed{feature}`, `pricing_viewed`, `checkout_started{plan}`, `payment_succeeded{plan}`, `payment_failed`, `trial_started`, `referral_qualified`. Stored with the internal user id for cohort analysis. **Never** shared with ad or affiliate partners and never used for ad selection.
- **Attribution:** `?ref=` and UTM parameters captured at signup into the profile (first-touch) for marketing analysis; affiliate attribution happens at the partner via their tag in `/go/:id`, so Tabby sends partners no user data.

## 7. Affiliate attribution

1. Links in guides and chapter pages point to `/go/<id>` (internal), shown with a visible "affiliate link" disclosure.
2. The API redirects to the partner URL with Tabby's partner tag added server-side, increments `affiliate_daily`, sets `Referrer-Policy: no-referrer`.
3. Conversions are reported by the partner dashboard (Amazon Associates etc.); reconcile monthly. No user-level tracking needed.

## 8. Privacy, children and consumer-protection requirements

The audience includes many minors (Class 11/12). Items to resolve with a lawyer before launch; this is not legal advice.

| Area | Requirement / risk | Design response |
|---|---|---|
| DPDP Act 2023 §9 + DPDP Rules 2025 | Verifiable parental consent before processing a child's (<18) personal data; **ban on tracking, behavioural monitoring and targeted advertising directed at children** (commentary describes it as a flat prohibition consent cannot cure). Rules published 13 Nov 2025; child-consent compliance reported as due **13 May 2027**. Educational-institution exemptions exist in the Fourth Schedule — check whether an ed-tech platform qualifies (likely not by default). | Add date-of-birth / age band at onboarding; parental consent flow for under-18s before the compliance date; **no behavioural or personalised ads to anyone** (simplest compliant design); contextual sponsorship only; no third-party trackers in the app. |
| Use of academic data | Weak areas, accuracy, streaks are sensitive in effect | Never used for ad selection or shared with sponsors (§5). Recommendations of *our own* features (e.g. revision queue) are fine. |
| Payments by minors | Contracts with minors are voidable under Indian law | Payer-link flow for parents; Terms state the payer must be an adult or have guardian consent; clear refund policy |
| Consumer protection | CCPA Dark Patterns Guidelines 2023 (false urgency, subscription trap, drip pricing, etc.); Consumer Protection (E-Commerce) Rules 2020 (price display, grievance officer) | GST-inclusive prices, real deadlines only, one-click cancel, grievance contact page |
| Advertising standards | ASCI code: ads must be identifiable as ads; caution on rank/result claims | "Sponsored" labels, sponsor content rules (ADVERTISING_AUDIT §6) |
| Payment-gateway onboarding | Gateways typically require live Terms, Privacy, Refund/Cancellation, Contact pages | Add these public pages before KYC |
| Google ads to minors | Use the age-treatment tag (TFAT "child" = non-personalised, restricted data processing) | Only on public pages, if at all |
| Data minimisation | Don't send PII to Gemini or partners (already a repo rule for AI) | Same rule for ad/affiliate partners |

## 9. Ownership split

| Work | Owner |
|---|---|
| Migrations 0016–0019, RLS, `has_plus`, quota functions | Person 2 |
| Billing/placement/affiliate API, webhook, admin endpoints, error codes in contracts | Person 2 |
| Pricing page, upgrade prompts, lock states, `SponsoredSlot`, billing section in `/account/`, success/cancel pages, lint rule, analytics wiring, legal pages' templates | Person 1 |
| Plan features list, quota numbers, sponsor rules, legal review | Both + founders |

## Sources
- [DSCI insight brief on DPDP Rules](https://www.dsci.in/files/content/knowledge-centre/2025/Insight-Brief-on-DPDP-Rules.pdf)
- [LiveLaw: what DPDP child-data rules demand from ed-tech platforms](https://www.livelaw.in/articles/dpdp-child-data-rules-demand-edtech-platforms-555317)
- [DPDPA Section 9 text](https://dpdpa.com/dpdpa2023/chapter-2/section9.html), [DPDP Rule 12](https://dpdpa.com/dpdparules/rule12.html)
- [Tsaaro: parental consent and behavioural-monitoring restrictions](https://tsaaro.com/blogs/safeguarding-minors-online-understanding-parental-consent-obligations-and-behavioural-monitoring-restrictions-under-the-dpdpa-and-dpdp-rules)
- [Google Ad Manager: age treatment (TFAT) and deprecated TFUA/TFCD](https://support.google.com/admanager/answer/9598414?hl=en)
- [Google AdSense: tag for under age of consent](https://support.google.com/adsense/answer/9009582?hl=zh-Hans)
- [Razorpay: RBI e-mandate regulations](https://razorpay.com/blog/rbi-e-mandate-regulations/)
- Repository (branch `integration/web-api`): `docs/DATABASE_SCHEMA.md`, `docs/API_CONTRACTS.md`, `docs/INTEGRATION_PLAN.md`, `apps/api/src/middleware/guards.ts`, `packages/contracts/src/enums.ts`

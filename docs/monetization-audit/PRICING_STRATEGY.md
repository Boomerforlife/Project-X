# Pricing Strategy

Strategy notes from 2026-11-15; what shipped is in docs/MONETIZATION_HANDOVER.md.

Prices are GST-inclusive consumer prices in INR. Figures marked **[A]** are assumptions; **[V]** are verified from a cited source; **[U]** are reported but unverified.

## 1. The hypothesis prices have an inverted ladder

| Plan | Price | Per month | Discount vs monthly |
|---|---|---|---|
| Launch offer | ₹30 | — | — |
| Monthly | ₹50 | ₹50.00 | — |
| Quarterly | ₹100 | **₹33.33** | 33% |
| Annual | ₹500 | **₹41.67** | 17% |

**Annual costs more per month than quarterly.** A rational student buys four quarterlies (₹400) instead of one annual (₹500). The annual plan would barely sell and the quarterly plan would leave money on the table. The ladder must get cheaper per month as commitment grows.

## 2. Unit economics per plan

Assumptions: Razorpay standard 2% + 18% GST on the fee = **2.36% effective** [V, Razorpay pricing blog]; GST at 18% **if Tabby is GST-registered** [A — registration is generally required above ₹20 lakh turnover for services; confirm with a CA]. The model below conservatively assumes registration (prices are inclusive, so revenue = price ÷ 1.18).

| Plan | Price | Per month | Ex-GST per month | Gateway per month | **Net per month** |
|---|---|---|---|---|---|
| Hypothesis monthly | ₹50 | ₹50.00 | ₹42.37 | ₹1.18 | **₹41.19** |
| Hypothesis quarterly | ₹100 | ₹33.33 | ₹28.25 | ₹0.79 | **₹27.46** |
| Hypothesis annual | ₹500 | ₹41.67 | ₹35.31 | ₹0.98 | **₹34.33** |
| Launch ₹30 (one month) | ₹30 | ₹30.00 | ₹25.42 | ₹0.71 | **₹24.72** |
| **Recommended monthly** | **₹59** | ₹59.00 | ₹50.00 | ₹1.39 | **₹48.61** |
| **Recommended quarterly** | **₹149** | ₹49.67 | ₹42.09 | ₹1.17 | **₹40.92** |
| **Recommended annual** | **₹499** | ₹41.58 | ₹35.24 | ₹0.98 | **₹34.26** |

Razorpay's standard pricing has no fixed per-transaction fee [V], so small tickets aren't penalised as they would be with a fixed-fee gateway. Two caveats:
- A Razorpay blog post says UPI MDR applies from 15 Oct 2026 on UPI payments above ₹2,000 [U]. All recommended prices are under ₹2,000, so this doesn't affect them, but confirm on the official pricing page.
- Razorpay has a 90-day 0% platform fee offer for accounts activated after 1 July 2026, up to ₹5 lakh GMV [U]. Useful at launch; don't build it into the steady-state model.

**Commercial sustainability:** marginal cost per paying student is close to zero. Infrastructure is shared, AI runs in batch with a daily cap, and no live per-user AI exists yet. So ₹30–₹60/month is sustainable **as long as live AI features (doubts, unlimited live hints) are usage-capped**. The real constraint is volume, not margin. See REVENUE_MODEL for break-even (roughly 120–270 paying students at 1k–10k MAU).

## 3. Recommended plans

| Plan | Price | Per month | Positioning |
|---|---|---|---|
| Free | ₹0 | — | Complete practice, all solutions, 2 full papers/month, one sponsored card on dashboard and results |
| Plus 30-day pass | **₹59** | ₹59 | Try it during a mock-test month |
| Plus 90-day pass | **₹149** | ₹49.67 (16% off) | **Default / pre-selected.** Matches one JEE session cycle (e.g. Jan → Apr) |
| Plus 365-day pass ("Exam year") | **₹499** | ₹41.58 (30% off) | Best value; for Class 11 and repeaters |
| Launch offer | **₹29 one-time 30-day pass**, no renewal | — | See eligibility below |

Why these numbers:
- ₹499 annual keeps your ₹500 anchor (psychologically "under 500").
- ₹149 quarterly fixes the inversion while staying under the ₹150 impulse threshold.
- ₹59 monthly is deliberately the worst value, to push buyers to the quarterly plan, while staying affordable.
- If ₹59 feels too high in testing, ₹49 / ₹129 / ₹449 keeps the same shape.

**Default recommendation: Quarterly**, highlighted. Annual gets a "Best value" label. JEE preparation is seasonal (January and April sessions for Main, May/June for Advanced, May for NEET), and three months is a commitment a student or parent can say yes to.

## 4. Launch offer: eligibility

- New accounts only, one redemption per account and per verified phone/email; first purchase only.
- Time-boxed (e.g. first 60 days after public launch) or capped (first 1,000 buyers). State the real end date. No fake countdown timers.
- Applies to the **first month of Monthly** only. If it is auto-renewing, the renewal price (₹59) and date must be shown before payment and in the confirmation. Shipped as a **one-time 30-day pass** with no auto-renew.
- Alternatively: ₹29 off the first quarterly (₹120). This anchors users on the plan you want them on.

## 5. Free trial

Yes, but **without collecting a payment method**: a 7-day Plus trial unlocked once per account after the student completes their first practice session (not at signup, so they've seen the product). When it ends, the account quietly returns to Free. Nothing is charged and there's no mandate to cancel.

Why no card-up-front trial: most of the audience is under 18 and pays through a parent's UPI. Auto-converting trials create refund disputes and dark-pattern risk (India's CCPA dark-pattern guidelines cover "subscription traps"; verify the current text).

## 6. One-time passes first, auto-renew later

Recommendation: **launch with prepaid passes** (30 / 90 / 365 days) using Razorpay one-time Orders, and add Razorpay Subscriptions (UPI Autopay / card e-mandates) in a later phase.

| | Prepaid passes | Recurring subscriptions |
|---|---|---|
| Build effort | Low (Orders + webhook) | Higher (mandates, retries, halted states, pre-debit notices) |
| Fit for minors/parents | High — parent pays once, done | Lower — needs a mandate on the parent's account |
| Regulatory surface | Small | RBI e-mandate rules: ₹15,000 no-AFA limit [V, reported], 24-hour pre-debit notification [V, reported], first transaction with full 2FA |
| Revenue predictability | Lower (manual renewals) | Higher |
| Mitigation | Renewal reminder emails, "extend" button, annual pass as default for committed students | — |

## 7. Referral programme

Yes, a simple one: **"Give a month, get a month."** The referred student gets 30 days of Plus after completing 20 questions; the referrer gets 30 days of Plus per qualified referral, capped at 6 per year.
- Rewards are product access, **never cash**. Cash rewards for minors invite fraud and regulatory questions.
- Qualification needs real activity (20 answered questions), not just a signup. This blocks self-referral farms.
- No leaderboard of referrers and no "invite your contacts" access requests.

## 8. Separate JEE and NEET plans?

**No.** One Plus plan covers every exam. Reasons: content and infrastructure costs are shared; Physics and Chemistry overlap (questions can serve multiple exams, `Question.exams[]`); some students switch target exam; and a single plan halves the pricing UI, admin and support burden. Revisit only if NEET-specific premium content (e.g. a licensed Biology bank) carries its own cost.

## 9. Competitive positioning (what could be verified)

| Product | Model (as found) | Source quality |
|---|---|---|
| MARKS (MathonGo) | Free chapter-wise PYQs; a paid "MARKS Premium" exists (mocks, video solutions, DPPs) — current price not found | [V] free model, [U] premium price |
| Achieve "JEE Exam Prep" app | Premium plans listed at ₹99–₹499 on the App Store | [U] single listing |
| Large coaching platforms (PW, Unacademy, etc.) | Course-based, substantially higher ticket sizes | Not researched in detail; no figures cited |

Positioning: **"Free to practise. ₹149 a quarter to practise smarter."** Tabby competes with free PYQ apps on quality and calm UX, and is an order of magnitude cheaper than coaching. Lead with what is free, then sell analysis and unlimited mocks. Don't compete on content volume until the licensed bank exists.

## Sources
- [Razorpay payment gateway pricing explained](https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/)
- [Razorpay 0% platform fee offer (90 days, new merchants, 2026)](https://razorpay.com/blog/razorpay-0-percent-platform-fee-offer-90-days-new-merchants-2026/)
- [Razorpay: best payment gateway pricing for SaaS in India](https://razorpay.com/blog/best-payment-gateway-pricing-saas-india-tco-guide/)
- [Business Today: RBI caps recurring payments at ₹15,000 without OTP (Apr 2026)](https://www.businesstoday.in/personal-finance/news/story/rbi-caps-recurring-payments-at-rs15000-without-otp-under-new-e-mandate-framework-526759-2026-04-21)
- [Razorpay: UPI Autopay vs card e-mandates](https://razorpay.com/blog/upi-autopay-vs-card-e-mandates/)
- [MARKS app](https://getmarks.app), [MARKS Restart Toolkit](https://restart-toolkit.getmarks.app)
- [Achieve JEE Exam Prep (App Store)](https://apps.apple.com/us/app/id6479345246)

# Premium Features

Working name for the paid tier in this document: **Tabby Plus**. Rename freely.

## 1. Principle

Free Tabby must be a complete way to prepare: unlimited practice, every solution, the mistake notebook, and a fair number of full mock tests. Plus sells **depth, convenience and time saved**: deeper analysis, smarter revision, unlimited mocks, no ads. Nothing a student needs to *learn* a concept sits behind a paywall.

Things that must stay free (and why):
- **Solutions and answers.** Gating them breaks trust and competitors give them free.
- **Daily practice volume.** A question cap punishes the most motivated students.
- **The mistake notebook and bookmarks.** They are part of the core loop, not extras.
- **CBT access.** Every student should be able to sit a real-format mock before exam day.

## 2. Evaluation of candidate premium features

Scores 1–5. *Op cost* = ongoing cost per user (5 = expensive). Status refers to what exists today (PRODUCT_AUDIT §2).

| Feature | User value | Perceived premium value | Dev complexity | Op cost | Differentiation | Conversion impact | Exists today? | Verdict |
|---|---|---|---|---|---|---|---|---|
| Advanced performance analytics (time per question, accuracy by difficulty/type, speed vs accuracy, trends) | 4 | 5 | 3 | 1 | 3 | **High** | Basic only | **Premium** |
| Weakness identification (topic-level, with "why": slow, careless, conceptual) | 5 | 5 | 3 | 1 | 4 | **High** | Basic weak areas (chapter, <50% accuracy) | Basic **free**; detailed **Premium** |
| Personalised revision schedule (spaced repetition from mistakes) | 5 | 5 | 3 | 1 | 4 | **High** | No | **Premium** |
| Advanced mock-test analytics (section strategy, attempt order, time sinks, paper-vs-paper) | 5 | 5 | 3 | 1 | 4 | **High** | Score + subject bars + previous-attempt delta | Basic **free**; deep **Premium** |
| Topic-level accuracy | 4 | 3 | 2 | 1 | 2 | Medium | Chapter-level only (backend `user_chapter_stats`) | Chapter **free**; topic **Premium** |
| Question filtering (year range, type, origin, exclude-correct) | 4 | 3 | 1 | 1 | 2 | Medium | Backend supports `filters`; UI exposes difficulty only | Difficulty + chapter **free**; full filter set **Premium** |
| Custom practice sessions (timed custom tests, mixed chapters, size up to 50) | 4 | 4 | 2 | 1 | 3 | Medium | Partial | Basic **free**; custom timed builder **Premium** |
| Full mock tests / CBT attempts | 5 | 5 | 4 (needs L5) | 1 | 3 | **High** | Demo only | **Free with limits** (e.g. 2 full papers/month); unlimited **Premium** |
| Revision tracking (mistakes cleared over time, review-list progress) | 3 | 3 | 2 | 1 | 2 | Low | Partial | **Free** |
| Study streak insights (best time of day, consistency, goal history) | 2 | 3 | 2 | 1 | 2 | Low | Streak + 7 days | Streak **free**; insights **Premium** (low priority) |
| Historical performance comparisons (this month vs last, attempt N vs N-1) | 4 | 4 | 2 | 1 | 2 | Medium | Previous attempt only | Last attempt **free**; full history **Premium** |
| Advanced bookmarks and notes | 3 | 2 | 1 | 1 | 1 | Low | Backend `note` exists, UI missing | **Free** (folders/tags could be Plus later) |
| Personalised recommendations | 4 | 4 | 3 | 1 | 3 | Medium | "Recommended for you" (rule-based) | Basic **free**; plan-driven daily set **Premium** |
| AI hints | 4 | 3 | 3 (needs L7) | 2 if pre-generated in batch, 4 if live | 2 | Medium | Hidden | **Free with daily limit** (e.g. 5/day), unlimited **Premium** |
| AI doubt solving (text + image) | 5 | 5 | 5 | **5** | 4 | High | Doubts stored, never answered | **Future premium add-on** (usage-capped) |
| Ad-free | 3 | 3 | 1 | 0 | 1 | Medium | — | **Premium** |
| Curated PYQ packs / topic-wise DPP packs | 4 | 4 | 3 (needs licensed content) | 1 | 3 | Medium | No | **Future add-on** or Plus |
| Personalised study plan to exam date | 4 | 5 | 4 | 1 | 4 | High | Study plans page empty | Generic plans **free**; personalised **Premium** (phase 2) |
| Exclusive kitty cosmetic | 1 | 2 | 1 | 0 | 2 | Low | Wardrobe exists | One thank-you cosmetic for Plus; earned items stay free |

## 3. Free vs Plus matrix (recommended launch)

| Area | Free | Plus |
|---|---|---|
| Practice (learning + test mode) | Unlimited | Unlimited |
| Solutions, verification labels | All | All |
| Calculator, scratchpad, shortcuts, report | ✓ | ✓ |
| Chapter / subject / mixed practice, difficulty filter | ✓ | ✓ |
| Advanced filters (year range, question type, PYQ-only, exclude solved) and custom timed tests | — | ✓ |
| Full papers + CBT | 2 full attempts per month (retries count) | Unlimited |
| Results: score, subject breakdown, question review, previous-attempt delta | ✓ | ✓ |
| Deep test analysis (time per question, time sinks, attempt order, accuracy by difficulty, paper-vs-paper) | Preview (blurred, sample shown) | ✓ |
| Progress: heatmap, weekly accuracy, subject + chapter stats, top-5 weak chapters | ✓ | ✓ |
| Topic-level accuracy, mistake-category analytics, historical comparisons | — | ✓ |
| Mistake notebook, bookmarks (+notes), review list | ✓ | ✓ |
| Smart revision queue (spaced repetition of mistakes, due today) | — | ✓ |
| AI hints (when shipped) | 5 per day | Unlimited (fair-use cap) |
| Streaks, XP, achievements, wardrobe | ✓ | ✓ + one Plus cosmetic |
| Sponsored content | One card on dashboard and results | None |

What Plus does **not** use: the existing `questions.access_tier` column. Locking individual questions conflicts with "don't restrict essential functionality". Keep the column for future curated packs only.

## 4. Future add-ons (not at launch)

1. **AI doubt solving** — text and photo doubts. The backend already accepts doubts and uploads; answering them costs real money per use. Sell as Plus with a monthly cap, or as top-up packs. Never auto-publish answers (backend rule: AI output is never public on its own).
2. **Personalised study plan** to a target exam date, built from the syllabus tree and the student's chapter stats.
3. **Curated packs** (e.g. "JEE Main 2025 PYQs with video-free step solutions", "Top 300 Organic questions") — only with licensed or original content.
4. **Parent view** (weekly email summary) — useful for parents who pay. Needs consent and design care.

## 5. UX recommendations (Phase 7)

### 5.1 Premium upgrade prompts
- **Where:** dashboard house card (A4), the locked preview on results and progress (D3), the CBT quota message, the advanced-filter section in `/practice/new/`. Nowhere inside a session or the CBT.
- **When:** after value has been felt: after the 2nd completed session, after the first full paper result, when a free CBT quota is reached. Never on first login or during onboarding.
- **Frequency:** a dismissed prompt stays hidden for 7 days; at most one prompt per screen.
- **Copy:** factual, no shame, no false urgency. "See where your time went in this paper. Detailed test analysis is part of Tabby Plus." Not "You're falling behind!" The kitty never delivers upgrade messages.

### 5.2 Feature lock states
- Show the real layout with **sample or blurred data and a lock chip** ("Plus"), plus one sentence on what it does and a "See Plus" button. Never hide the existence of a feature and never show the user's own data blurred as a teaser (it feels like hostage-taking).
- Locked controls are focusable, announced as "Plus feature, opens upgrade information", and never look disabled-by-error.
- CBT quota: "You've used your 2 free full papers this month. They reset on 1 December. Practice and chapter tests stay unlimited." plus a secondary "Get unlimited papers" action. Their history and results stay accessible.

### 5.3 Pricing page (`/pricing/`, public, indexable)
- Separate label from "Plans" (study plans). Suggest nav label **"Plus"** or **"Pricing"**.
- Three cards (Monthly / Quarterly / Annual) with the effective per-month price, the quarterly card pre-selected, annual marked "Best value". GST-inclusive prices.
- Free vs Plus table (from §3). A short honest FAQ: what stays free, refunds, how renewals work, "can a parent pay?", data and privacy.
- "Ask a parent to pay" — generates a payment link the student can share; the payer completes checkout. This respects minors' situation (most students don't have their own payment instruments and contracts with minors are voidable).

### 5.4 Premium user experience
- No ads, no upgrade prompts anywhere.
- A small "Plus" chip in the account menu; a quiet thank-you cosmetic for the kitty.
- `/account/` gets a **Billing** section: plan, valid until, payment history and invoices, renewal status, cancel/turn off renewal in one click.
- Expiry reminders 7 days and 1 day before (email + in-app banner on dashboard only), never a hard cut mid-session: if a pass expires during an attempt, the attempt finishes normally.

### 5.5 Payment success and cancellation
- **Success (`/billing/success/`, noindex):** confirm the plan and valid-until date, show what's now unlocked (3 bullets), one button back to where the student came from. The confirmation depends on the server having verified the payment; show "Confirming your payment…" with polling until the webhook lands, and a support path if it takes longer than about 2 minutes.
- **Cancelled / failed (`/billing/cancelled/`, noindex):** neutral copy, "No money was taken" (only when true), a retry button and an alternative ("Ask a parent to pay"). No guilt messaging.
- **Cancel renewal:** one click, confirms the date access ends, no multi-step retention maze (avoid subscription-trap dark patterns).

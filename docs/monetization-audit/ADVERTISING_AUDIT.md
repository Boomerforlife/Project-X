# Advertising Audit

All placements below are **proposals**. Nothing is implemented. Route names match the real routes in `src/app/` (see PRODUCT_AUDIT §1).

## 1. Ground rules (non-negotiable)

1. **No ads in the focus or exam route groups.** `src/app/(focus)/` (practice session) and `src/app/(exam)/` (CBT) are ad-free by construction, not by a runtime check.
2. **No ad between a question and its answer or solution.** Never inside `QuestionBody`, `SolutionPanel`, hint panels or the results question-review list.
3. **No ads during onboarding, auth, error or 404 screens.**
4. **Premium users see zero ads**, including house cross-promotions for partners. Upgrade prompts are not shown to premium users either.
5. **Every paid placement is labelled "Sponsored" or "Advertisement"**, in text, not by colour alone.
6. **No targeting on performance or personal data.** A sponsor may target *page context* (exam, subject, chapter being viewed). A sponsor may never target "students weak in Electrostatics", accuracy, rank, class level, streaks or anything from `/users/me/*`.
7. **At most one sponsored unit per screen** and no auto-playing video, interstitials, pop-ups, sticky overlays or sound.
8. **The kitty never appears in or next to an ad**, and never endorses a product.

## 2. Exclusion map

| Route | Ads? | Reason |
|---|---|---|
| `/practice/session/` | Never | Active solving (focus shell) |
| `/cbt/` | Never | Timed exam simulation; mascot is already banned here |
| `/onboarding/`, `/login/`, `/signup/` | Never | First impression, trust, minors' consent context |
| `/mistakes/`, `/bookmarks/`, `/review/` | Not recommended | Personal study space; an ad here reads as targeting weaknesses |
| `/progress/` | Not recommended (house upgrade prompt only) | Performance data on screen — avoid any perceived link between ads and scores |
| `/account/` | Never | Settings and billing |
| Error / 404 / loading screens | Never | — |

## 3. Placement inventory

Complexity: S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1–2 weeks (frontend + API combined, assuming the placement service in MONETIZATION_ARCHITECTURE §5 exists for M/L).

### A. Dashboard

| ID | Route & UI location | Format | Visibility | UX impact | Complexity | Network or direct | Class |
|---|---|---|---|---|---|---|---|
| A1 | `/dashboard/` — below the "Performance" section, above "Momentum" (`Dashboard.tsx` between `<Performance>` and `<Momentum>`) | Native sponsored card, same width as a section, "Sponsored" eyebrow, sponsor name, one line, one CTA | High (every visit), below the fold on mobile | Low if below the primary action | M | **Direct** (or house) | **Recommended** |
| A2 | `/dashboard/` — inside the Today panel / hero | Any | Very high | High: competes with the daily goal and "continue practice" | — | — | **Not recommended** |
| A3 | `/dashboard/` — "Educational partner recommendation" row (3 cards) | Native cards | Medium | Medium: clutters a dashboard CLAUDE.md asks to keep uncluttered | M | Direct | Optional (later; only if A1 underfills) |
| A4 | `/dashboard/` — upgrade prompt (house) | Small inline card | Medium | Low | S | House | **Recommended** (free users only, dismissible, max once per 7 days) |

### B. Practice (outside the session)

| ID | Route & UI location | Format | Visibility | UX impact | Complexity | Network or direct | Class |
|---|---|---|---|---|---|---|---|
| B1 | `/results/` for a **practice** session — after the score summary and action buttons, before "Question review" | Native sponsored card | High after each session | Low: the student has finished | M | Direct (contextual to the session's subject) | **Recommended** |
| B2 | `/practice/` hub — below "Recommended for you", above chapter browser | Native card or "Sponsored challenge" tile | High | Medium: hub should be fast to scan | M | Direct | Optional |
| B3 | Sponsored practice challenge ("Thermodynamics Week, supported by X") | Challenge tile on hub + badge on completion | Medium | Low–medium; content stays ours, sponsor only funds/brands it | L | Direct | Optional (needs editorial rules: sponsor never writes questions or solutions) |
| B4 | Between questions in a session / after "Check" | Interstitial | — | Breaks the solving loop | — | — | **Not recommended** |
| B5 | Session exit ("Leave session") screen | Card | Low | Low | S | Either | Not recommended (low value, adds friction to leaving) |

### C. Mock tests / papers

| ID | Route & UI location | Format | Visibility | UX impact | Complexity | Network or direct | Class |
|---|---|---|---|---|---|---|---|
| C1 | `/tests/` hub — single banner below the PYQ list / near `CbtExplainer` | Native card | Medium | Low | M | Direct | Optional |
| C2 | `/tests/[paperId]/` paper detail — beside "Your attempts" | Card | Medium | Low | M | Direct ("Mock series by X" type sponsor) | Optional |
| C3 | `/results/` for a **paper/CBT** attempt — after score summary | Native card | High | Low: post-exam | M | Direct | **Recommended** (only after the result has rendered; never on the submit-confirmation dialog) |
| C4 | Inside `/cbt/` instructions, palette, timer bar or submit dialog | Any | — | Violates exam simulation | — | — | **Not recommended (prohibited)** |

### D. Results and analytics

| ID | Route & UI location | Format | Visibility | UX impact | Complexity | Network or direct | Class |
|---|---|---|---|---|---|---|---|
| D1 | Same as B1/C3 | — | — | — | — | — | (merged) |
| D2 | `/progress/` — partner offering next to "Chapters to revisit" | Card | Medium | **High risk**: reads as "we saw you're weak, buy this" | — | — | **Not recommended** |
| D3 | `/progress/` — premium analytics teaser (house) | Locked preview | Medium | Low | S | House | **Recommended** |

### E. Public pages and resources

| ID | Route & UI location | Format | Visibility | UX impact | Complexity | Network or direct | Class |
|---|---|---|---|---|---|---|---|
| E1 | `/[track]/questions/[slug]/` — **below** the solution and related questions, above footer | One display unit or native card | High (SEO traffic) | Low if below content | S (network) / M (direct) | **Both** — non-personalised network ads, or contextual direct | **Recommended once real content and traffic exist** |
| E2 | `/[track]/[subject]/[chapter]/` — after the question list | Native card ("Recommended book for this chapter") | Medium | Low | M | Direct / affiliate | **Recommended** |
| E3 | `/[track]/` and `/[track]/[subject]/` hubs — one unit below main content | Display or native | Medium | Low | S | Either | Optional |
| E4 | `/resources/` guides — in-article affiliate links (books) and one sponsor block per guide | Contextual links, disclosed | Medium | Low; guides are adult-readable editorial | M | Affiliate + direct | **Recommended** (after guides exist) |
| E5 | `/` landing page | Any | — | Damages first impression and conversion | — | — | **Not recommended** |
| E6 | Between the question stem and the solution on public question pages | Any | — | Looks like content; hurts trust and Core Web Vitals | — | — | **Not recommended** |
| E7 | Sticky/anchor or vignette (full-screen) network formats anywhere | — | — | Intrusive on mobile, layout shift | — | — | **Not recommended** (disable auto ads) |

### Summary

- **Recommended:** A1, B1, C3, E1 (when content exists), E2, E4 — plus house upgrade prompts A4 and D3.
- **Optional:** A3, B2, B3, C1, C2, E3.
- **Not recommended:** A2, B4, B5, C4, D2, E5, E6, E7, plus every route in §2.

A signed-in free user therefore sees at most **one sponsored unit per visit to the dashboard and one per results page**. That is the whole in-app ad load.

## 4. Network vs direct suitability

| Factor | Third-party network (e.g. AdSense) | Direct sponsorship |
|---|---|---|
| Audience mostly under 18 | Must send age-treatment / non-personalised signals; lower yield | Contextual by design; no user data leaves |
| Control over what appears | Category blocking only; risk of competitor coaching ads, gaming, low-quality ads | Full editorial approval |
| Signed-in app pages | Poor fit (low volume, private context) | Good fit |
| Public SEO pages | Reasonable fit (anonymous, contextual) | Good fit, harder to sell |
| Revenue at <50k MAU | Small (see REVENUE_MODEL) | One sponsor can out-earn the network |
| Effort | Low tech, high policy review | Sales effort, admin tooling |

**Recommendation:** keep third-party networks **out of the signed-in app**. Use them, if at all, only on public SEO pages, non-personalised, after legal review. In-app placements are house prompts and direct sponsors.

## 5. Visual design for sponsored units

Keep the existing language: `--bg #080808`, `--surface #111111`, 1px `--line #242424`, white text, `--fg-muted` grey.

```
┌───────────────────────────────────────────────────────────┐
│ SPONSORED · Why this?                              [×]     │  ← eyebrow in fg-muted, uppercase, 11px
│                                                           │
│ Sponsor Name                                              │  ← fg, font-medium, no subject colour
│ One factual line about the offer (≤ 90 chars).            │  ← fg-soft
│                                                           │
│ [ Visit sponsor ↗ ]                                       │  ← secondary button, rel="sponsored noopener"
└───────────────────────────────────────────────────────────┘
```

Rules:
- **Different from organic content on purpose:** no subject accent bar (organic chapter cards use the 3px accent on the left, see `PracticeHub.tsx` "Recommended for you"), no KaTeX, no "solution"/"hint" styling, no mascot, no pixel icons.
- **Don't use orange.** `--review #fb923c` already means "marked for review / partial". Reusing it for sponsored or premium would blur a semantic state colour. Use neutral surfaces; premium can use an inverted (white-on-black → black-on-white) chip.
- **"Why this?"** opens a small popover: "Sponsored. Shown because you're viewing Physics content. We don't share your data or results with sponsors. Premium removes sponsored content."
- Dismiss (×) hides that creative for 7 days (per-device convenience storage only).
- Fixed height reserved before load (no layout shift); lazy-loaded below the fold.
- Outbound links: `rel="sponsored noopener"`, open in new tab, with a visible ↗.
- Respect `prefers-reduced-motion`: no animated creatives at all.
- Both themes: tokens only, no hard-coded colours from sponsors except a small logo.

## 6. Sponsor content rules (editorial)

- Sponsors never author, edit or rank questions, solutions or hints.
- No claims of ranks, selections or guaranteed results unless the sponsor substantiates them (ASCI code; verify current ASCI guidance for educational advertising before launch).
- Blocklist at launch: gambling/fantasy/real-money gaming, crypto, dating, weight-loss, loan apps, unrelated mature content, "leaked paper" or cheating services.
- Competing coaching brands: allowed only through direct deals with approval, never via auto-filled network ads.

# Product Audit — Tabby (working name)

Audit date: 2026-11-15. Scope: monetization readiness. No production code was changed.

## 0. What was inspected

| Source | Branch / location | What it contains |
|---|---|---|
| Frontend (working tree) | `feature/frontend-implementation` (with uncommitted mascot/error-screen work) | Next.js 16 app, all routes and components, demo store |
| Backend + integration | `origin/integration/web-api` (newest branch; merges `owner-b/backend-foundation-v2` + frontend + API wiring) | Hono API on Cloudflare Workers, Supabase Postgres migrations 0001–0015, AI pipeline (Gemini + SymPy), Python ingestion, edge cache, typed API client in `src/lib/api/` |
| Backend docs | `docs/STATUS.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_CONTRACTS.md`, `COST_STRATEGY.md`, `INTEGRATION_PLAN.md`, `TECH_STACK.md` on `integration/web-api` | Binding contracts, cost plan, integration gaps |

Backend code was read with `git show` against the remote branch; the local working tree was not switched or modified.

### Stack (verified)
- **Web:** Next.js 16.4 App Router, React 19.3, Tailwind 4, KaTeX, Zod. Data source switch `NEXT_PUBLIC_DATA_SOURCE=mock|api` (`src/lib/site.ts`).
- **API:** Hono on Cloudflare Workers (`apps/api`), OpenAPI 3.1 (57 paths), Zod contracts in `packages/contracts`.
- **DB/Auth:** Supabase Postgres with RLS; Supabase Auth (JWT verified by the API).
- **Files:** Cloudflare R2. **AI:** Gemini, batch-only, budget-capped (`AI_DAILY_BUDGET_USD`, default $1/day).
- **Deploy:** OpenNext-on-Cloudflare prepared but **never run against a real account** (`docs/STATUS.md`).

### Things the audit brief asked about that do NOT exist
| Asked about | Finding |
|---|---|
| Plans and pricing pages | **None.** `/study-plans/` is a *study plan* (content) page showing an empty state "Plans are being written", `noindex`. The nav label "Plans" points there. There is no pricing page. |
| Existing payment implementation | **None** on any branch. No Razorpay/Stripe code, keys, webhooks or env vars. |
| Subscriptions / entitlements | **None.** The only hook is an unused enum `access_tier ('FREE','PREMIUM')` on `questions` (migration `0002`, column in `0005`). `DATABASE_SCHEMA.md` reserves future `plans`, `entitlements`, `mock_tests`, `doubt_answers` tables — not created. |
| Advertising | **None.** No ad SDKs, slots or sponsor content. |
| User activity tracking / product analytics | **No analytics SDK** (no GA, PostHog, Plausible, Search Console tag). Learning activity *is* tracked as product data: `attempts`, `daily_activity`, `streaks`, `user_chapter_stats`, `usage_counters` (ops metrics). |
| "Orange accents" design language | Not quite. The palette is monochrome (`#080808` bg, white text, grey muted) with **subject accents** (blue/green/yellow/purple). Orange `#fb923c` exists only as the semantic `--review` token (marked-for-review / partial). See ADVERTISING_AUDIT §5 for why it should not be reused for sponsored or premium UI. |

## 1. Route inventory (verified in `src/app/`)

| Route | Group | Indexing | Status in API mode |
|---|---|---|---|
| `/` landing | site | indexable (if `INDEXABLE`) | live |
| `/[track]/` (jee, neet) | site | indexable | live from API |
| `/[track]/[subject]/` | site | indexable | live from API |
| `/[track]/[subject]/[chapter]/` | site | indexable | live from API |
| `/[track]/pyq/`, `/[track]/pyq/[year]/` | site | indexable when content warrants | live; no licensed PYQs ingested yet |
| `/[track]/questions/[slug]/` | site | only when backend `publicPage` eligible | live from `/public/questions/{slug}` (question + approved solution) |
| `/study-plans/` | site | noindex | empty state |
| `/resources/` | site | noindex | empty state "No guides published yet" |
| `/login/`, `/signup/`, `/onboarding/` | auth | noindex | Supabase auth in API mode |
| `/dashboard/` | app | noindex | live (streak, goal, sessions, derived XP) |
| `/practice/`, `/practice/new/` | app | noindex | live |
| `/practice/session/` | focus | noindex | live (learning + test mode) |
| `/tests/`, `/tests/[paperId]/` | app | noindex | **demo only** behind `NEXT_PUBLIC_FEATURE_PAPERS` (off by default) |
| `/cbt/` | exam | noindex | **demo only** (same flag) |
| `/results/` | app | noindex | live for practice sessions |
| `/mistakes/`, `/bookmarks/`, `/review/` | app | noindex | mistakes + bookmarks live; review list local-only |
| `/progress/` | app | noindex | live (progress, weak areas); achievements derived |
| `/leaderboard/` | app | noindex | **hidden** in API mode (mock peers) |
| `/account/` | app | noindex | live (profile, exam, theme, privacy) |
| `/api/revalidate/`, `/api/dev/token/` | api | — | infra |
| `sitemap.xml`, `robots.txt`, OG image | — | — | live |

## 2. Feature inventory

Legend — **Freq:** D = daily, W = weekly, O = occasional. **Status:** Live = works against the API; Demo = localStorage/fixture only; Hidden = flagged off in API mode; Planned = backend gap list (`INTEGRATION_PLAN` L1–L7).

| # | Feature | What it does (verified location) | Who benefits | Freq | Essential? | Monetization potential | Recommendation | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Public SEO pages | Exam/subject/chapter hubs, question pages with solutions, breadcrumbs, JSON-LD, sitemap (`src/app/(site)`, `/public/*`) | Anonymous searchers, acquisition | D (traffic) | Essential for growth | **High for ads/sponsorship** (largest anonymous inventory) | Free | Live, but little real content yet |
| 2 | Auth + onboarding | Signup/login, exam, class level (11/12/repeater), daily goal (`Onboarding.tsx`, `PATCH /users/me`) | All | Once | Essential | None directly; collects class level (relevant to minors' compliance) | Free | Live |
| 3 | Dashboard | Greeting, today panel, daily goal, 7-day streak, continue session, performance tiles, subject breakdown, weekly accuracy, recent attempts, momentum/XP (`Dashboard.tsx`) | All | D | Essential | Medium: best slot for upgrade prompt and one sponsored card | Free | Live (XP derived) |
| 4 | Practice hub | Quick practice (learning/test, subject, count), shortcuts (revise mistakes, practise bookmarks), "Recommended for you" chapters, chapter browser with "Needs work" sort (`PracticeHub.tsx`) | All | D | Essential | Low (must stay frictionless) | Free | Live |
| 5 | Practice launcher | Chapter/subject/mixed with difficulty and count (`/practice/new/`) | All | D | Essential | Medium: advanced filters (year range, type, origin, exclude-correct, timed custom tests) are supported by the backend `filters` but only partly exposed | Basic free; advanced builder premium | Live |
| 6 | Learning mode | Check answer, immediate feedback, solution, AI hint, XP toast (`PracticePlayer.tsx`) | All | D | Essential | None — core learning value | Free | Live (hints hidden) |
| 7 | Test mode | Answers saved without reveal, timer, review flags, submit, results (`PracticePlayer.tsx`) | All | D/W | Essential | Low | Free | Live; autosave local only (L3) |
| 8 | Question renderer | KaTeX, figures, tables, MCQ/multi/numerical (`QuestionBody.tsx`, `RichText.tsx`) | All | D | Essential | None | Free | Live |
| 9 | Solutions + verification labels | Final answer, steps, verification status/provenance (`SolutionPanel.tsx`) | All | D | Essential | None — gating solutions would damage trust | Free | Live |
| 10 | AI hints | Hint before answering, labelled "AI-generated, may be imperfect" | All | D | Supplementary | Medium (has per-use cost if generated live) | Free with daily limit; unlimited premium | **Hidden** (needs L7 `question_hints`) |
| 11 | Calculator, scratchpad, shortcuts, report | Tools in session (`Tools.tsx`, `ReportDialog.tsx`) | All | D | Essential | None | Free | Live (report endpoint not in API) |
| 12 | Full papers hub + paper detail | PYQ/mock list, pattern & marking, attempts history, attempt-mode chooser (`Papers.tsx`) | Serious aspirants | W | Essential for exam prep | **High** (mock tests are the classic paid product) | Free quota; unlimited premium | **Demo only** (L5) |
| 13 | CBT simulation | Exam-style shell: instructions, timer, palette, sections, keypad, autosave, submit confirmation (`CbtExam.tsx`) | Serious aspirants | W | Essential | High (attempt count), but never ads inside | Free quota; unlimited premium | **Demo only** (L5) |
| 14 | Retry as new attempt | Retry paper/practice in CBT or test mode without overwriting (`ResultsView.tsx`) | All | W | Essential | Medium (counts toward CBT quota) | Free within quota | Live for practice; demo for papers |
| 15 | Results | Score, subject bars, time spent, per-question review with filter, practise-mistakes action, previous-attempt comparison (`ResultsView.tsx`) | All | W | Essential | **High** for advanced analysis (time per question, accuracy by difficulty, attempt-order strategy) | Basic free; deep analysis premium | Live (practice) |
| 16 | Mistake notebook | Auto-captured wrong answers, open/cleared, subject filter, categories (`Notebook.tsx`, `/users/me/mistakes`) | All | W | Essential | Medium: spaced-repetition scheduling on top | Notebook free; smart revision schedule premium | Live; categories local (L1) |
| 17 | Bookmarks | Save questions; backend supports a 500-char `note` | All | W | Essential | Low | Free (notes too) | Live (notes not surfaced in UI) |
| 18 | Review list | Questions flagged for later | All | W | Essential | Low | Free | Local only (L2) |
| 19 | Progress page | Activity heatmap, weekly accuracy, by subject, chapters to revisit, chapter table (`ProgressPages.tsx`, `/users/me/progress`) | All | W | Supplementary | **High** (deeper analytics is the most natural premium) | Summary free; advanced premium | Live (weak areas = chapters ≥5 attempts & <50%) |
| 20 | Streaks + daily goal | Server-computed streak, last 7 days, goal met (`/users/me/streak`) | All | D | Supplementary (retention) | Low; streak *insights* could be premium | Free | Live |
| 21 | XP, levels, achievements, weekly challenges | Derived from attempts (`lib/demo/progress.ts`) | All | D | Supplementary | Low; don't sell progress | Free | Derived display only (L6 for server XP) |
| 22 | Kitty wardrobe (cosmetics) | Glasses/scarf/bowtie/crown unlocked by level | All | O | Supplementary | Low–medium (one premium-only thank-you cosmetic) | Earned items free | Local equip state |
| 23 | Leaderboard | Weekly XP per exam, opt-in display | Competitive users | W | Supplementary | Low | Free | **Hidden** (fake peers) |
| 24 | Account | Profile, target exam, class, theme, leaderboard privacy | All | O | Essential | Hosts billing section later | Free | Live |
| 25 | Doubts + uploads | `POST /doubts` (guest or user, daily cap), image uploads ≤5 MB | Students with doubts | O | Supplementary | **High but costly** (AI/human answering) | Future premium add-on | Backend stores doubts; **nothing answers them**, no UI |
| 26 | Admin / editorial | Review queue, approve/publish, sources, ingestion jobs (`/admin/*`) | Team | — | Internal | Hosts sponsor/plan admin later | — | API only, no admin UI in this repo |
| 27 | Study plans | Planned plans page | All | — | Supplementary | Medium (personalised plans = premium) | Free generic plans; personalised premium | Empty state |
| 28 | Resources/guides | Planned guides | Searchers | — | Supplementary | **High for affiliate + sponsorship** (contextual, adult-safe) | Free | Empty state |
| 29 | Light/dark theme | `[data-theme]` tokens | All | O | Supplementary | None | Free | Live |

## 3. Monetization-relevant observations

1. **The core loop is complete and should stay free:** practice → check → solution → mistake notebook. Every competitor gives PYQs and solutions free (MARKS app markets free chapter-wise PYQs), so gating them would lose users without gaining revenue.
2. **The premium-worthy surfaces are the least finished:** full papers/CBT (demo), hints (hidden), review list and categories (local), advanced analytics (not built). Monetization is gated on backend items L1–L7 in `INTEGRATION_PLAN.md`.
3. **Content is the real blocker.** No real PYQs are ingested; the NTA source is `reuse_permitted=false` (`STATUS.md`). A paid product needs a licensed or original question bank first.
4. **No analytics exists**, so conversion, retention and ad-revenue assumptions cannot be validated yet. Instrumentation is a prerequisite (see roadmap M0).
5. **The audience is mostly minors.** Onboarding records Class 11/12 (typically 15–17 years old). This constrains ad targeting, consent and payment flows (see MONETIZATION_ARCHITECTURE §8).
6. **Naming collision:** "Plans" in the public nav means *study plans*. A pricing page needs a distinct label ("Premium" or "Pricing").
7. **Infrastructure is designed to run near ₹0** (`COST_STRATEGY.md`): batch-only AI, CDN-cached public pages, free tiers with explicit upgrade triggers. That makes low prices viable.

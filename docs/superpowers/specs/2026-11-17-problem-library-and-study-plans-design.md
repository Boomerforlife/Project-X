# Problem library + diagnostic study plans — design

Date: 2026-11-17 · Owner A (frontend/SEO), with additive API work for Owner B to review · Target branch: `ownerAkamain`

## 1. Intent

Two connected pieces of work:

1. **Problem library.** A browsable list of the problem set Owner B already exposes (`/problems*`, migrations 0022/0023).
   It should work as well as LeetCode's list (filter, difficulty, solved status, open and solve) without looking or
   reading like a LeetCode clone.
2. **Diagnostic + study plan (Tabby Plus).** A student takes a custom test with a mix of Easy / Medium / Hard
   questions across chapters. A deterministic algorithm turns the result into a day-by-day plan that tells them what to
   do *on this platform*: which practice sessions, which problems, which mistakes to revisit, and when to re-test.

Why: practice needs a usable entry point today (FABLEaudit Phase 1), and Plus needs something worth paying for beyond
CBT, which is dark until PYQ papers exist (FABLEaudit point 8).

The owner's words: "the plan should essentially give them what to do based on our platform", and "once owner B puts
in the questions … we'll iron out all kinks".

## 2. Facts this design rests on (verified 2026-11-17)

- Live API `…/api/v1/problems/summary`: 94 problems, 60 Easy, 34 Medium, **0 Hard**, 0 premium.
- `/problems` returns `number, title, difficulty, subject, chapter, question_type, variants, acceptance_rate, attempters,
  solvers, premium, locked, status`; offset pagination; filters subject/chapter/difficulty/status/premium/q; sort
  number/acceptance/difficulty. `/problems/{n}/next` serves a variant; answers go through `POST /practice/attempts`.
- Some titles are LaTeX-stripped and unreadable (`"x 0 1 - 2x x 2 equals"`).
- `practice_sessions.question_ids uuid[]` (1–50) means the server can build a session from an explicit, chosen list.
  Sessions support `ui_mode: 'test'` and `time_limit_sec`.
- Per-student evidence already kept: `attempts` (is_correct, time), `user_chapter_stats`, `user_family_status`, `mistakes`.
- Plus check: `viewerPlus()` in `apps/api/src/problems/access.ts`; plan features in `billing_plans.features`.
- No guides or chapter descriptions exist (`/resources/` and `/study-plans/` are empty states; `chapters.description` null).
- `ownerAkamain` is 34 commits behind `main` and 0 ahead, so it can be fast-forwarded.

## 3. Goals, non-goals, anti-goals

**Goals**
- The library: filter by subject, chapter, difficulty, status and text; open a problem; solve it; come back and see it marked.
- The diagnostic: 15–45 questions, timed, test mode, spread across chosen chapters, with a stated difficulty mix.
- The plan: 7 or 14 days sized to the student's daily minutes, made only of things that exist on the platform, and
  updated as they practise.
- Server-enforced Plus gating; deterministic, unit-tested algorithm; works with the 94 problems now and scales.

**Non-goals (this round)**
- Writing guides/articles. The plan has a reserved `READ` item type that renders only when the API returns real guide links.
- Predicting rank, percentile or score. Never.
- AI-written plans or narrative. Possible later on top of the deterministic plan.
- PYQ paper plans (no papers exist yet).

**Anti-goals: failure even if it works**
- It reads as a LeetCode clone: same vocabulary, flat numbered table as the identity, LeetCode orange.
- The plan claims precision it doesn't have (e.g. "You are 62% ready"), or invents chapter weightage or exam statistics.
- A Hard tab or Hard quota that is silently padded with Medium questions.
- The kitty speaks, nags, or appears inside the diagnostic test.

## 4. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | Algorithm as a pure TS module inside `apps/api` (`src/plans/`), two new tables, Plus-gated endpoints | Touches Owner B's API, so it needs their PR review; ships with the normal API deploy | **Chosen** |
| B | Algorithm in the browser, plan in localStorage | Premium unenforceable, lost across devices, violates CLAUDE.md §13 | Rejected |
| C | LLM generates the plan | Cost per plan, non-deterministic, unverifiable claims | Rejected for v1 |

Deployment for A: no new service, cron or queue. Plans are recomputed **on read** (cheap, deterministic), and Owner B's
existing Cloud Run API deploy ships it. The algorithm is pure (`(evidence, config) → result`), so the web app's mock mode can
import the same module from `packages/` and run it on fixtures.

## 5. Part 1: the problem library (frontend)

### 5.1 Identity: how it avoids looking like LeetCode
- **Syllabus-first, not number-first.** The default view groups problems **by chapter** (collapsible, in syllabus
  order), with a per-chapter progress bar in the subject accent colour. A flat "All problems" list is a secondary toggle.
- **Vocabulary:** "Problem library", not "Problemset"; "Q-042" in small mono instead of a bold "#42"; "solve rate",
  not "acceptance"; "Today's problem", not "Daily Challenge"; "versions" for variants ("8 versions, numbers change").
- **Visual:** the existing monochrome system plus subject accents. No orange/amber palette. Status icons are a small
  pixel-art check (solved) and half-filled square (attempted), always paired with text for screen readers.
- Difficulty words stay Easy / Medium / Hard, since they're generic and students expect them.

### 5.2 Route and layout
- Route: `/practice/` (private, `noindex`), replacing the chapter browser as the main body. Quick start stays above it.
  Single problem: `/practice/problems/[number]/` (private, `noindex`).
- Header strip: solved counts per difficulty from `/problems/summary` (ring or bars), and Today's problem.
- Rows: status · Q-number · **excerpt rendered with KaTeX** (from the first variant's stem; the API `title` is used only
  when it's clean, see open contract item C1) · chapter tag · difficulty chip · type (MCQ/Numerical) · versions ·
  solve rate (only when non-null) · lock icon for premium.
- Filters in the URL (`?subject=&chapter=&difficulty=&status=&q=&view=chapter|all`).
- **Chapter view on today's API:** the chapter list (syllabus order) comes from `/taxonomy/tree`. Each chapter group
  loads its problems lazily on expand with `/problems?chapter=…` (≤ 100 per chapter today). Progress bars appear once
  C4 lands; until then a group header shows counts only after it has been expanded. **All view:** offset pagination
  ("Show more"), 50 per page.
- Hard with 0 problems: chip shows "Hard · 0" disabled, with the note "Hard problems are being added".
- "Pick one for me": a random untried problem within the current filters (client picks from the `status=TODO` filtered list).
- States: skeleton, empty filter result (kitty sitting), API error with retry, signed-out (no status column, attempt
  prompts sign-in), locked (Plus upsell card, no content).
- Mobile (360 px): rows collapse to two lines, filters in a bottom drawer.

### 5.3 Problem page
- Uses the existing `PracticePlayer` in Learning mode with a question from `/problems/{n}/next`; submit via
  `POST /practice/attempts`. Shows "Version 2 of 8 · 1 free version left" from `/problems/{n}` for free users.
- "Next / previous" follows the filtered list (filters carried in the URL).
- After solving: "Try another version" (calls `/next` again) and "Back to library".

## 6. Part 2: diagnostic + study plan

### 6.1 Student flow
1. `/study-plans/` (currently an empty state) becomes the entry point: "Find out where to focus".
2. **Setup:** subjects (default all three), chapters studied so far (default all; a student mid-syllabus deselects
   the rest), length (Short 15 · Standard 30 · Long 45), daily study minutes (30 / 60 / 90 / 120), plan length (7 / 14 days).
3. **Diagnostic:** the existing test-mode player, timed at 2.5 min × questions by default. No feedback, no hints, no
   kitty. Autosave as with any session.
4. **Results:** per-subject and per-chapter breakdown with an evidence count ("based on 3 questions"). Free users see
   the per-subject summary and the top 3 focus chapters. The full per-chapter breakdown and the plan are Plus (my call,
   as an upsell, see §8). The server strips the rest for free users, so it is never sent to them.
   Diagnostic questions are ordinary attempts, so each uses one of the free user's free versions of that problem. That
   is acceptable because the diagnostic only picks problems the student hasn't tried, so it costs at most one of three.
   Owner B's version cap is not changed.
5. **Plan:** a day-by-day checklist. Each item is a button that opens the real thing (a session, a problem, the mistake
   list). Items tick automatically when the linked work is done.
6. **Checkpoint** on day 7 (and 14): a 10-question mini-diagnostic on the plan's chapters; the plan re-weights.

### 6.2 Algorithm 1: assembling the diagnostic
Input: chapters `C` in scope, length `N`, target mix `M = {EASY: .3, MEDIUM: .5, HARD: .2}` (config), the student's history.

1. **Quota per difficulty:** `n_d = round(N × M_d)`. If a difficulty has fewer eligible families than `n_d`, take what
   exists and **move the shortfall to the nearest difficulty** (Hard→Medium→Easy). Record `requested_mix` and
   `actual_mix`; the results screen states the actual mix. (Today Hard = 0, so a 30-question test is ~9 E / 21 M.)
2. **Eligibility:** a family is eligible if it is published, in scope, FREE or the viewer has Plus, and (preferably) not
   yet attempted by the student. Seen families are used only if unseen ones run out (they measure recall, not skill).
3. **Spread across chapters:** round-robin over chapters in a seeded-shuffled order. Each pass takes one family per
   chapter from the difficulty with the largest remaining quota that the chapter can supply. No chapter gets a second
   question until every in-scope chapter with supply has one. Chapter weights default to 1 each. A hook exists for
   real syllabus weightage if content provides it later; none is invented now.
4. **One variant per family**, picked at random.
5. Order the final list by subject, then interleave difficulties (avoid all Hards at the end).
6. Seeded RNG (`seed = diagnostic id`) makes it reproducible in tests and support.
7. If fewer than `N` exist in total, the test is shortened and the setup screen says so up front.

### 6.3 Algorithm 2: estimating per-chapter mastery
For each chapter `c`, a Beta posterior over "probability the student gets a typical question in `c` right":

- Start `α = 1, β = 1`.
- Each **diagnostic** answer: correct → `α += wc[d]`; wrong → `β += ww[d]`; skipped/unanswered → `β += 0.5 × ww[d]`.
  - `wc = {EASY: 0.75, MEDIUM: 1.0, HARD: 1.5}`: a correct Hard is stronger evidence.
  - `ww = {EASY: 1.5, MEDIUM: 1.0, HARD: 0.5}`: a missed Easy is stronger evidence of a gap.
- **Prior history** (attempts before the diagnostic, from `attempts`): same rule at weight 0.5, with exponential decay
  (half-life 21 days), so it informs without dominating.
- **After the plan starts,** new attempts in that chapter update it at weight 1.0 (the plan adapts).
- `mastery = α / (α + β)`; `evidence = α + β − 2`.
- **Speed flag:** a chapter is *slow* if the median time on its *correct* answers exceeds the budget for the difficulty
  (`E 90 s, M 150 s, H 240 s`, config, labelled internally as heuristics, never shown as "the JEE standard").
- **Band:** `unmeasured` (evidence < 1) · `weak` (< 0.5) · `shaky` (0.5–0.75, or strong-but-slow) · `strong` (≥ 0.75 and evidence ≥ 2).

Shown to students as bands and counts ("2 of 3 correct"), never as a raw percentage.

### 6.4 Algorithm 3: building the plan
Input: chapter estimates, daily minutes `T`, days `D`, today's date (IST).

**Priority** per chapter: `p = (1 − mastery) × confidence_boost × supply`, where `confidence_boost = 1.2` for
`unmeasured` (find out) and 1.0 otherwise, and `supply = min(1, unsolved_eligible_families / 5)`, so chapters with
nothing left to practise sink. `strong` chapters get `p` capped low; they appear only as maintenance.

**Item types** (each maps to something that exists):

| Type | Opens | Used for |
|---|---|---|
| `REVIEW_DIAGNOSTIC` | the diagnostic session's results with solutions | Day 1, first item, always |
| `PRACTICE` | new Learning-mode session: chapter + difficulty filter + size | Core of each day |
| `PROBLEMS` | 2–4 specific problem numbers from the library | Targeted, especially the next difficulty step |
| `MISTAKES` | MISTAKES-mode session for that chapter | Revisiting missed questions on spaced days |
| `TIMED` | test-mode session with a time limit | `slow` chapters |
| `CHECKPOINT` | mini-diagnostic (10 Qs) | Day 7 and day 14 |
| `READ` | a guide URL | **Reserved**; only emitted when the API has a real guide for the chapter |

**Difficulty ladder per chapter:** `weak` → Easy then Medium; `shaky` → Medium then Hard (if any exist); `strong` → Hard,
or Medium if there is no Hard. Steps up after ≥ 70% correct on ≥ 4 plan attempts in that chapter.

**Scheduling:**
1. Time cost estimates (config): Easy 3 min, Medium 5, Hard 7, including reading the solution. Each day is filled up to `T`.
2. Each day touches **at most 2 chapters**, preferably from different subjects (interleaving), and no subject goes
   more than 2 days without an item.
3. **Spacing:** a weak chapter is scheduled on days `k, k+2, k+5, k+9` (expanding intervals); shaky on `k, k+4, k+10`;
   strong once per 7 days as maintenance.
4. Greedy fill: walk the days; for each day pick the highest-priority chapters due by spacing; add `MISTAKES` first if
   the chapter has unresolved mistakes, then `PRACTICE`/`PROBLEMS` at the ladder step, `TIMED` if slow.
5. Day 7 / 14: `CHECKPOINT` replaces half the day's budget.
6. A day with nothing worth doing (tiny bank) is marked a light day, not padded.

**Adaptation (recompute on read):** when the plan is opened, mastery is recomputed from all attempts since plan start.
Days before today and completed items are **frozen**; today's unstarted items and future days are regenerated. The
plan stores its inputs (`config`, diagnostic id, seed), so regeneration is deterministic. A new checkpoint result
re-weights everything after it.

**Completion:** an item is done when its linked session is `COMPLETED` (sessions carry `plan_item_id` in `filters`),
or, for `PROBLEMS`, when each listed problem has an attempt after the item's date.

### 6.5 Data and API (additive, migration `0024`, for Owner B's review)
As built (changed from the first draft):
- One table, `study_plans(id, user_id, exam_id, client_request_id, status ACTIVE|ARCHIVED, diagnostic_session_id,
  chapter_ids uuid[], starts_on, days, daily_minutes, seed, plan_days jsonb, item_sessions jsonb, …)`. The plan is
  re-planned on every read, so separate item rows would churn; days are jsonb instead, and `item_sessions` maps an item key
  to the session it started. One ACTIVE plan per user per exam (partial unique index); a new plan archives the old one and
  never deletes it.
- RLS on, served via the API's service connection (same pattern as 0022).
- `billing_plans.features` is **not** changed yet. The pricing page only shows features it has copy for, and adding
  `study_plan` to the paid plans is Owner B's call when this ships. Gating uses the existing "is Plus" check.
- Diagnostic sessions store their scope and mix in `practice_sessions.filters` (`diagnostic: true, chapter_ids,
  requested_mix, actual_mix, short_by`).

Endpoints (`apps/api/src/plans/`):
- `POST /plans/diagnostic`: config in, creates the diagnostic session (test mode, chosen ids), returns `SessionCreated` plus `actual_mix`. Free.
- `GET /plans/diagnostic/{sessionId}/report`: free users get the per-subject summary and the top 3 focus chapters;
  Plus gets every chapter's band and evidence.
- Diagnostic sessions are created by a new internal repository call that inserts a `practice_sessions` row with
  server-chosen `question_ids`, `mode = 'MIXED'`, `ui_mode = 'test'`, and `filters.diagnostic = true`. The public
  `CreateSessionBody` is **not** changed, so clients still can't choose ids.
- `POST /plans`: from a completed diagnostic, creates the plan. **Plus** (403 `PREMIUM_REQUIRED`).
- `GET /plans/current?exam=`: plan with days/items, recomputed on read. **Plus**.
- `POST /plans/items/{id}/start`: creates the linked session (or returns the problem list) and stores `session_id`. **Plus**.
- `POST /plans/{id}/archive`.

Contracts in `packages/contracts/src/dto/plans.ts` and OpenAPI, with mocks in the web fixtures. The pure algorithm lives in
`packages/plans/` (no DB imports), so the API and the web mock mode share it.

### 6.6 What happens if Plus lapses
The plan is kept (read-only, shown greyed with "Renew to continue"); nothing is deleted. Practice itself stays free.

## 7. Trust and honesty rules
- Every number shown is computed from real attempts. Evidence counts sit next to every judgement.
- `actual_mix` is shown; a missing Hard tier is stated, not hidden.
- No readiness %, rank, percentile or score prediction anywhere.
- Plan copy is plain instructions ("Practice Electrostatics, Medium, 8 questions"), with no motivational text and no kitty
  speech. The kitty appears only as a small sitting figure on the empty/complete state of the plan page.
- AI-checked questions keep their "AI-checked" label inside plan sessions.

## 8. Calls I made (owner to confirm or overturn)
1. The diagnostic and its top-3 summary are **free**; the full report, plan, checkpoints and adaptation are **Plus**.
2. Default mix 30/50/20; diagnostic default 30 questions; plan 7 or 14 days.
3. Bands are shown, not percentages.
4. The library replaces the chapter browser on `/practice/`; quick start stays.
5. API work (`apps/api/src/plans/`, migration `0024`) is built by Owner A as an additive module, following the
   billing precedent. Owner B reviews it before deploying. Check the next free migration number at build time.
6. Work happens on `ownerAkamain` (the owner's instruction, 2026-11-17), first fast-forwarded to `origin/main` to pick
   up Owner B's `/problems`. It goes to `main` by PR once Owner B's questions are in and the issues are fixed.
7. Diagnostic questions count toward the free-version cap (one per problem at most); Owner B's cap is unchanged.

## 9. Open contract items for Owner B
- **C1. Problem excerpts.** The list needs a renderable excerpt (stem with LaTeX intact, truncated), since `title` loses
  maths. Proposal: add `excerpt: ContentBlock[] | string` (first ~160 chars of the first variant's stem, LaTeX kept) to
  `Problem`. Until then the frontend uses `title` and hides obviously broken ones behind "Open to view".
- **C2.** Agree the `0024` tables, the endpoints, and `plan_item_id` in session `filters`.
- **C4. Per-chapter counts.** Add `by_chapter: [{chapter_slug, total, solved}]` to `/problems/summary` (or a separate
  endpoint) so chapter groups show progress without being expanded. The library works without it (§5.2).
- **C3.** Difficulty for Hard: the plan and diagnostic are designed to work with zero Hard, but they are much better with some (FABLEaudit Phase 2).

## 10. Testing
- `packages/plans`: unit tests for quota shortfall, chapter spread, seeded determinism, the Beta updates, bands,
  spacing, budget fill, freeze-on-regenerate, the zero-Hard bank, a tiny bank (10 problems), and a single-chapter scope.
- API: integration tests for Plus gating (403 for free users on plan endpoints), the diagnostic session holding the chosen
  ids, and the plan surviving a lapse.
- Web: library filters/URL state, locked rows, problem page solve → list shows solved, plan checklist ticking, 360 px,
  keyboard-only, `noindex` on all private routes.

## 11. Left to the builder
Exact component breakdown, chart choice for the results breakdown, copy polish, and the order of commits.

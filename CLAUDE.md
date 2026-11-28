# CLAUDE.md — JEE / NEET Learning Platform

You are the implementation partner for the **frontend and SEO workstream (Person 1)** of a JEE/NEET exam-preparation platform. This file is the product, UX, design, architecture, and integration handoff. Read it before making changes.

## 1. Product in one sentence

Build a focused, high-quality practice platform for JEE students — “LeetCode for JEE/NEET” — where students can discover questions, practice deliberately, understand solutions, identify weaknesses, and improve over time.

The product should feel serious enough for high-stakes exam preparation, but distinctive and memorable through a restrained retro-gaming visual language and the user's kitty mascot.

## 2. Product principles

1. **Practice is the core loop:** practice → understand → improve.
2. **Clarity beats decoration:** students may solve 100 questions in a sitting. Keep the interface calm, fast, readable, and low-friction.
3. **Trust the content:** show answer/solution verification status and source context where appropriate. Never imply AI is infallible.
4. **No fake performance promises:** do not invent predicted ranks, percentiles, or guaranteed outcomes.
5. **Mobile-ready, desktop-excellent:** responsive web app/PWA. CBT should be especially comfortable on laptop/desktop, while remaining usable on tablets.
6. **Build for JEE Main first, without blocking JEE Advanced or NEET later.**
7. **Separate responsibilities:** Person 1 owns frontend and SEO. Person 2 owns backend, database, ingestion, and AI verification. Agree contracts; do not guess them.

## 3. Target scope and roadmap

### MVP — JEE Main
- Public marketing/SEO pages.
- Authentication and onboarding UI.
- Student dashboard.
- Chapter/topic/year/difficulty question discovery.
- MCQ and numerical-answer practice.
- Learning mode and test mode.
- PYQ browsing and full-paper entry points.
- Solutions, hints, scratchpad, calculator, question navigation.
- Bookmarks, review list, mistake notebook.
- Results and basic performance analytics.
- Responsive layouts and accessible interactions.
- Admin-facing functionality is owned primarily by Person 2; coordinate any UI needs rather than building an independent backend.

### Later phases
1. Personalization and adaptive study plans.
2. Premium analytics, curated PYQ packs, mock tests, subscriptions.
3. NEET support and Biology.
4. Image/handwriting uploads for doubt-solving and working analysis.
5. Native iOS/Android clients using the same backend/API.

Do not overbuild future features into the MVP. Keep architecture extensible without implementing speculative complexity.

## 4. Person 1 ownership

### Frontend
- Landing page and public-facing pages.
- Authentication and onboarding UI.
- Student dashboard.
- Question browsing and practice interface.
- Solution and question detail pages.
- Bookmarks, review list, mistake notebook.
- Test/CBT interface and results UI.
- Responsive layouts, reusable components, interaction states, accessibility, and frontend performance.

### SEO
- URL architecture and public page templates.
- SSR/SSG for indexable public pages.
- Dynamic titles, descriptions, canonical URLs, Open Graph metadata.
- Subject, chapter, topic, PYQ, and individual-question public pages.
- Breadcrumbs and internal linking.
- Sitemap and robots directives.
- Appropriate JSON-LD structured data.
- 404/redirect handling.
- Search Console and analytics integration.

Person 1 does **not** own database schema, ingestion jobs, OCR, solution generation, answer verification, or backend business logic.

## 5. Information architecture and routes

Use a clear, consistent route system. The following is a proposed starting point, not a reason to duplicate pages unnecessarily:

### Public/indexable
- `/` — landing page.
- `/jee/` — JEE hub.
- `/jee/physics/`, `/jee/chemistry/`, `/jee/mathematics/` — subject hubs.
- `/jee/physics/electrostatics/` — chapter/topic pages.
- `/jee/pyq/` — PYQ hub.
- `/jee/pyq/2025/` — year-specific PYQ page, where content warrants a useful landing page.
- `/jee/questions/[slug]/` — individual public question pages, only when they provide substantial value.
- `/study-plans/` — plans overview.
- `/resources/` — useful guides/resources.
- Future: `/neet/` and subject/chapter routes under it.

### Authenticated/private
- `/login/`, `/signup/`
- `/onboarding/`
- `/dashboard/`
- `/practice/...`
- `/bookmarks/`
- `/mistakes/`
- `/review/`
- `/tests/...`
- `/account/...`

Private dashboards, private attempts, internal search results, and personalized pages should generally be `noindex`. Do not expose private student data in public pages, metadata, or structured data.

### SEO indexing policy
- Index only pages with unique, useful, sufficiently complete content.
- Avoid generating thousands of thin programmatic pages.
- Canonicalize filter/sort combinations to the meaningful base page unless a filter page has independent search value.
- Do not rely on `robots.txt` to prevent indexing of a page that should be `noindex`; crawlers need access to see the directive.
- Avoid exposing duplicate question variants as separate indexable pages.
- Build internal links that help both students and crawlers discover meaningful content.

## 6. UX modes and practice behavior

There are two distinct learning experiences. They may share the underlying question engine and data types, but should not look identical.

### A. Learning mode
Purpose: understand and learn while practicing.
- Immediate correctness feedback after answer submission.
- Show the correct answer and a detailed solution.
- Offer hints and AI follow-up assistance.
- Keep the current question context visible.
- Allow bookmarking, marking for review, reporting, scratchpad, calculator, and question navigation.
- Clearly distinguish hints from the final solution.
- Do not claim an AI explanation is authoritative when verification is uncertain.

### B. Test mode
Purpose: simulate a test without immediate answer disclosure.
- Save selected answers without revealing correctness.
- Allow question navigation and marking for review.
- Show remaining time when a timed test is configured.
- No hints or AI assistance during the attempt.
- Report-question action may remain available, but must not reveal the answer.
- On submission, show results and then allow full solution review.
- Preserve the submitted attempt and its responses, time, and review flags.

### C. CBT simulation
CBT is a dedicated exam-like visual shell, not simply a theme toggle on the normal practice page.
- It can be launched before starting a paper.
- After completing a normal paper, invite the student to retry the same paper in CBT.
- It can also be launched directly from a full PYQ paper.
- A retry is a **new attempt**. Never overwrite the original attempt, score, or history.
- No AI assistance, hints, or solution reveal during the CBT attempt.
- Include timer, question palette, subject/section navigation, answer status, mark-for-review, save/next, clear response, final submission confirmation, and results/solutions after submission.
- Autosave answers and attempt state.
- Handle network interruption/reconnection gracefully and communicate save status.
- Never silently discard student answers.
- Handle browser full-screen limitations gracefully; do not make full-screen mandatory if the browser refuses it.
- Make exam rules configurable by exam/paper rather than hardcoding one exam's behavior into the question component.
- The kitty mascot must be completely absent from the CBT exam interface.

### Shared practice tools
Normal practice supports:
- Timer (when applicable).
- Bookmark.
- Mark for review.
- Question navigation.
- Report question.
- Calculator.
- AI hint (Learning mode only).
- Scratchpad.
- Keyboard shortcuts.
- Clear answer where relevant.

Keyboard shortcuts must be discoverable, avoid interfering with text inputs, and have accessible alternatives.

## 7. Question, answer, and solution UX

Support JEE Main question types:
- Single-correct MCQ.
- Multiple-correct MCQ if/when the source paper requires it.
- Numerical value answer.

Do not assume every future exam has identical question rules. NEET and other exam formats should be configurable.

A question view should make it easy to:
- Read the stem and any attached figure/table.
- Read mathematical notation cleanly.
- Select/enter an answer.
- See saved/submitted state.
- Navigate to another question.
- Mark/bookmark/report.
- Open hints/solution only when the mode permits.

Use a robust math-rendering solution (for example KaTeX or MathJax) and ensure it works on narrow screens. Preserve meaningful alt text for question figures. Avoid clipping long equations or diagrams.

### Solution presentation
- Separate final answer from the reasoning.
- Use clear step-by-step formatting.
- Render equations and diagrams reliably.
- Show official answer/key context when supplied.
- Show verification state and provenance when available.
- If the solution is disputed, incomplete, or not verified, communicate that accurately.
- AI-generated content must not be labelled “official” unless it truly is official source material.

## 8. Dashboard, progress, and retention

The dashboard uses a hybrid layout:
- Daily goal and streak near the top.
- Practice is the primary action.
- Analytics and performance insights below the main action.
- Avoid a cluttered dashboard full of competing cards.

Potential progress features:
- Activity heatmap.
- Current and longest streak.
- Questions practiced and accuracy trends.
- Subject/chapter breakdown.
- Time spent and consistency.
- XP, achievements, weekly challenges.
- Cosmetic kitty unlocks.

Streaks should reflect meaningful practice, not simply opening the app. Avoid manipulative interruptions, shame-based messaging, or noisy notifications. XP and achievements should reinforce learning, not reward meaningless clicks.

### Keep these three lists distinct
- **Bookmarks:** questions the student intentionally saves.
- **Review list:** questions explicitly marked for later review.
- **Mistake notebook:** questions the student answered incorrectly, captured automatically, with optional categorization such as conceptual gap, calculation error, formula recall, misread question, or time pressure.

Mistake notebook should support reattempting questions and, later, spaced-repetition scheduling. Do not conflate it with bookmarks or the review list.

## 9. Navigation and responsive behavior

Navigation direction chosen:
- Minimal top navigation; no permanent desktop sidebar.
- Desktop: compact horizontal navbar.
- Mobile: logo, compact kitty treatment, and hamburger navigation for visitors (with Sign up always visible).
- Signed-in phones and tablets: a five-item bottom tab bar (Home, Practice, PYQs, Notebook, Progress), hidden in the practice player and the CBT; the hamburger holds account items (owner decision 2026-11-28, UX audit section E).
- One auth-aware header on every route with chrome (`src/components/layout/nav.ts`). Signed out: Practice, PYQs, Study plans, Pricing. Signed in: Home, Practice, PYQs, Notebook, Progress; the avatar menu holds Study plan, Account & billing and Sign out.
- Initial navigation concepts were Practice, PYQs, Plans, Profile; Plans moved into Home as its "what next" answer and Notebook was added for the three lists in §8.
- Practice screen should minimize distractions.
- CBT uses its own exam-focused shell.

Responsive design must be intentional, not merely shrink desktop layouts. Consider:
- Touch target sizes.
- Mobile equation/diagram overflow.
- Sticky action bars only when they do not obscure content.
- Keyboard focus and visible focus states.
- Reduced-motion preferences.
- Loading, empty, error, offline, and retry states.

## 10. Visual identity and design system

### Overall direction
The visual style is primarily **modern, minimal, academic, and high-contrast**, with a restrained amount of retro-gaming character.
- Mostly clean and contemporary.
- Occasional pixel details, small retro UI touches, and subtle animations.
- Do not turn the entire product into an arcade/pixel-art interface.
- Academic seriousness and long-session readability come first.
- Use strong black/white contrast.
- Subject accent colors belong mainly in titles, headings, small indicators, tags, and progress graphs — not as giant colored panels.

### Suggested palette (starting tokens; tune for accessibility)
- Background: `#080808`
- Surface: `#171717`
- Primary text: `#FFFFFF`
- Muted text: `#858585`
- Physics: `#60A5FA`
- Chemistry: `#4ADE80`
- Mathematics: `#FACC15`
- Biology (future): `#C084FC`

Treat these as initial design tokens, not immutable brand law. Check contrast, especially muted text and accent colors on dark surfaces. Establish light/dark behavior only if there is a product reason; do not create a half-finished theme system.

### Typography
A sensible starting combination:
- Headings: Space Grotesk or another distinctive but readable sans.
- Body/UI: Inter or a highly legible system sans.
- Math: KaTeX/MathJax fonts.
- Pixel font: decorative use only, never for long-form reading, question stems, or solutions.

Choose and load fonts efficiently. Avoid layout shifts.

### Components
Create a consistent system for:
- Buttons and icon buttons.
- Inputs and numerical answer fields.
- MCQ options and selected/correct/incorrect/disabled states.
- Question cards and question navigation.
- Status chips and verification labels.
- Subject/chapter tags.
- Timers and progress indicators.
- Dialogs, drawers, tooltips, toasts.
- Empty/loading/error states.
- Tables and analytics charts.

Use design tokens and reusable components. Avoid one-off styles that drift across pages.

## 11. Kitty mascot — canonical brand asset and rules

The user-provided reference image is included at:

`assets/mascot-reference.jpg`

**Use this image as the canonical mascot reference.** Do not replace it with a generic generated cat or invent a different cat identity.

The mascot personality is a combination of:
- A silent companion.
- A mysterious guide.

Absolute rules:
- The kitty does not speak.
- No speech bubbles.
- No dialogue, sarcastic copy, motivational quotes, or chatty messages.
- No interruptions during study.
- No mascot presence anywhere in the CBT exam interface.
- The kitty is a visual companion, not a support chatbot.

Suggested appearances:
- Landing page: prominent brand/hero illustration.
- Onboarding: quiet companion, used sparingly.
- Dashboard: small, unobtrusive placement.
- Loading: subtle, tasteful animation if it does not delay content.
- Empty states: sitting/sleeping poses.
- Milestones/achievements: occasional cosmetic appearance.
- 404: a quiet “lost” visual.
- Compact contexts: face, silhouette, or small icon derived from the original.

### Character vs symbol treatment
Use a **hybrid system**:
- Full character poses for brand moments, landing-page illustration, selected empty states, and achievements.
- Simplified face/silhouette mark for favicon, navbar, compact UI, and small-size use.

Preserve the distinctive appearance and identity from the reference. Derive alternate poses/expressions from the same reference rather than creating unrelated cats. Keep the overall treatment compatible with the monochrome visual system; restrained pixel-art treatments may be used for small achievement/cosmetic moments. Any animation should be subtle, optional where appropriate, and respect `prefers-reduced-motion`.

If the image-generation workflow cannot faithfully preserve the mascot, use the supplied image directly or create a simplified trace/asset from it rather than substituting a different character. Keep source assets and generated variants organized and labelled.

## 12. Content trust and verification UI

The content/backend workstream may expose statuses such as:
- Extracted.
- Processed.
- AI checked.
- Official-key checked.
- Human reviewed.
- Disputed.

The frontend should render only statuses and provenance actually returned by the backend. Do not invent verification claims. Use neutral, understandable labels and explanatory tooltips/help text where useful.

Potential evidence behind verification (backend-owned):
- Official answer key comparison.
- Independent solution check.
- Deterministic mathematical validation (for example, symbolic/numeric checks).
- Human review for ambiguity or conflicting sources.
- Provenance and verification history.

The UI should support uncertainty honestly. A “verified” badge must have a clearly agreed meaning with Person 2.

## 13. Frontend technical approach

Recommended default, subject to the actual repository and team agreement:
- Next.js with App Router.
- TypeScript, strict mode.
- Tailwind CSS plus a consistent component approach.
- Server Components for public content where useful.
- Client Components only for interactive stateful experiences.
- SSR/SSG/ISR according to page freshness and indexability.
- A shared API client layer, not ad hoc fetch calls in every component.
- Schema validation at API boundaries (for example Zod), once contracts are agreed.
- KaTeX or MathJax for mathematics.
- Accessible primitives for dialogs, menus, tabs, and popovers.
- PWA support only when offline behavior and caching rules are deliberate.

Do not add libraries without a clear need. First inspect the existing repository, package manager, conventions, and installed dependencies. Preserve working project choices unless there is a strong reason to change them.

### State management
- Keep ephemeral UI state local where possible.
- Keep attempt/answer state in a robust shared practice-session layer.
- Persist answers through backend APIs according to Person 2's contract.
- Do not treat browser local storage as the authoritative source of test attempts.
- Make optimistic updates only when rollback/error behavior is defined.

### Security
- Never expose database credentials, service-role keys, or private API keys in browser bundles.
- Do not trust client-supplied score, user ID, verification status, or entitlement claims.
- Enforce authorization on the server/API; frontend route guards are not security.
- Avoid leaking private question attempts or student analytics in public cache/SEO pages.

## 14. Person 1 ↔ Person 2 integration contract

This is a critical project boundary.

### Ownership
**Person 1**
- Page layouts, components, visual system, client-side interactions.
- Frontend routing, metadata, public rendering, SEO.
- API client integration and user-facing loading/error/empty states.

**Person 2**
- Database schema and migrations.
- Authentication backend and authorization rules.
- Question ingestion, OCR/extraction, normalization, deduplication.
- Syllabus classification and source provenance.
- Solution generation and answer verification.
- Attempt persistence/scoring business logic.
- Backend APIs and operational jobs.

### Non-negotiable integration rules
1. Agree API contracts before wiring real data.
2. Person 1 must not invent response fields or backend capabilities.
3. Person 2 should not need to dictate the visual design.
4. Keep shared TypeScript types/schemas in a documented shared location or generate them from the API schema.
5. Mock data must conform to the agreed contract, not a parallel frontend-only model.
6. Use stable IDs for questions, users, papers, and attempts.
7. Frontend must not depend on internal ingestion pipeline details.
8. Keep secrets and privileged operations server-side.
9. Document pagination, sorting, filtering, errors, and authorization behavior.
10. If a contract changes, update shared types, mocks, and consuming UI together.

### Draft domain concepts — not final API schemas
These are conceptual entities to discuss with Person 2. Do not assume these exact fields are available until both people agree.

- `Question`: stable ID, exam, subject, chapter/topic, question type, stem, options, figures/assets, difficulty, year/source, answer/solution visibility, verification metadata.
- `Attempt`: stable ID, user, mode, paper/session, start/end timestamps, status, responses, timing, review flags, score/result summary.
- `Response`: question ID, selected option(s) or numerical value, status, time spent, saved timestamp.
- `Solution`: final answer, explanation steps, assets, source/verification metadata.
- `UserProfile`: exam target, attempt preferences, onboarding choices, goals.
- `Bookmark`: user/question association.
- `MistakeRecord`: user/question/attempt association, error category, review state.
- `Paper`: exam, year, paper/shift, ordered question IDs, timing/rules.

### Contract discussion checklist
Before integration, agree:
- Authentication mechanism and session handling.
- Question list/detail response shape.
- Question media and math content representation.
- Answer submission format for each question type.
- Learning vs test vs CBT mode rules and server enforcement.
- Attempt creation, save, autosave, resume, submit, and retry endpoints.
- Scoring rules and negative marking configuration.
- Paper/question ordering and exam metadata.
- Solution/hint endpoints and availability rules.
- Bookmark/review/mistake APIs.
- Analytics aggregation and time ranges.
- Pagination/filter conventions.
- Error format and retryability.
- Rate limits and AI feature entitlement behavior.
- Verification-status vocabulary and definitions.
- Versioning/compatibility strategy.

### Example API surface for discussion only
Do not implement these endpoint names unless Person 2 agrees:
- `GET /questions`
- `GET /questions/{questionId}`
- `GET /papers/{paperId}`
- `POST /attempts`
- `GET /attempts/{attemptId}`
- `PATCH /attempts/{attemptId}/responses`
- `POST /attempts/{attemptId}/submit`
- `GET /attempts/{attemptId}/results`
- `GET /questions/{questionId}/solution`
- `POST /questions/{questionId}/hint`
- `GET/POST/DELETE /bookmarks`
- `GET /mistakes`
- `GET /analytics/summary`

Use an OpenAPI document or shared schema package as the source of truth where practical.

### Mocking strategy
- Create realistic fixture data for UI development.
- Fixtures should pass the same validation/types as API responses.
- Clearly label mock mode in development.
- Do not ship fake analytics or fake “verified” states as real production data.
- Include edge cases: missing diagrams, long stems, numerical answers, disputed answers, no solution yet, empty chapter, API failure, expired session, and interrupted attempt.

## 15. SEO implementation details

### Metadata
Every public page should have:
- Unique title.
- Useful, non-spammy description.
- Canonical URL.
- Open Graph title/description/image where appropriate.
- Correct robots directives.
- Correct language and viewport metadata.

Avoid repetitive title templates that produce hundreds of near-identical pages.

### Structured data
Use only types that genuinely describe visible page content. Candidates:
- `Organization` and `WebSite` for the platform.
- `BreadcrumbList` for navigable hierarchy.
- `Article` for substantive editorial guides.
- Question/education-related markup only when it is valid and the page qualifies.
- Do not add misleading `QAPage`/`FAQPage` markup merely to seek rich results.

Validate JSON-LD and keep it consistent with visible content.

### Technical SEO
- Server-render public content.
- Generate XML sitemap(s) from eligible public content.
- Use robots directives thoughtfully.
- Add redirects for changed slugs and removed URLs.
- Avoid broken internal links and orphan pages.
- Optimize image size and loading priority.
- Keep Core Web Vitals in mind.
- Ensure math content remains crawlable/readable where possible.
- Do not expose private student data to crawlers.
- Add Search Console and analytics after property/consent configuration is agreed.

### Content quality
Programmatic SEO is acceptable only when each generated page is genuinely useful and distinct. Do not publish thin pages containing only a title, a question count, and repetitive AI text. A useful chapter page might include a concise chapter overview, relevant question set, topic structure, exam/year context, and helpful links — but only render claims supported by real data.

## 16. Accessibility, quality, and testing

Minimum expectations:
- Semantic HTML and landmarks.
- Keyboard-accessible navigation and controls.
- Visible focus states.
- Labels and helpful validation for all inputs.
- Sufficient color contrast.
- Screen-reader announcements for answer saved/submitted and timer-related status where appropriate.
- Reduced-motion support.
- Do not use color alone to communicate correct/incorrect/review states.
- Avoid tiny click targets.
- Test responsive widths and zoom.

Test important flows:
1. New user signup → onboarding → dashboard.
2. Browse subject/chapter → open question → answer in Learning mode → see solution.
3. Test mode → answer several questions → mark for review → submit → inspect result.
4. CBT launch → save/next → clear response → review → submit → results.
5. Retry same paper → ensure a new attempt is created.
6. Bookmark/unbookmark.
7. Wrong answer → mistake notebook → reattempt.
8. Empty/error/loading states.
9. Mobile practice and navigation.
10. Public SEO page metadata, canonical, sitemap, structured data, and `noindex` private pages.

## 17. Execution plan for Claude Code

Work in deliberate stages. Do not try to build the entire platform in one giant pass.

### Stage 0 — Inspect and report
- Inspect repository, package manager, framework, conventions, and existing code.
- Identify what already exists.
- Report proposed architecture and any conflicts with this handoff.
- Ask only essential questions; do not ask the user to re-decide settled product choices.

### Stage 1 — Foundation
- Establish app structure, tokens, typography, reusable UI primitives.
- Set up linting, type checking, and testing consistent with the repo.
- Build responsive top navigation and public/private layout shells.
- Add mascot asset handling and favicon/symbol treatment.

### Stage 2 — Public site and SEO foundation
- Landing page with intuitive information hierarchy (do not force a rigid wireframe).
- JEE hub, subject/chapter templates, PYQ hub.
- Metadata, canonical, breadcrumbs, sitemap/robots foundations.
- Use credible placeholder content only where API/content is not ready.

### Stage 3 — Student shell
- Auth and onboarding UI.
- Hybrid dashboard.
- Practice discovery and filters.
- Loading, empty, error, and responsive states.

### Stage 4 — Practice engine UI
- Shared question renderer.
- Learning mode.
- Test mode.
- Solutions, hints, scratchpad, calculator, navigation, bookmarks, review.
- Do not wire guessed API shapes; use typed fixtures until contracts are agreed.

### Stage 5 — CBT and results
- Separate CBT shell.
- Timer, palette, navigation, review, autosave status, submission confirmation.
- Results and question-by-question review.
- Confirm retries create separate attempts through the agreed API.

### Stage 6 — Personal study tools
- Mistake notebook.
- Review list.
- Analytics and progress.
- Streaks/achievements without noisy gamification.

### Stage 7 — Integration and hardening
- Integrate Person 2's agreed API contracts.
- Validate loading/error/authorization behavior.
- Test attempt persistence and reconnect flows.
- Accessibility, performance, responsive QA, SEO validation.

At the end of each stage:
- Summarize what changed.
- List files/components added.
- Run relevant lint/typecheck/tests.
- Identify blockers and unresolved API questions.
- Do not silently make product decisions that contradict this handoff.

## 18. Final instruction

Build a product students can comfortably use for long, serious study sessions. Make it polished and memorable, but never let visual novelty, animations, gamification, or clever architecture get in the way of solving questions and understanding them.

When uncertain:
1. Preserve the student's work and trust.
2. Prefer clarity and consistency.
3. Keep the frontend/backend boundary explicit.
4. Ask for a decision only when it is genuinely blocking.
5. Do not invent data, verification, exam rules, or backend capabilities.

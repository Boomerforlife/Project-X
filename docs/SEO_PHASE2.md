# SEO Phase 2: search ranking and AI visibility (2026-11-21)

Scope: why tabbyprep.in does not show for generic JEE searches or in AI answers, what was changed in the repo, and what to do next.
Rule for this document: **[DONE]** = implemented in the repo in this phase; **[REC]** = recommendation, not implemented. No rankings, traffic or
AI citations are claimed; none have been measured yet.

---

## 0. Root causes (in order of impact)

1. **The live site did not say "TabbyPrep".** Until commit 64f09b7 every title, the wordmark and the JSON-LD said "Tabby"
   ("Tabby — Deliberate practice for JEE & NEET"). Google and AI assistants cannot associate the brand "TabbyPrep" with a site that never uses the word.
   Google Autocomplete returns **no suggestions at all** for "tabbyprep", and "tabby prep" is dominated by the Tabby BNPL payments brand.
2. **The homepage did not say what the site is.** H1 was "Practise. Understand. Improve"; the title did not contain "JEE Main", "PYQ" or "practice".
3. **Claims beyond the content.** The hero said "JEE Main · JEE Advanced · NEET" and the /jee/ title "JEE Main & Advanced practice", but the DB has
   **0 published JEE Advanced or NEET questions**. That is a trust problem and a relevance mismatch.
4. **Question pages are thin.** All 4,449 question URLs in the sitemap have the question (OCR'd text + image) and the official answer, but **no worked
   solution**. The 433 questions that do have step-by-step solutions are `noindex` (AI-consensus answers, no year). Several stems also carry OCR noise
   from the paper template ("Orientation : Vertical Correct Marks : 4 Wrong Marks : 1").
5. **No authority yet.** A new domain with no mentions, no profiles (`SITE_PROFILES` is empty) and no backlinks. Generic head terms
   ("online JEE preparation") are owned by PW, Vedantu, Careers360, Allen, etc. and will not move in weeks.

Crawl access is **not** a problem: Googlebot, Bingbot, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and CCBot all receive HTTP 200 and the full
server-rendered HTML for chapter pages; robots.txt is `Allow: /`; Google-Extended is not disallowed.

---

## 1. Competitor analysis

Researched 2026-11-21 via web search and direct page fetches. **EdLoop, PracticeJEE, Mastiva and PYQGenius returned no results** in search; they may be
too new, renamed or misspelled. Send the URLs to analyse them.

| Site | What ranks | Why it is discoverable | What to learn / where TabbyPrep differs |
|---|---|---|---|
| **PrepWiser** (prepwiser.in), the closest direct competitor | `/pyq-pdfs/jee-main/<chapter>/` pages, title e.g. "Permutations & Combinations JEE Main PYQs PDF (2020–2026), Free Download" | ~2,300 words per chapter page of **real data**: questions per year, per shift, MCQ vs numerical, difficulty mix, most-asked topics, repeated questions, "latest paper", free no-login PDF + practice. YouTube channel. Claims 11,645 questions. | Their app pages (`/learn/...`) are client-rendered with no H1 and no canonical, so only the PDF pages rank. **TabbyPrep's chapter pages already server-render every question as a crawlable link.** Gap we closed this phase: the per-chapter year/type/difficulty analysis. Gaps left: topic-level tagging (we have 0 topic tags), per-shift averages, repeat detection, PDFs. |
| **ExamSide** (questions.examside.com) | "JEE Main Previous Year Questions Chapter wise with Solutions" | Huge breadth (15 exams), years of age and links, a page per question with solutions | Generic and ad-heavy. Differentiate on focus (practice loop, mistake notebook, CBT) and on honest answer provenance. |
| **SATHEE** (sathee.iitk.ac.in, IIT Kanpur / Govt.) | JEE PYQ by year/subject/chapter | Government + IIT authority | Returned 403 to our fetcher. Unbeatable on authority; compete on UX, not trust signals. |
| **PW / Vedantu / Careers360 / eSaral / Collegedunia** | "chapter wise pyq pdf", "mock test free", weightage articles | Massive domain authority, editorial volume, PDFs | Not beatable on head terms soon. Their weightage tables are mostly estimates without stated methodology; ours are counted with stated limits. |
| **Apps** (PYQpro, JEEPrep, Divine JEE PYQ, Marks-style apps) | App stores | Store search | Web-first with indexable pages is our channel; native later (CLAUDE.md §3). |

**Realistic differentiation for TabbyPrep**
1. *Counted, stated-methodology data* (weightage, per-chapter year tables): verifiable facts that AI assistants and students can cite.
2. *Honest provenance per question* ("matches official key" vs other labels). Nobody else shows this consistently.
3. *Practice loop in the browser, free:* learning/test mode, mistake notebook, CBT. Most competitors push PDFs.
4. *Clean, fast, no-clutter pages* (no ad walls on questions/CBT).

---

## 2. Keyword strategy

Sources: Google Autocomplete (India, en, 2026-11-21) and competitor titles. **No search volumes, difficulty or competition scores are given because no keyword
tool with that data was available.** Fill volumes from Search Console / Keyword Planner later. The live list is in
[`docs/seo/keyword-tracking.csv`](seo/keyword-tracking.csv).

What Autocomplete shows students type (verbatim suggestions):
- `kinematics jee mains pyq`, `kinematics jee mains pyq 2026`, `kinematics jee mains weightage`: **chapter + exam + PYQ** is the dominant pattern.
- `jee main chapter wise weightage` (+ `2026`, `2027`, `analysis`, `physics`, `chemistry`, `maths`, `last 10 years`).
- `<chapter> jee mains questions with solutions` (trigonometry, matrices, integration, thermodynamics, limits, probability).
- `jee main 2026 pyq chapterwise physics|chemistry|maths`.
- `free jee mock test without login`, `free jee mock test chapter wise`.
- `best website for jee pyqs`, `best website for jee preparation free`.
- `can i do jee preparation without coaching`.

**Priority**: chapter long-tail (57 chapter pages × "<chapter> jee mains pyq") and weightage first; subject and hub terms second; generic
"online JEE preparation" last (brand/authority-driven).

### Keyword → URL map (one intent per URL, no cannibalisation)

| Intent | URL | Primary terms |
|---|---|---|
| Brand + "what is it" | `/` | tabbyprep, tabby prep, online JEE preparation (free), practice JEE questions online free |
| Brand facts (AI/press) | `/about/` | what is TabbyPrep, TabbyPrep JEE |
| All chapters, JEE Main | `/jee/` | jee main chapter wise questions/pyq, jee practice online, jee question bank chapter wise |
| Subject | `/jee/{physics,chemistry,mathematics}/` | jee main physics pyq, jee mains maths practice questions |
| Chapter | `/jee/<subject>/<chapter>/` | <chapter> jee mains pyq, <chapter> jee mains questions (with solutions) |
| Weightage | `/jee/chapter-weightage/` (#subject anchors) | jee main chapter wise weightage (+ subject) |
| Single question | `/jee/questions/<slug>/` | the question's own words (long-tail match on question text) |
| Mock tests | **[REC]** `/jee/mock-tests/` | free jee mock test (online, without login) |
| Papers by year | `/jee/pyq/`, `/jee/pyq/<year>/` (hidden in prod by the papers flag) | jee main 2026 pyq, jee main question paper 2025 |
| JEE Advanced | **none until content exists** | |
| Self-study guide | **[REC]** `/resources/<slug>/` | jee preparation without coaching |

---

## 3. Homepage [DONE]

- Title: **"TabbyPrep: Free JEE Main PYQs & Chapter-wise Practice Online"** (was "Tabby — Deliberate practice for JEE & NEET").
- H1 now reads "TabbyPrep: online JEE preparation with previous-year questions, chapter by chapter" + the unchanged display line
  "Practise. Understand. Improve" (same visual identity; one H1).
- Hero pill and lede name only exams that have questions (JEE Main today), no NEET/Advanced claims.
- New **"What's inside"** section: live counts from the API (questions per subject, chapters) and links to the 4 most-asked chapters per subject, the
  chapter list and the weightage page. Gives crawlers 12+ contextual links into chapter pages from the strongest page.
- New **"Before you start"** visible Q&A (what it is, is it free, where questions come from, studying without coaching, most-asked chapters). Plain
  `<dl>`, **no FAQPage markup** (CLAUDE.md §15; Google restricts FAQ rich results anyway).
- Existing sections (loop, modes, trust, exams) kept.

## 4. Landing pages

| Page | Status | What changed |
|---|---|---|
| Chapter pages (57) | **[DONE]** | Title "<Chapter> JEE Main PYQs: N Questions with Answers" (N = previous-year questions only, e.g. Kinematics 73, not the 88 incl. practice questions); H1 adds "JEE Main previous-year questions"; description with count + exact years; new **"How often <chapter> comes up in JEE Main"** section: PYQ count, peak year, MCQ/numerical split, per-year table, estimated difficulty mix, methodology note (practice questions excluded), link to weightage. All computed from the questions already on the page. |
| Subject pages (3) | **[DONE]** | Title "JEE Main Physics PYQs Chapter-wise, with Answers" (no number: the subject count includes practice questions); description "1,726 ... questions, most of them PYQs"; H1 "JEE Main Physics Chapter-wise previous-year questions"; link to weightage. |
| `/jee/` hub | **[DONE]** | Title "JEE Main Chapter-wise Questions: Physics, Chemistry & Maths PYQs" and H1 "JEE Main chapter-wise practice" while JEE Main is the only exam with content (falls back automatically when Advanced ships); weightage link. |
| `/jee/chapter-weightage/` | **[DONE] new** | Title "JEE Main Chapter-wise Weightage: PYQs per Chapter, Year by Year". Counts **PYQs only** (4,482 today: Physics 1,566 · Chemistry 1,380 · Maths 1,536). Most-asked 5 chapters per subject; full table per subject (PYQs, share, per-year columns); methodology & limits; links to every chapter. In sitemap. NEET variant returns 404/noindex. |
| Mock tests landing | **[REC] P1** | `/jee/mock-tests/`: what the CBT simulates, marking, free allowance (2 full papers/month), list of available papers. Needs `getPublicPapers` to return real papers (papers endpoint, Person 2). |
| JEE Advanced practice | **[REC] not now** | 0 published questions; a page would be thin and misleading. |
| Physics/Chemistry/Maths "practice" pages | covered by subject pages | Separate pages would cannibalise the subject hubs. |

## 5. Question database (read-only queries, 2026-11-21)

| Fact | Value |
|---|---|
| Published questions | **5,258** (2,532 drafts) |
| Exams | JEE Main 5,258 · JEE Advanced 0 · NEET 0 |
| Subjects | Physics 1,766 · Chemistry 1,726 · Mathematics 1,766 |
| Chapters | 57 (all published questions have a chapter) · topic tags: **0** |
| Years | 2019: 1 · 2020: 518 · 2021: 1,881 · 2024: 1,154 · 2025: 598 · 2026: 673 · no year: 433 · **2022 and 2023 missing** |
| Types | single MCQ 3,727 · numerical 1,530 · multi-MCQ 1 |
| Difficulty (classifier-estimated) | easy 2,026 · medium 2,930 · hard 302 |
| Answers | official key matched 4,825 · AI-consensus 433 |
| Worked solutions (steps) | 433, all `noindex`; **0 of the 4,449 sitemap questions** |
| Origin | PYQ 4,825 (all have a year) · AI_GENERATED practice questions 433 (none has a year). The year field therefore separates PYQs from practice questions in the frontend. |
| Public API counts | 4,915 questions (1,726 / 1,492 / 1,697), of which 4,482 PYQs. The DB has 5,258 published; the API exposes fewer (backend filter, Person 2 to confirm which). |
| Access | all FREE; papers in DB: JEE Main 74, JEE Advanced 20, NEET 2 |

**Opportunities, in order**
1. **[REC][Person 2] Worked solutions for indexed questions.** Biggest quality lever for 4,449 pages and for "questions with solutions" queries.
   Start with the most-asked chapters. Until then, consider indexing only questions with clean text (see 3).
2. **[REC][Person 2] Ingest 2022–2023 papers.** Closes the year gap that weakens every "2020–2026" style query and the weightage table.
3. **[REC][Person 2] Strip paper-template OCR noise** ("Orientation : Vertical Correct Marks : 4 Wrong Marks : 1") from stems.
4. **[REC][Person 2] Topic tagging** (0 today). Unlocks "most-asked topics" per chapter like PrepWiser, and topic pages later.
5. **[REC] Repeat-question detection** (`question_families` has 94 rows): "came back in a later paper" is a strong, unique fact per chapter.
6. **[REC] Year pages** (`/jee/pyq/2026/`) once the papers flag is public.

## 6. Content authority: editorial calendar (30)

Identity: plain, student-to-student, data-first; every number traceable to the site's own counts or to NTA documents; **no invented authors,
credentials, toppers, ranks or endorsements**. Byline "TabbyPrep" until a real named author exists. Review process: each piece gets (a) a
data check against the live API, (b) a subject check by someone who has cleared JEE Main-level material, (c) a "last reviewed" date, re-reviewed when
NTA publishes a new paper/syllabus. Publish under `/resources/<slug>/` with `Article` JSON-LD only for real articles.

| # | Title (working) | Target query | Built from |
|---|---|---|---|
| 1 | JEE Main chapter-wise weightage (live page) | jee main chapter wise weightage | **done**: /jee/chapter-weightage/ |
| 2 | How to use previous-year questions without memorising them | how to solve jee pyq | method |
| 3 | JEE Main preparation without coaching: a weekly practice routine | jee preparation without coaching | method + site features |
| 4 | Kinematics: the 5 question patterns JEE Main repeats | kinematics jee mains pyq | chapter data + examples |
| 5 | Electrostatics PYQ guide | electrostatics jee mains pyq | chapter data |
| 6 | Rotational motion PYQ guide | rotational motion jee mains pyq | chapter data |
| 7 | Optics PYQ guide | optics jee main pyq | chapter data |
| 8 | Current electricity PYQ guide | current electricity jee main pyq | chapter data |
| 9 | Modern physics (dual nature, atoms & nuclei) PYQ guide | modern physics jee main pyq | chapter data |
| 10 | Mole concept & stoichiometry PYQ guide | mole concept jee mains pyq | chapter data |
| 11 | Chemical bonding PYQ guide | chemical bonding jee mains pyq | chapter data |
| 12 | Coordination compounds PYQ guide | coordination compounds jee mains pyq | chapter data |
| 13 | GOC (basic principles of organic chemistry) PYQ guide | goc jee mains pyq | chapter data |
| 14 | p-block elements: what JEE Main actually asks | p block jee mains pyq | chapter data |
| 15 | Electrochemistry & redox PYQ guide | electrochemistry jee mains pyq | chapter data |
| 16 | Integral calculus PYQ guide | integration jee mains questions with solutions | chapter data |
| 17 | Matrices & determinants PYQ guide | matrices jee mains questions with solutions | chapter data |
| 18 | Probability & statistics PYQ guide | probability jee mains questions with solutions | chapter data |
| 19 | Coordinate geometry PYQ guide | coordinate geometry jee main pyq | chapter data |
| 20 | Vectors & 3D geometry PYQ guide | 3d geometry jee main pyq | chapter data |
| 21 | Numerical-answer questions: how they differ and how to practise them | jee main numerical questions | type data (1,530 numerical) |
| 22 | Negative marking in JEE Main: when to skip | jee main negative marking strategy | NTA scheme |
| 23 | Common mistakes in JEE Main Physics (from mistake-notebook categories) | jee main physics common mistakes | aggregate, anonymised, only once volume is meaningful |
| 24 | Common calculation errors in JEE Main Maths | | same |
| 25 | How to practise in a CBT before the exam | jee main cbt practice | product + NTA interface |
| 26 | JEE Main 2026 papers: chapter mix by subject | jee main 2026 pyq chapterwise | year data |
| 27 | Class 11 vs Class 12 share in JEE Main | jee main class 11 vs 12 weightage | chapter grade data |
| 28 | Revision plan for the last 30 days before JEE Main | jee main last month strategy | method |
| 29 | How answer keys work: provisional vs final (and why we check against final) | jee main answer key final vs provisional | NTA process |
| 30 | How TabbyPrep checks answers (methodology page) | trust/AI citation | verification statuses |

Items 4–20 are the "PYQ guide" series: one per high-volume chapter, each linking to its chapter page (do not duplicate the page; add worked examples
and patterns).

## 7. GEO / AI search

**Facts checked**: robots.txt allows all; no CDN bot blocking (all AI crawlers served 200); public content is server-rendered;
`Google-Extended` (Gemini training/grounding token) is not disallowed. Third-party reports (not verified against Google's own page) say Grounding with
Google Search skips pages that disallow Google-Extended, so **keep it allowed**.

**[DONE] by the other session (64f09b7)**: consistent name "TabbyPrep" + alternate names in Organization/WebSite JSON-LD, logo, `/about/` with live
counts and provenance, `/llms.txt` (low priority by design).
**[DONE] here**: homepage now states plainly what TabbyPrep is, with verifiable counts; weightage page and chapter analyses give quotable, sourced
facts with stated methodology.

**[REC]**
- Fill `SITE_PROFILES` (sameAs) as soon as official YouTube/Instagram/X/LinkedIn accounts exist; AI systems cross-check entities across sources.
- Bing Webmaster Tools: verify and submit the sitemap. ChatGPT Search and Copilot lean on Bing's index. IndexNow is optional.
- Earn third-party mentions (section 8). Assistants recommend what other sites recommend; on-page work alone will not get TabbyPrep named.
- Test monthly: ask Gemini/ChatGPT/Perplexity/Copilot "best free websites for JEE Main PYQ practice" and "what is TabbyPrep"; log answers in the sheet.

## 8. Brand authority and off-page plan [REC]: nothing sent or published

**Official description (short)**: "TabbyPrep (tabbyprep.in) is a free online JEE Main practice site: previous-year questions from official NTA papers,
sorted by chapter, with answers, timed practice, full papers in an exam-style CBT and a mistake notebook."
**Press/boilerplate (long)**: the above + "Every answer is labelled with how it was checked against NTA's answer key. TabbyPrep is independent and not
affiliated with NTA." Add a founding story only with real, verifiable facts.

**Channels, in order of expected value**
1. **YouTube Shorts / Instagram Reels** from real PYQs: pipeline exists (`marketing/reels`, docs/MARKETING_AUTOMATION.md). Each video links the
   question's chapter page. Also builds brand searches ("tabbyprep"), which is the signal we have none of.
2. **Student communities** (r/JEENEETards, r/JEE, Telegram/Discord study groups): founders answer questions with genuinely useful links (the
   weightage page, a specific chapter), disclose affiliation, follow each community's self-promotion rules. No sockpuppets.
3. **Education bloggers/teachers**: offer the weightage data (free to cite with a link) for their "chapter-wise weightage" posts.
4. **Directories**: Product Hunt (launch), AlternativeTo (as an alternative to ExamSide/PrepWiser), Google Business Profile only if there is a real
   business address, Crunchbase/LinkedIn company page, edtech lists.
5. **School/coaching partnerships**: free class accounts / CBT practice for small coaching centres and school teachers in exchange for a listing on
   their resources page.

Outreach template (to send only after approval):
> Subject: Free JEE Main chapter-wise PYQ counts for your students
> Hi <name>, I run TabbyPrep, a free JEE Main practice site. We counted every published JEE Main PYQ by chapter and year
> (<link to weightage page>), with the method stated. If it's useful for your students or your weightage article, you're welcome to cite it.
> Happy to add anything you think is missing.

## 9. Search Console

The Search Console UI could not be read from this session (Claude-in-Chrome not connected; no Search Console API credentials). Per the brief, the
property is verified, the sitemap is submitted, and the homepage + some pages are indexed. **Baseline to record manually** (Performance → 28 days, and
Indexing → Pages) into `docs/seo/keyword-tracking.csv`:
- Indexed vs Not indexed counts and top reasons ("Crawled – currently not indexed" on question pages would confirm the thin-content concern).
- Queries with impressions (expect mostly branded/long-tail question text at this stage), clicks, CTR, average position.
- Top landing pages by impressions.
- Sitemaps: discovered URL count (should be ~4,510 after this change).
Then: URL Inspection → Request indexing for `/`, `/jee/`, `/jee/chapter-weightage/`, 3 subject pages and the top 10 chapters after deploy.

## 10. Prioritisation

| # | Task | Impact | Competition | Effort | Status |
|---|---|---|---|---|---|
| 1 | Brand rename live (TabbyPrep everywhere) | very high (branded) | none | done | **[DONE] 64f09b7** (other session) |
| 2 | Chapter page titles/H1 + analysis | high (57 long-tail pages) | medium | S | **[DONE]** |
| 3 | Weightage page | high | high but data-unique | S | **[DONE]** |
| 4 | Homepage positioning | high (brand + entity) | n/a | S | **[DONE]** |
| 5 | Worked solutions for indexed questions | very high | medium | L (Person 2) | [REC] |
| 6 | OCR noise cleanup in stems | medium | | S (Person 2) | [REC] |
| 7 | Bing Webmaster + GSC baseline + request indexing | medium | | XS (manual) | [REC] |
| 8 | Official social profiles + sameAs | medium (entity/AI) | | S | [REC] |
| 9 | Mock-test landing page | medium–high (commercial) | high | M (needs papers API) | [REC] |
| 10 | 2022–2023 papers | medium | | M (Person 2) | [REC] |
| 11 | PYQ guide series (calendar 4–20) | medium, compounding | medium | M each | [REC] |
| 12 | Topic tagging + repeat questions | medium | | M (Person 2) | [REC] |

## 11. Production testing (local production build, live API, 2026-11-21)

`next build` with the live build args (`DATA_SOURCE=api`, live API URL, `SITE_URL=https://tabbyprep.in`, `ALLOW_INDEXING=true`,
`FEATURE_PAPERS=on`) passed; `typecheck:web`, eslint on changed files and `vitest` (chapter-stats) pass. `next start` smoke test:

| Route | Status | Title / robots |
|---|---|---|
| `/` | 200 | "TabbyPrep: Free JEE Main PYQs & Chapter-wise Practice Online", index, canonical `/`, Organization + WebSite JSON-LD |
| `/jee/` | 200 | "JEE Main Chapter-wise Questions: Physics, Chemistry & Maths PYQs", index |
| `/jee/physics/` | 200 | "JEE Main Physics PYQs Chapter-wise, with Answers", index |
| `/jee/physics/kinematics/` | 200 | "Kinematics JEE Main PYQs: 73 Questions with Answers"; year table sums to 73 |
| `/jee/chapter-weightage/` | 200 | index; in sitemap; 4,482 PYQs |
| `/neet/chapter-weightage/` | 404 | noindex, "Page not found" |
| `/jee/questions/<slug>/` | 200 | unchanged |
| `/about/` | 200 | unchanged (other session) |
| `/login/`, `/dashboard/` | 200 | noindex, nofollow (unchanged) |
| `sitemap.xml` | 200 | 4,510 URLs (was 4,509 + weightage) |

**Findings during testing**
- **Transient API counts.** The first build rendered `/about/`, `/llms.txt` and the homepage with **433** questions (Physics 160) while `/jee/`
  rendered 4,915 in the same build: the API's `published_question_count` briefly reflected a different published set (probably a backend job
  running mid-build). Rebuilt minutes later, all pages agreed; the live site showed 4,915. Risk: a deploy built during a publishing job can bake
  wrong counts into brand-fact pages for up to the revalidate window. **[REC][Person 2]** make the counts endpoint consistent during jobs, or
  rebuild/revalidate after publishing jobs.
- **[pre-existing]** Unknown chapter URLs (e.g. `/jee/physics/no-such-chapter/`) return **HTTP 200** with a "Page not found" noindex page, on
  live too (soft 404). Harmless for indexing (noindex) but GSC will flag soft 404s. Fix separately (streaming + `notFound()` under cacheComponents).
- Not deployed from this session; nothing was committed.

## 12. 90-day roadmap

**Days 0–14**: deploy this phase; GSC baseline; request indexing for key pages; Bing Webmaster; create official YouTube/Instagram and fill
`SITE_PROFILES`; first 6 reels linking chapter pages; Person 2: OCR-noise cleanup, start worked solutions for the 10 most-asked chapters.
**Days 15–45**: mock-test landing page (with papers endpoint); PYQ guides #4–#11; community participation (weekly, genuine answers); Product Hunt
+ AlternativeTo listings; outreach to 20 education bloggers with the weightage data; ingest 2022–2023 papers.
**Days 46–90**: PYQ guides #12–#20 and #21–#26; topic tagging → "most-asked topics" on chapter pages; year pages when papers go public; review GSC:
re-title chapter pages with impressions but CTR < 2%; decide on de-indexing question pages still without solutions if GSC shows "Crawled – not indexed"
at scale; monthly AI-assistant check logged in the sheet.

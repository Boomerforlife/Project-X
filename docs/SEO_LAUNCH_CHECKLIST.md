# SEO launch checklist

Indexing is a deliberate switch: `NEXT_PUBLIC_ALLOW_INDEXING=true` **and** `NEXT_PUBLIC_DATA_SOURCE=api` (see `INDEXABLE` in `src/lib/site.ts`).
Until both hold, every page is `noindex` and `sitemap.xml` is empty. Turn it on only after every **Before launch** box is ticked.

## Built (verify on staging)

- [x] One rule for "indexable", used by page robots **and** the sitemap (`src/lib/indexing.ts`):
  - question page: public page + has a solution + not disputed + backend `indexable`/`sitemap_include`;
  - chapter: ≥ `MIN_QUESTIONS_TO_INDEX_CHAPTER` (5) published questions;
  - subject hub: at least one indexable chapter; exam hub (`/jee/`, `/neet/`): at least one indexable chapter;
  - PYQ hub/year pages: real (non-demo) papers only.
- [x] Thin or empty pages are `noindex`: empty chapters/subjects/hubs, study plans (until written), demo papers. Private pages, `/billing/*`, `/pay/*` and `/tests/limit/` are noindex/nofollow.
- [x] Unique title + description + canonical (trailing slash) + Open Graph + **Twitter `summary_large_image` card** on every public page (`pageMetadata` in `src/lib/seo.ts`). Generated OG image: `src/app/opengraph-image.tsx`.
- [x] Breadcrumbs (visible + `BreadcrumbList` JSON-LD) via `PageHeader`; `Organization`/`WebSite` JSON-LD on `/`.
- [x] Internal links: exam → subject → chapter → question, chapter prev/next, footer links to every subject, papers, pricing and legal pages.
- [x] Copy states only real facts: hub copy mentions full papers only when real papers exist; chapter/subject counts come from the API; no ranks, percentiles or invented numbers.
- [x] `/pricing/` is public and indexable (prices read from the API, cached 5 min).
- [x] `robots.ts` + `sitemap.ts`; 404s render `not-found`; trailing-slash redirects (308) are automatic.

## Before launch (needs content or a decision)

- [ ] **Content:** about 4,800 official-key JEE Main PYQs are published (answers from NTA's official keys; difficulty is an AI estimate, labelled "Estimated"). AI-checked practice questions stay NOINDEX. The PYQs make chapter/subject hubs indexable (≥ 5 published per chapter), so review those hub pages before turning indexing on. Individually indexable question pages need editorial or licensed, human-verified questions.
- [ ] Known: unknown chapter/question slugs render not-found with `noindex` but HTTP 200 (streaming). Acceptable; fix later by resolving the slug before the page streams.
- [x] Production domain chosen (https://tabbyprep.in); `NEXT_PUBLIC_SITE_URL` set at build (canonicals and sitemap URLs use it).
- [x] Legal pages final; noindex lifts automatically from `src/lib/legal.ts`.
- [ ] Verify on staging: `curl -s https://<staging>/robots.txt`, `/sitemap.xml`; view-source on a chapter page for canonical, robots and JSON-LD. Validate JSON-LD with the Rich Results Test.
- [ ] Spot-check that math renders server-side (KaTeX HTML present in the page source) on question pages.
- [ ] Lighthouse on `/`, a chapter page and a question page: LCP < 2.5 s and CLS < 0.1 on mobile.
- [ ] Search Console: verify the domain (DNS TXT) and submit `https://<domain>/sitemap.xml`.
- [ ] Analytics consent decision: the built-in analytics are cookieless aggregate counters (no consent banner needed for them). Adding any third-party tool needs a privacy-policy update first.
- [x] Set `NEXT_PUBLIC_ALLOW_INDEXING=true` on **Production only** (never on previews) and redeploy. Done 2026-11-21:
  build substitution `_ALLOW_INDEXING=true` (default `false` in `cloudbuild.web.yaml`), image `web:web-ownerb-20261121-seo`.

## Question pages (2026-11-21)

- [x] 4,449 official-key JEE Main PYQs listed in the sitemap (`sitemap_include`, migration 0030): published, indexable, in an
  active chapter, stem text >= 40 chars. A trigger lists future PYQs when they are published or tagged out of a hidden chapter.
  AI-checked practice items stay NOINDEX and out of the sitemap.
- [x] Title and H1 lead with the question's own words (what a student searches), then "JEE Main 2024 PYQ"; the description adds
  the paper, subject and chapter.
- [x] Image-only stems show their machine-read text as a labelled "Text version" under the original image, so the words are
  in the page HTML (not only in `alt`).
- [x] Chapter pages link every public question of the chapter (grouped by year), not only the first 12 cards.
- [x] No question rich-result markup: Google's Education Q&A covers flashcards only, and `QAPage` is for user-submitted
  answers. Breadcrumb JSON-LD stays.
- [ ] Search Console: verify the **domain property** (DNS TXT on tabbyprep.in), submit `https://tabbyprep.in/sitemap.xml`,
  and request indexing for `/`, `/jee/` and a few chapter pages. Same for Bing Webmaster Tools (it can import from Search Console).
- [ ] When Owner A's OCR lands clean text/LaTeX in `structured_content`, the text version disappears automatically (the stem
  then has text blocks) and titles improve; slugs built from garbled OCR can be renamed (old slugs redirect).

## After launch

- [ ] Search Console coverage weekly: "Crawled, not indexed" pages are a signal of thin content. Fix or noindex them.
- [ ] When a question slug changes, add a redirect (the backend returns `MOVED_PERMANENTLY`; the web follows it).
- [ ] Re-check the sitemap after each bulk publish (revalidation webhook purges the cache tags).

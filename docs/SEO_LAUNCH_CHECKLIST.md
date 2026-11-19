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

- [ ] **Content:** the live DB now has 433 published AI-checked practice questions. They are practice-only (NOINDEX, no public question page), but they make chapter/subject hubs indexable (≥ 5 published per chapter), so review those hub pages before turning indexing on. Individually indexable question pages need editorial or licensed, human-verified questions.
- [ ] Known: unknown chapter/question slugs render not-found with `noindex` but HTTP 200 (streaming). Acceptable; fix later by resolving the slug before the page streams.
- [x] Production domain chosen (https://tabbyprep.in); `NEXT_PUBLIC_SITE_URL` set at build (canonicals and sitemap URLs use it).
- [x] Legal pages final; noindex lifts automatically from `src/lib/legal.ts`.
- [ ] Verify on staging: `curl -s https://<staging>/robots.txt`, `/sitemap.xml`; view-source on a chapter page for canonical, robots and JSON-LD. Validate JSON-LD with the Rich Results Test.
- [ ] Spot-check that math renders server-side (KaTeX HTML present in the page source) on question pages.
- [ ] Lighthouse on `/`, a chapter page and a question page: LCP < 2.5 s and CLS < 0.1 on mobile.
- [ ] Search Console: verify the domain (DNS TXT) and submit `https://<domain>/sitemap.xml`.
- [ ] Analytics consent decision: the built-in analytics are cookieless aggregate counters (no consent banner needed for them). Adding any third-party tool needs a privacy-policy update first.
- [ ] Set `NEXT_PUBLIC_ALLOW_INDEXING=true` on **Production only** (never on previews) and redeploy.

## After launch

- [ ] Search Console coverage weekly: "Crawled, not indexed" pages are a signal of thin content. Fix or noindex them.
- [ ] When a question slug changes, add a redirect (the backend returns `MOVED_PERMANENTLY`; the web follows it).
- [ ] Re-check the sitemap after each bulk publish (revalidation webhook purges the cache tags).

# JEE platform — frontend & SEO (Person 1)

Next.js 16 (App Router, Cache Components) · TypeScript strict · Tailwind CSS v4 · KaTeX · Zod · Vitest · pnpm.

Read `CLAUDE.md` first. It's the product and integration handoff.

## Commands
```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build && pnpm start
pnpm typecheck    # next typegen + tsc
pnpm lint
pnpm test
```

## Environment
| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical URLs, sitemap, OG |
| `NEXT_PUBLIC_DATA_SOURCE` | `mock` | `api` once Person 2's API is wired |
| `NEXT_PUBLIC_ALLOW_INDEXING` | unset | Must be `true` **and** data source `api` for any page to be indexable |

In mock mode every page is `noindex`, the sitemap is empty, and a "Mock data" label is shown, so
fixtures can never be crawled as real content.

## Layout
```
src/
  app/
    (site)/        public, indexable pages (landing, /jee/…, PYQs, plans, resources)
    (app)/         private shell: noindex (dashboard; more in Stage 3+)
    sitemap.ts robots.ts icon.svg opengraph-image.tsx not-found.tsx
  components/
    brand/Kitty.tsx    mascot traced from assets/mascot-reference.jpg (+ face mark)
    content/           RichText (server KaTeX), QuestionList
    layout/            header, nav, footer, page header, empty state
    seo/               JsonLd, Breadcrumbs
    ui/                Button, chips, verification badge
  contracts/       DRAFT Zod schemas: proposal to Person 2, not agreed
  fixtures/        mock data validated against contracts
  lib/data/        the only content access layer (swap mocks → API here)
  lib/seo.ts, lib/indexing.ts   metadata + single indexing policy
docs/
  PERSON-1-PERSON-2-INTEGRATION.md   alignment checklist
  api-contract-draft.md              what the frontend currently assumes + open questions
assets/mascot-reference.jpg          canonical mascot reference
```

The product name "Tabby" is a **working name** set in `src/lib/site.ts`.

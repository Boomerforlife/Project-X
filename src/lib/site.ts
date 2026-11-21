/**
 * Site-wide configuration.
 *
 * `name` is the brand as it is searched and as the domain spells it (tabbyprep.in). Change it here and it propagates
 * to metadata, JSON-LD, the wordmark and llms.txt. `alternateNames` tell search engines the other spellings people use.
 */
export const SITE = {
  name: "TabbyPrep",
  alternateNames: ["Tabby Prep", "Tabby"],
  tagline: "Free JEE Main PYQs and chapter-wise practice online",
  description:
    "TabbyPrep is a JEE preparation site with thousands of JEE Main previous-year questions (PYQs) sorted by chapter, with official NTA answer keys, timed practice, full papers in an exam-style CBT, and a mistake notebook.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  locale: "en_IN",
} as const;

/**
 * Where content comes from. "api" only when a base URL is also configured, so a
 * half-configured build falls back to whole-app mock mode (never per entity).
 */
export const DATA_SOURCE: "mock" | "api" =
  process.env.NEXT_PUBLIC_DATA_SOURCE === "api" && process.env.NEXT_PUBLIC_API_BASE_URL ? "api" : "mock";

/**
 * Indexing is OFF unless explicitly enabled AND real data is in use, so sample
 * fixture content can never be crawled as if it were real (CLAUDE.md §14).
 */
export const INDEXABLE = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true" && DATA_SOURCE === "api";

export function absoluteUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE.url}${p}`;
}

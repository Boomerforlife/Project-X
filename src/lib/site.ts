/**
 * Site-wide configuration.
 *
 * `name` is a WORKING NAME — the product name has not been decided yet.
 * Change it here and it propagates to metadata, JSON-LD, and the wordmark.
 */
export const SITE = {
  name: "Tabby",
  tagline: "Deliberate practice for JEE & NEET",
  description:
    "Practise JEE and NEET questions chapter by chapter, sit full papers in an exam-style CBT, understand every solution, and keep track of the mistakes worth revisiting.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  locale: "en_IN",
} as const;

/** Where content comes from. Until Person 2's API exists this is always "mock". */
export const DATA_SOURCE: "mock" | "api" =
  process.env.NEXT_PUBLIC_DATA_SOURCE === "api" ? "api" : "mock";

/**
 * Indexing is OFF unless explicitly enabled AND real data is in use, so sample
 * fixture content can never be crawled as if it were real (CLAUDE.md §14).
 */
export const INDEXABLE = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true" && DATA_SOURCE === "api";

export function absoluteUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE.url}${p}`;
}

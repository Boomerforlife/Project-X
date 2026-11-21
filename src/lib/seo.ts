import type { Metadata } from "next";
import { INDEXABLE, SITE, absoluteUrl } from "@/lib/site";

/**
 * Metadata for public pages. Always sets a canonical URL. Pages that should
 * never be indexed (private, thin, or mock-only) pass `noindex`.
 */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
  ogType = "website",
}: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  ogType?: "website" | "article";
}): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noindex || !INDEXABLE ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { title, description, url, type: ogType, siteName: SITE.name, locale: SITE.locale },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Metadata must not be able to take a page down: when the data source fails
 * (API unreachable) the page body renders the route error boundary instead, and
 * the metadata is a safe noindex so an error page is never indexed.
 */
/** Metadata for a route that will call notFound(): a 404 title, never indexed (instead of inheriting the home title). */
export const NOT_FOUND_METADATA: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

export async function safeMetadata(build: () => Promise<Metadata>): Promise<Metadata> {
  try {
    return await build();
  } catch {
    return { robots: { index: false, follow: false } };
  }
}

/**
 * Thin-content guard: a chapter page is only indexable once it has at least
 * this many questions. Tune with real data; the point is "no empty shells".
 */
export const MIN_QUESTIONS_TO_INDEX_CHAPTER = 5;

/** Private/app pages: never indexed, never cached publicly with user data. */
export const PRIVATE_METADATA: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export type Crumb = { name: string; path: string };

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

/**
 * Who the site is (Organization) and what it is called (WebSite): Google reads the WebSite name/alternateName for the
 * site name shown in results, and the Organization logo for the brand. Facts only; `sameAs` lists official profiles
 * once they exist.
 */
export function siteJsonLd() {
  const org = {
    "@type": "Organization",
    "@id": `${SITE.url}/#organization`,
    name: SITE.name,
    alternateName: SITE.alternateNames,
    url: `${SITE.url}/`,
    logo: { "@type": "ImageObject", url: absoluteUrl("/logo.png"), width: 512, height: 512 },
    description: SITE.description,
    ...(SITE_PROFILES.length ? { sameAs: SITE_PROFILES } : {}),
  };
  return [
    { "@context": "https://schema.org", ...org },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      name: SITE.name,
      alternateName: SITE.alternateNames,
      url: `${SITE.url}/`,
      description: SITE.description,
      inLanguage: "en-IN",
      publisher: { "@id": `${SITE.url}/#organization` },
    },
  ];
}

/** Official social/brand profiles (Instagram, YouTube, X, LinkedIn...). Add each URL here once the account exists. */
export const SITE_PROFILES: string[] = [];

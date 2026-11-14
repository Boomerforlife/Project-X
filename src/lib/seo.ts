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

export function siteJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: absoluteUrl("/icon.svg"),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE.name,
      url: SITE.url,
    },
  ];
}

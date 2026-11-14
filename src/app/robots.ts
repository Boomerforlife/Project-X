import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * Crawling is allowed everywhere so crawlers can SEE `noindex` directives
 * (CLAUDE.md §5). Private routes are kept out of the index via noindex meta
 * and protected server-side — not via robots.txt, which would hide the noindex.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

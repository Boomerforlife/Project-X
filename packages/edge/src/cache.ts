export type CacheClass = 'TAXONOMY' | 'PUBLIC_CONTENT' | 'PUBLIC_LIST' | 'PUBLIC_NOT_FOUND' | 'PRIVATE' | 'NONE';

export const cachePolicies: Record<CacheClass, { cacheControl: string; cacheable: boolean }> = {
  TAXONOMY: { cacheControl: 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400', cacheable: true },
  PUBLIC_CONTENT: { cacheControl: 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400', cacheable: true },
  PUBLIC_LIST: { cacheControl: 'public, max-age=0, s-maxage=300, stale-while-revalidate=600', cacheable: true },
  PUBLIC_NOT_FOUND: { cacheControl: 'public, max-age=30, s-maxage=300', cacheable: true },
  PRIVATE: { cacheControl: 'private, no-store', cacheable: false },
  NONE: { cacheControl: 'no-store', cacheable: false },
};

const MAX_TAGS = 1000;
const TAG_RE = /^[\x21-\x7e]+$/;

/** Cache-Control always; Cache-Tag + X-Cache-Tags only for cacheable classes with tags (never on PRIVATE/NONE). */
export function applyCacheHeaders(h: Headers, cls: CacheClass, tags?: string[]): void {
  const policy = cachePolicies[cls];
  h.set('Cache-Control', policy.cacheControl);
  h.delete('Cache-Tag');
  h.delete('X-Cache-Tags');
  if (!policy.cacheable || !tags || tags.length === 0) return;
  const clean = [...new Set(tags.filter((t) => TAG_RE.test(t) && !t.includes(',')))].slice(0, MAX_TAGS);
  if (clean.length === 0) return;
  const v = clean.join(',');
  h.set('Cache-Tag', v);
  h.set('X-Cache-Tags', v);
}

export const cacheTags = {
  question: (id: string): string => `q-${id}`,
  questionSlug: (s: string): string => `qslug-${s}`,
  chapter: (id: string): string => `ch-${id}`,
  chapterSlug: (s: string): string => `chslug-${s}`,
  subject: (id: string): string => `sub-${id}`,
  exam: (id: string): string => `exam-${id}`,
  taxonomy: 'tax',
  qlist: 'qlist',
  sitemap: 'sitemap',
  search: 'search',
} as const;

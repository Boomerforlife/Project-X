import type { MetadataRoute } from "next";
import { getChapters, getPublicPapers, getQuestionCounts, getSitemapQuestions, getSubjects } from "@/lib/data";
import { TRACKS } from "@/lib/exams";
import { isChapterIndexable, isSubjectIndexable, isTrackIndexable } from "@/lib/indexing";
import { INDEXABLE, absoluteUrl } from "@/lib/site";

/** Lists only pages that are indexable — mirrors each page's robots decision. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!INDEXABLE) return [];
  const out: MetadataRoute.Sitemap = [{ url: absoluteUrl("/"), priority: 1 }, { url: absoluteUrl("/about/"), priority: 0.6 }];
  for (const track of TRACKS) {
    const [subjects, chapters, counts, papers] = await Promise.all([
      getSubjects(track),
      getChapters({ track }),
      getQuestionCounts(track),
      getPublicPapers({ track, kind: "pyq" }),
    ]);
    // Demo papers are never presented to crawlers as real PYQs.
    const real = papers.filter((p) => !p.isDemo);
    // A track with no active content (inactive exam) is a noindex "coming soon" page: not listed.
    if (subjects.length === 0) continue;
    // Hubs are listed only when they lead to real content (mirrors the pages' robots decision).
    if (isTrackIndexable(chapters, counts)) {
      out.push({ url: absoluteUrl(`/${track}/`), priority: 0.9 });
      // Weightage page is noindex only when the track has no questions, so it is listed with its hub.
      out.push({ url: absoluteUrl(`/${track}/chapter-weightage/`), priority: 0.8 });
    }
    out.push(
      ...subjects.filter((s) => isSubjectIndexable(s.id, chapters, counts)).map((s) => ({ url: absoluteUrl(`/${track}/${s.id}/`), priority: 0.8 })),
    );
    out.push(
      ...chapters
        .filter((c) => isChapterIndexable(counts.byChapter.get(`${c.subject}/${c.slug}`) ?? 0))
        .map((c) => ({ url: absoluteUrl(`/${track}/${c.subject}/${c.slug}/`), priority: 0.7 })),
    );
    if (real.length) out.push({ url: absoluteUrl(`/${track}/pyq/`), priority: 0.8 });
    out.push(...[...new Set(real.map((p) => p.year))].map((y) => ({ url: absoluteUrl(`/${track}/pyq/${y}/`), priority: 0.7 })));
  }
  // API mode: exactly the backend's /public/sitemap/questions (sitemap_include); mock: indexable fixtures.
  const questions = await getSitemapQuestions();
  out.push(
    ...questions.map((q) => ({
      url: absoluteUrl(`/${q.track}/questions/${q.slug}/`),
      ...(q.updatedAt ? { lastModified: q.updatedAt } : {}),
      priority: 0.5,
    })),
  );
  return out;
}

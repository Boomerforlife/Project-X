import type { MetadataRoute } from "next";
import { getChapters, getPapers, getPublicQuestions, getQuestionCounts, getSubjects } from "@/lib/data";
import { TRACKS, trackOf } from "@/lib/exams";
import { isChapterIndexable, isQuestionIndexable } from "@/lib/indexing";
import { INDEXABLE, absoluteUrl } from "@/lib/site";

/** Lists only pages that are indexable — mirrors each page's robots decision. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!INDEXABLE) return [];
  const out: MetadataRoute.Sitemap = [{ url: absoluteUrl("/"), priority: 1 }];
  for (const track of TRACKS) {
    const [subjects, chapters, counts, papers] = await Promise.all([
      getSubjects(track),
      getChapters({ track }),
      getQuestionCounts(track),
      getPapers({ track, kind: "pyq" }),
    ]);
    // Demo papers are never presented to crawlers as real PYQs.
    const real = papers.filter((p) => !p.isDemo);
    out.push({ url: absoluteUrl(`/${track}/`), priority: 0.9 });
    out.push(...subjects.map((s) => ({ url: absoluteUrl(`/${track}/${s.id}/`), priority: 0.8 })));
    out.push(
      ...chapters
        .filter((c) => isChapterIndexable(counts.byChapter.get(`${c.subject}/${c.slug}`) ?? 0))
        .map((c) => ({ url: absoluteUrl(`/${track}/${c.subject}/${c.slug}/`), priority: 0.7 })),
    );
    if (real.length) out.push({ url: absoluteUrl(`/${track}/pyq/`), priority: 0.8 });
    out.push(...[...new Set(real.map((p) => p.year))].map((y) => ({ url: absoluteUrl(`/${track}/pyq/${y}/`), priority: 0.7 })));
  }
  const questions = await getPublicQuestions();
  out.push(...questions.filter(isQuestionIndexable).map((q) => ({ url: absoluteUrl(`/${trackOf(q.exams[0])}/questions/${q.slug}/`), priority: 0.5 })));
  return out;
}

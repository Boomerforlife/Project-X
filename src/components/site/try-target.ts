import { getQuestions, getQuestionCounts } from "@/lib/data";
import type { Track } from "@/lib/exams";
import { routes } from "@/lib/routes";

/**
 * Where "Try a question" on the landing page goes: the first public question of the track's busiest chapter, else that
 * chapter's page, else the practice home. Read at build time; any data failure falls back to the practice home, never a
 * login wall.
 */
export async function tryQuestionHref(track: Track): Promise<string> {
  try {
    const counts = await getQuestionCounts(track);
    const top = [...counts.byChapter.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (!top) return routes.practice(track);
    const [subject, chapter] = top[0].split("/");
    if (!subject || !chapter) return routes.practice(track);
    const cards = await getQuestions({ subject: subject as never, chapter, track }).catch(() => []);
    const card = cards.find((q) => q.publicPage && q.slug);
    return card ? routes.question(track, card.slug) : routes.chapter(track, subject, chapter);
  } catch {
    return routes.practice(track);
  }
}

import { getQuestionCounts } from "@/lib/data";
import { TRACKS, type Track } from "@/lib/exams";

/**
 * Tracks (/jee/, /neet/) that have published questions today, from the API. Navigation, footer and homepage copy use
 * this so an exam is only presented as a section once it has real content: NEET appears by itself when the backend
 * publishes NEET questions, with no redeploy and no placeholder section before that.
 * If the API is unreachable JEE stays listed (a working link beats an empty nav) and other tracks are left out.
 */
export async function liveTracks(): Promise<Track[]> {
  const out = await Promise.all(
    TRACKS.map(async (t) => {
      try {
        return (await getQuestionCounts(t)).total > 0 ? t : null;
      } catch {
        return t === "jee" ? t : null;
      }
    }),
  );
  return out.filter((t): t is Track => t !== null);
}

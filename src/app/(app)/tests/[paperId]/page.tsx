import { permanentRedirect } from "next/navigation";
import { getPaper, getPyqPapers } from "@/lib/data";
import { trackOf } from "@/lib/exams";
import { routes } from "@/lib/routes";

/** Old paper URLs (/tests/<slug>/) redirect to the paper's page under PYQs; the year is part of every API paper slug. */
export async function generateStaticParams() {
  const papers = await getPyqPapers("jee").catch(() => []);
  return papers.length ? papers.map((p) => ({ paperId: p.slug })) : [{ paperId: "unavailable" }];
}

export default async function PaperRedirect({ params }: PageProps<"/tests/[paperId]">) {
  const { paperId } = await params;
  // Demo fixtures carry their year separately; API slugs contain it.
  const fixture = await getPaper(paperId).catch(() => null);
  if (fixture?.year) permanentRedirect(routes.pyqPaper(trackOf(fixture.exam), fixture.year, fixture.id));
  permanentRedirect(routes.pyqPaperFromSlug(paperId.startsWith("neet") ? "neet" : "jee", paperId));
}

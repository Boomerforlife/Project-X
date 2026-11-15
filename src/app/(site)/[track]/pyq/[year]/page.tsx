import { notFound } from "next/navigation";
import { PaperCard } from "@/components/content/PaperCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { getPublicPapers } from "@/lib/data";
import { TRACKS, TRACK_INFO, isTrack } from "@/lib/exams";
import { pageMetadata, safeMetadata } from "@/lib/seo";

/** Year landing pages exist only for years that have papers. */
export async function generateStaticParams() {
  const out: { track: string; year: string }[] = [];
  for (const track of TRACKS) {
    const years = [...new Set((await getPublicPapers({ track, kind: "pyq" })).map((p) => String(p.year)))];
    out.push(...years.map((year) => ({ track, year })));
  }
  return out.length ? out : [{ track: "jee", year: "none" }];
}

async function load(track: string, year: string) {
  if (!isTrack(track) || !/^\d{4}$/.test(year)) return null;
  const papers = (await getPublicPapers({ track, kind: "pyq" })).filter((p) => String(p.year) === year);
  return papers.length ? { track, papers } : null;
}

export async function generateMetadata({ params }: PageProps<"/[track]/pyq/[year]">) {
  return safeMetadata(async () => {
    const { track, year } = await params;
    const d = await load(track, year);
    if (!d) return {};
    const name = TRACK_INFO[d.track].name;
    return pageMetadata({
      title: `${name} ${year} papers`,
      description: `Every available ${name} ${year} paper, with full-paper practice, CBT mode and worked solutions.`,
      path: `/${d.track}/pyq/${year}/`,
      noindex: d.papers.every((p) => p.isDemo),
    });
  });
}

export default async function PyqYearPage({ params }: PageProps<"/[track]/pyq/[year]">) {
  const { track: t, year } = await params;
  const d = await load(t, year);
  if (!d) notFound();
  const { track, papers } = d;
  const name = TRACK_INFO[track].name;
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: name, path: `/${track}/` },
          { name: "PYQs", path: `/${track}/pyq/` },
          { name: year, path: `/${track}/pyq/${year}/` },
        ]}
        eyebrow="Previous year papers"
        title={`${name} ${year}`}
        lede="Demo papers: real section pattern, original sample questions."
      />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {papers.map((p) => (
            <PaperCard key={p.id} paper={p} />
          ))}
        </ul>
      </div>
    </>
  );
}

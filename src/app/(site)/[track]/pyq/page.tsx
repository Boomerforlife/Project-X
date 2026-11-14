import Link from "next/link";
import { notFound } from "next/navigation";
import { PaperCard } from "@/components/content/PaperCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/cn";
import { getPapers } from "@/lib/data";
import { EXAMS, TRACKS, TRACK_INFO, isTrack } from "@/lib/exams";
import { pageMetadata } from "@/lib/seo";

export async function generateStaticParams() {
  return TRACKS.map((track) => ({ track }));
}

export async function generateMetadata({ params }: PageProps<"/[track]/pyq">) {
  const { track } = await params;
  if (!isTrack(track)) return {};
  const papers = await getPapers({ track, kind: "pyq" });
  const names = TRACK_INFO[track].exams.map((e) => EXAMS[e].name).join(" and ");
  return pageMetadata({
    title: `${names} previous year papers (PYQs)`,
    description: `Browse ${names} previous year papers by year. Attempt a full paper in the exam-style CBT interface or in practice mode, then review every solution.`,
    path: `/${track}/pyq/`,
    // Demo papers are assembled from sample items: never index them as real PYQs.
    noindex: papers.length === 0 || papers.every((p) => p.isDemo),
  });
}

export default async function PyqHubPage({ params }: PageProps<"/[track]/pyq">) {
  const { track } = await params;
  if (!isTrack(track)) notFound();
  const info = TRACK_INFO[track];
  const papers = await getPapers({ track, kind: "pyq" });

  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: info.name, path: `/${track}/` },
          { name: "PYQs", path: `/${track}/pyq/` },
        ]}
        eyebrow="Previous year papers"
        title={`${info.name} papers`}
        lede="Attempt a full paper in the exam-style CBT interface, as a timed test, or in learning mode with instant feedback. Every attempt is saved separately, so you can retry a paper and compare."
      >
        <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Exam">
          {TRACKS.map((t) => (
            <Link
              key={t}
              href={`/${t}/pyq/`}
              role="tab"
              aria-selected={t === track}
              className={cn("rounded-md border px-3 py-1.5 text-sm", t === track ? "border-fg bg-surface-2 text-fg" : "border-line text-fg-muted hover:text-fg")}
            >
              {TRACK_INFO[t].name}
            </Link>
          ))}
        </div>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div role="note" className="mb-10 flex gap-3 rounded-xl border border-review/40 bg-review/5 p-4 text-sm">
          <span aria-hidden className="font-pixel text-review">!</span>
          <p className="text-fg-soft">
            <span className="font-medium text-review">Demo papers.</span> These follow the real section pattern of each sitting so you can try the
            interface, but the questions are original sample items — not the questions asked in that exam. Real papers arrive with the content pipeline.
          </p>
        </div>

        {info.exams.map((exam) => {
          const list = papers.filter((p) => p.exam === exam);
          const years = [...new Set(list.map((p) => p.year))].sort((a, b) => (b ?? 0) - (a ?? 0));
          return (
            <section key={exam} aria-labelledby={`${exam}-h`} className="mb-14">
              <h2 id={`${exam}-h`} className="text-2xl font-semibold">
                {EXAMS[exam].name}
              </h2>
              <p className="mt-1 text-sm text-fg-muted">{EXAMS[exam].pattern}</p>
              {years.map((y) => (
                <div key={y} className="mt-6">
                  <h3 className="mb-3 font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">
                    <Link href={`/${track}/pyq/${y}/`} className="hover:text-fg">
                      {y}
                    </Link>
                  </h3>
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list
                      .filter((p) => p.year === y)
                      .map((p) => (
                        <PaperCard key={p.id} paper={p} />
                      ))}
                  </ul>
                </div>
              ))}
            </section>
          );
        })}

        <p className="text-sm text-fg-muted">
          Looking for original full-length tests?{" "}
          <Link href="/tests/" className="text-fg underline underline-offset-4">
            See mock tests
          </Link>
          .
        </p>
      </div>
    </>
  );
}

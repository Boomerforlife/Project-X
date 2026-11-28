import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { PaperTile } from "@/components/pyq/PaperTile";
import { getPyqPapers } from "@/lib/data";
import { sittingLabel, type PyqPaper } from "@/lib/data/pyq";
import { EXAMS, TRACKS, TRACK_INFO, isTrack } from "@/lib/exams";
import { routes } from "@/lib/routes";
import { pageMetadata, safeMetadata, NOT_FOUND_METADATA } from "@/lib/seo";

/** Year landing pages exist only for years that have papers. */
export async function generateStaticParams() {
  const out: { track: string; year: string }[] = [];
  for (const track of TRACKS) {
    const papers = await getPyqPapers(track).catch(() => []);
    out.push(...[...new Set(papers.map((p) => String(p.year)))].map((year) => ({ track, year })));
  }
  return out.length ? out : [{ track: "jee", year: "none" }];
}

/** "JEE Main", or "JEE Main and JEE Advanced" when a year has both. */
function examNames(papers: PyqPaper[]): string {
  return [...new Set(papers.map((p) => p.exam))].map((e) => EXAMS[e].name).join(" and ");
}

async function load(track: string, year: string) {
  if (!isTrack(track) || !/^\d{4}$/.test(year)) return null;
  const papers = (await getPyqPapers(track))
    .filter((p) => String(p.year) === year)
    .sort((a, b) => (a.examDate ?? "").localeCompare(b.examDate ?? "") || (a.shift ?? 0) - (b.shift ?? 0));
  return papers.length ? { track, papers } : null;
}

export async function generateMetadata({ params }: PageProps<"/[track]/pyq/[year]">) {
  return safeMetadata(async () => {
    const { track, year } = await params;
    const d = await load(track, year);
    if (!d) return NOT_FOUND_METADATA;
    const exam = examNames(d.papers);
    return pageMetadata({
      title: `${exam} ${year} papers with official answer key`,
      description: `All ${d.papers.length} ${exam} ${year} papers (${d.papers.length === 1 ? "one sitting" : "every shift"}) with NTA's official final answer key. Attempt each in an exam-style CBT, as a timed test or untimed.`,
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
  const exam = examNames(papers);
  const byExam = TRACK_INFO[track].exams.map((e) => ({ exam: e, list: papers.filter((p) => p.exam === e) })).filter((g) => g.list.length > 0);
  const questions = papers.reduce((n, p) => n + p.questionCount, 0);
  const first = sittingLabel({ examDate: papers[0]!.examDate, shift: null });
  const last = sittingLabel({ examDate: papers[papers.length - 1]!.examDate, shift: null });
  const demo = papers.every((p) => p.isDemo);
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name, path: `/${track}/` },
          { name: "PYQs", path: `/${track}/pyq/` },
          { name: year, path: `/${track}/pyq/${year}/` },
        ]}
        eyebrow="Previous-year questions"
        title={`${exam} ${year}`}
        lede={
          demo
            ? "Demo papers: real section pattern, original sample questions."
            : `${papers.length} paper${papers.length === 1 ? "" : "s"} and ${questions.toLocaleString("en-IN")} questions${first && last && first !== last ? `, sat between ${first} and ${last}` : first ? `, sat on ${first}` : ""}. Each is scored against NTA's official final answer key.`
        }
      />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {byExam.map((g) => (
          <section key={g.exam} aria-labelledby={`${g.exam}-h`} className="mb-10">
            {byExam.length > 1 && (
              <h2 id={`${g.exam}-h`} className="mb-3 text-xl font-semibold">
                {EXAMS[g.exam].name} {year}
              </h2>
            )}
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.list.map((p) => (
                <PaperTile key={p.slug} paper={p} track={track} />
              ))}
            </ul>
          </section>
        ))}
        <p className="mt-10 text-sm text-fg-muted">
          <Link href={routes.pyq(track)} className="text-fg underline underline-offset-4">
            All {name} PYQs
          </Link>{" "}
          · Practise {year} questions by chapter from any{" "}
          <Link href={routes.practice(track)} className="text-fg underline underline-offset-4">
            chapter page
          </Link>{" "}
          with the year filter.
        </p>
      </div>
    </>
  );
}

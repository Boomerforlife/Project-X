import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { CbtExplainer } from "@/components/pyq/CbtExplainer";
import { PaperActions, PaperAttempts } from "@/components/pyq/PaperActions";
import { Card } from "@/components/ui/Primitives";
import { cn } from "@/lib/cn";
import { getPyqPapers } from "@/lib/data";
import { sittingLabel } from "@/lib/data/pyq";
import { EXAMS, TRACKS, TRACK_INFO, isTrack } from "@/lib/exams";
import { routes } from "@/lib/routes";
import { pageMetadata, safeMetadata, NOT_FOUND_METADATA } from "@/lib/seo";
import { SUBJECT_STYLE } from "@/lib/subjects";

/**
 * One previous-year paper (replaces /tests/<id>/): what it contains, how it is scored, and the three ways to attempt it
 * (CBT, timed, untimed). Public and indexable; the student's own attempts are a client island.
 */
export async function generateStaticParams() {
  const out: { track: string; year: string; paper: string }[] = [];
  for (const track of TRACKS) {
    const papers = await getPyqPapers(track).catch(() => []);
    out.push(...papers.map((p) => ({ track, year: String(p.year), paper: p.slug })));
  }
  return out.length ? out : [{ track: "jee", year: "none", paper: "none" }];
}

async function load(track: string, year: string, slug: string) {
  if (!isTrack(track) || !/^\d{4}$/.test(year)) return null;
  const paper = (await getPyqPapers(track)).find((p) => p.slug === slug && String(p.year) === year);
  return paper ? { track, paper } : null;
}

export async function generateMetadata({ params }: PageProps<"/[track]/pyq/[year]/[paper]">) {
  return safeMetadata(async () => {
    const { track, year, paper } = await params;
    const d = await load(track, year, paper);
    if (!d) return NOT_FOUND_METADATA;
    const p = d.paper;
    return pageMetadata({
      title: `${p.title} paper with official answer key`,
      description: `${p.title}: ${p.questionCount} questions, ${p.durationMin} minutes. Attempt it in an exam-style CBT, as a timed test or untimed, scored against NTA's official final answer key, then review every answer.`,
      path: routes.pyqPaper(d.track, p.year, p.slug),
      noindex: p.isDemo,
    });
  });
}

export default async function PyqPaperPage({ params }: PageProps<"/[track]/pyq/[year]/[paper]">) {
  const { track: t, year, paper: slug } = await params;
  const d = await load(t, year, slug);
  if (!d) notFound();
  const { track, paper: p } = d;
  const name = TRACK_INFO[track].name;
  const exam = EXAMS[p.exam];
  const sitting = sittingLabel(p);

  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name, path: `/${track}/` },
          { name: "PYQs", path: `/${track}/pyq/` },
          { name: String(p.year), path: `/${track}/pyq/${p.year}/` },
          { name: sitting || p.title, path: routes.pyqPaper(track, p.year, p.slug) },
        ]}
        eyebrow={`${exam.name} · Previous-year paper`}
        title={p.title}
        lede={`${p.questionCount} questions · ${p.durationMin} minutes · ${p.sections.length} section${p.sections.length === 1 ? "" : "s"}. ${p.isDemo ? "Demo paper." : "Scored against NTA's official final answer key."}`}
      >
        <div className="mt-8">
          <PaperActions paper={{ slug: p.slug, title: p.title, exam: p.exam, durationMin: p.durationMin }} />
        </div>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {p.isDemo && (
          <p role="note" className="mb-8 rounded-xl border border-review/40 bg-review/5 p-4 text-sm text-fg-soft">
            <span className="font-medium text-review">Demo paper.</span> It follows this sitting&rsquo;s section pattern, but the questions are original sample items — not the questions actually asked.
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-6">
            <h2 className="font-medium">What&rsquo;s in this paper</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-fg-muted">
                  <tr>
                    <th className="pb-2 font-normal">Section</th>
                    <th className="pb-2 text-right font-normal">Questions</th>
                  </tr>
                </thead>
                <tbody>
                  {p.sections.map((sec) => (
                    <tr key={sec.name} className="border-t border-line">
                      <td className={cn("py-2.5 font-medium", sec.subject ? SUBJECT_STYLE[sec.subject].text : undefined)}>
                        {sec.subject ? (
                          <Link href={routes.subject(track, sec.subject)} className="hover:underline">
                            {sec.name}
                          </Link>
                        ) : (
                          sec.name
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{sec.questionCount}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line-strong">
                    <td className="py-2.5 text-fg-muted">Total</td>
                    <td className="py-2.5 text-right font-medium tabular-nums">{p.questionCount}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3 className="mt-6 text-sm font-medium">How it&rsquo;s scored</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>Answers are checked against NTA&rsquo;s official final answer key when you submit, with this paper&rsquo;s own marking scheme.</li>
              {p.numericalCounted ? <li>Each subject has more numerical questions than count: only your best {p.numericalCounted} numerical answers per subject are added to your score.</li> : null}
              <li>Questions NTA dropped (no official answer) are left out, so a paper can have slightly fewer questions than the exam pattern.</li>
              <li>The timer is the real paper&rsquo;s {p.durationMin} minutes in CBT and timed modes; untimed has no clock.</li>
            </ul>
          </Card>

          <Card className="p-6">
            <h2 className="font-medium">Your attempts</h2>
            <PaperAttempts slug={p.slug} />
            <p className="mt-4 border-t border-line pt-4 text-xs text-fg-muted">Retrying never overwrites an earlier attempt or its score.</p>
          </Card>
        </div>

        <CbtExplainer className="mt-10" />

        <p className="mt-10 text-sm text-fg-muted">
          <Link href={routes.pyqYear(track, p.year)} className="text-fg underline underline-offset-4">
            Other {exam.name} {p.year} papers
          </Link>{" "}
          ·{" "}
          <Link href={routes.pyq(track)} className="text-fg underline underline-offset-4">
            All {name} PYQs
          </Link>
        </p>
      </div>
    </>
  );
}

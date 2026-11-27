import Link from "next/link";
import { notFound } from "next/navigation";
import { Kitty } from "@/components/brand/Kitty";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { CbtExplainer } from "@/components/pyq/CbtExplainer";
import { PaperQuickStart } from "@/components/pyq/PaperActions";
import { PaperTile } from "@/components/pyq/PaperTile";
import { cn } from "@/lib/cn";
import { FULL_PAPERS, PAPERS_VISIBLE, getPapers, getPyqPapers, getQuestionCounts, getSubjects } from "@/lib/data";
import { papersByYear, type PyqPaper } from "@/lib/data/pyq";
import { EXAMS, TRACKS, TRACK_INFO, isTrack, type Track } from "@/lib/exams";
import { liveTracks } from "@/lib/live-tracks";
import { routes } from "@/lib/routes";
import { pageMetadata, safeMetadata, NOT_FOUND_METADATA } from "@/lib/seo";
import { SUBJECT_STYLE } from "@/lib/subjects";

export async function generateStaticParams() {
  return TRACKS.map((track) => ({ track }));
}

/** Exam names that actually have papers ("JEE Main"), never an exam we do not cover. */
function examNames(track: Track, papers: PyqPaper[]): string {
  const exams = TRACK_INFO[track].exams.filter((e) => papers.some((p) => p.exam === e));
  return (exams.length ? exams : [TRACK_INFO[track].primaryExam]).map((e) => EXAMS[e].name).join(" and ");
}

function yearSpan(papers: PyqPaper[]): string {
  const years = [...new Set(papers.map((p) => p.year))].sort((a, b) => a - b);
  if (!years.length) return "";
  return years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`;
}

export async function generateMetadata({ params }: PageProps<"/[track]/pyq">) {
  return safeMetadata(async () => {
    const { track } = await params;
    if (!isTrack(track)) return NOT_FOUND_METADATA;
    const papers = await getPyqPapers(track);
    const names = examNames(track, papers);
    const real = papers.filter((p) => !p.isDemo);
    return pageMetadata({
      title: `${names} PYQs: previous year papers with answer keys`,
      description: real.length
        ? `${real.length} complete ${names} papers (${yearSpan(real)}) scored against NTA's official final answer key. Attempt one in an exam-style CBT, as a timed test or untimed, or practise PYQs chapter by chapter.`
        : `Browse ${names} previous year papers by year and practise PYQs chapter by chapter.`,
      path: `/${track}/pyq/`,
      // Demo papers are assembled from sample items: never index them as real PYQs.
      noindex: real.length === 0,
    });
  });
}

export default async function PyqHubPage({ params }: PageProps<"/[track]/pyq">) {
  const { track } = await params;
  if (!isTrack(track)) notFound();
  const info = TRACK_INFO[track];
  const [papers, live, subjects, counts, mocks] = await Promise.all([
    getPyqPapers(track).catch(() => [] as PyqPaper[]),
    liveTracks(),
    getSubjects(track).catch(() => []),
    getQuestionCounts(track).catch(() => null),
    PAPERS_VISIBLE ? getPapers({ track, kind: "mock" }) : Promise.resolve([]),
  ]);
  const names = examNames(track, papers);
  const years = papersByYear(papers);
  const real = papers.filter((p) => !p.isDemo);
  const tabs = TRACKS.filter((t) => live.includes(t) || t === track);

  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: info.name, path: `/${track}/` },
          { name: "PYQs", path: `/${track}/pyq/` },
        ]}
        eyebrow="Previous-year questions"
        title={`${info.name} PYQs`}
        lede={
          real.length
            ? `Every complete ${names} paper we have — ${real.length} sittings from ${yearSpan(real)} — scored against NTA's official final answer key. Sit one in the exam-style CBT, as a timed test, or untimed with instant feedback. Every attempt is saved separately, so you can retry a paper and compare.`
            : "Attempt a full paper in the exam-style CBT interface, as a timed test, or untimed with instant feedback. Every attempt is saved separately, so you can retry a paper and compare."
        }
      >
        {tabs.length > 1 && (
          <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Exam">
            {tabs.map((t) => (
              <Link
                key={t}
                href={routes.pyq(t)}
                role="tab"
                aria-selected={t === track}
                className={cn("inline-flex min-h-11 items-center rounded-md border px-3 text-sm", t === track ? "border-fg bg-surface-2 text-fg" : "border-line text-fg-muted hover:text-fg")}
              >
                {TRACK_INFO[t].name}
              </Link>
            ))}
          </div>
        )}
        {years.length > 0 && (
          <nav aria-label="Years" className="mt-6 flex flex-wrap gap-2">
            {years.map(({ year, papers: list }) => (
              <a key={year} href={`#y${year}`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg-soft hover:border-line-strong hover:text-fg">
                {year} <span className="text-xs tabular-nums text-fg-muted">{list.length}</span>
              </a>
            ))}
          </nav>
        )}
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {papers.length === 0 && FULL_PAPERS && (
          <EmptyState
            kitty={<Kitty pose="sit" className="h-16 w-auto text-fg-subtle" />}
            title="Papers are loading"
            body="We couldn't load the paper list just now. Practise PYQs chapter by chapter below, or try again in a moment."
          >
            <Link href={routes.practice(track)} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
              Browse {info.name} chapters
            </Link>
          </EmptyState>
        )}

        {papers.length === 0 && !FULL_PAPERS && (
          <EmptyState
            kitty={<Kitty pose="sleep" className="h-16 w-auto text-fg-subtle" />}
            title="Previous year papers are coming soon"
            body="Full papers appear here once they have been added and checked. Practise chapter by chapter in the meantime."
          >
            <Link href={routes.practice(track)} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
              Browse {info.name} chapters
            </Link>
          </EmptyState>
        )}

        {papers.some((p) => p.isDemo) && (
          <div role="note" className="mb-10 flex gap-3 rounded-xl border border-review/40 bg-review/5 p-4 text-sm">
            <span aria-hidden className="font-pixel text-review">!</span>
            <p className="text-fg-soft">
              <span className="font-medium text-review">Demo papers.</span> These follow the real section pattern of each sitting so you can try the
              interface, but the questions are original sample items — not the questions asked in that exam.
            </p>
          </div>
        )}

        {years.length > 0 && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-2xl font-semibold">Full papers</h2>
              <p className="text-xs text-fg-muted">Free accounts have a monthly full-paper limit. Plus is unlimited.</p>
            </div>
            {years.map(({ year, papers: list }) => (
              <section key={year} id={`y${year}`} aria-labelledby={`y${year}-h`} className="mt-8 scroll-mt-20">
                <h3 id={`y${year}-h`} className="mb-3 font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">
                  <Link href={routes.pyqYear(track, year)} className="inline-flex min-h-11 items-center hover:text-fg">
                    {names} {year} · {list.length} paper{list.length === 1 ? "" : "s"} →
                  </Link>
                </h3>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((p) => (
                    <PaperTile key={p.slug} paper={p} track={track} headingLevel={4} />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        <CbtExplainer className="mt-14" />

        {subjects.length > 0 && (
          <section aria-labelledby="chapterwise-h" className="mt-14">
            <h2 id="chapterwise-h" className="text-2xl font-semibold">
              Chapter-wise PYQs
            </h2>
            <p className="mt-2 max-w-2xl text-fg-muted">
              Prefer one topic at a time? Open a subject to practise its previous-year questions chapter by chapter, and filter a chapter by year.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {subjects.map((s) => (
                <li key={s.id}>
                  <Link href={routes.subject(track, s.id)} className="flex min-h-11 flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong">
                    <span className={cn("font-semibold", SUBJECT_STYLE[s.id]?.text)}>{s.name}</span>
                    {counts?.bySubject.get(s.id) ? <span className="mt-1 text-sm tabular-nums text-fg-muted">{counts.bySubject.get(s.id)!.toLocaleString("en-IN")} questions</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-fg-muted">
              Which chapters come up most?{" "}
              <Link href={`/${track}/chapter-weightage/`} className="text-fg underline underline-offset-4">
                See chapter-wise weightage
              </Link>
              .
            </p>
          </section>
        )}

        {mocks.length > 0 && (
          <section aria-labelledby="mock-h" className="mt-14">
            <h2 id="mock-h" className="text-2xl font-semibold">
              Mock tests
            </h2>
            <p className="mt-1 text-sm text-fg-muted">Original full-length and sectional tests in the same format (demo).</p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mocks.map((m) => (
                <li key={m.id} className="flex h-full flex-col rounded-xl border border-line bg-surface p-5">
                  <p className="font-semibold leading-snug">{m.title.replace(`${EXAMS[m.exam].name} `, "")}</p>
                  <p className="mt-1 text-sm tabular-nums text-fg-muted">
                    {m.questionCount} questions · {m.durationMinutes} min
                  </p>
                  <div className="mt-auto pt-4">
                    <PaperQuickStart paper={{ slug: m.id, title: m.title, exam: m.exam, durationMin: m.durationMinutes }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

import Link from "next/link";
import { isTrackIndexable } from "@/lib/indexing";
import { notFound } from "next/navigation";
import { Kitty } from "@/components/brand/Kitty";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { FULL_PAPERS, PAPERS_VISIBLE, getChapters, getExams, getPublicPapers, getQuestionCounts, getSubjects } from "@/lib/data";
import { EXAMS, TRACKS, TRACK_INFO, examLabel, isTrack } from "@/lib/exams";
import { pageMetadata, safeMetadata, NOT_FOUND_METADATA } from "@/lib/seo";
import { SUBJECT_STYLE } from "@/lib/subjects";

export async function generateStaticParams() {
  return TRACKS.map((track) => ({ track }));
}

const COPY = {
  jee: {
    title: "JEE Main & Advanced practice by subject and chapter",
    description: "Browse JEE Physics, Chemistry and Mathematics by chapter. Practise with answers checked against the official key, attempt full papers in an exam-style CBT, and track what to revisit.",
    descriptionNoPapers: "Browse JEE Physics, Chemistry and Mathematics by chapter. Practise with answers checked against the official key and track what to revisit.",
    heading: "JEE practice",
    /** Used while JEE Main is the only exam with questions: no claim about JEE Advanced. */
    mainOnly: {
      title: "JEE Main Chapter-wise Questions: Physics, Chemistry & Maths PYQs",
      description: (n: string) =>
        `${n} JEE Main questions, most of them previous-year questions (PYQs), sorted by chapter across Physics, Chemistry and Mathematics, with answers. Practise free online in learning or timed mode, then sit full papers in an exam-style CBT.`,
      heading: "JEE Main chapter-wise practice",
    },
    lede: "One syllabus, two exams. Practise chapter by chapter, then sit full JEE Main or JEE Advanced papers in the exam-style interface.",
    ledeNoPapers: "One syllabus, two exams. Practise chapter by chapter and check every answer.",
  },
  neet: {
    title: "NEET UG practice by subject and chapter",
    description: "Browse NEET Physics, Chemistry and Biology (Botany and Zoology) by chapter. Practise and check every answer, then sit full NEET papers in an exam-style CBT.",
    descriptionNoPapers: "Browse NEET Physics, Chemistry and Biology (Botany and Zoology) by chapter. Practise and check every answer.",
    heading: "NEET practice",
    lede: "Physics, Chemistry, Botany and Zoology, chapter by chapter — then full papers in the exam-style interface.",
    ledeNoPapers: "Physics, Chemistry, Botany and Zoology, chapter by chapter, with every answer checked.",
  },
} as const;

export async function generateMetadata({ params }: PageProps<"/[track]">) {
  return safeMetadata(async () => {
    const { track } = await params;
    if (!isTrack(track)) return NOT_FOUND_METADATA;
    // An exam with no active content (e.g. NEET before launch) is a "coming soon" page: never indexed.
    const [subjects, chapters, counts, papers] = await Promise.all([getSubjects(track), getChapters({ track }), getQuestionCounts(track), getPublicPapers({ track })]);
    // Only claim full papers when real (non-demo) papers exist; only index when some chapter has enough published questions.
    const hasPapers = papers.some((p) => !p.isDemo);
    const mainOnly = track === "jee" && examLabel(track, await getExams(track)) === "JEE Main" && counts.total > 0 ? COPY.jee.mainOnly : null;
    return pageMetadata({
      title: mainOnly?.title ?? COPY[track].title,
      description: mainOnly ? mainOnly.description(counts.total.toLocaleString("en-IN")) : hasPapers ? COPY[track].description : COPY[track].descriptionNoPapers,
      path: `/${track}/`,
      noindex: subjects.length === 0 || !isTrackIndexable(chapters, counts),
    });
  });
}

export default async function TrackHubPage({ params }: PageProps<"/[track]">) {
  const { track } = await params;
  if (!isTrack(track)) notFound();
  const info = TRACK_INFO[track];
  const [exams, subjects, chapters, counts, papers] = await Promise.all([getExams(track), getSubjects(track), getChapters({ track }), getQuestionCounts(track), getPublicPapers({ track })]);

  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: info.name, path: `/${track}/` },
        ]}
        eyebrow={(exams.length ? exams : info.exams).map((e) => EXAMS[e].name).join(" · ")}
        title={track === "jee" && exams.length === 1 && exams[0] === "jee-main" && counts.total > 0 ? COPY.jee.mainOnly.heading : COPY[track].heading}
        lede={papers.some((p) => !p.isDemo) ? COPY[track].lede : COPY[track].ledeNoPapers}
      >
        <div className="mt-8 flex flex-wrap gap-2">
          {subjects.map((s) => (
            <Link key={s.id} href={`#${s.id}`} className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-line-strong">
              <span className={SUBJECT_STYLE[s.id].text}>{s.name}</span>
            </Link>
          ))}
          {counts.total > 0 && (
            <Link href={`/${track}/chapter-weightage/`} className="rounded-md border border-line px-3 py-1.5 text-sm text-fg-soft hover:border-line-strong hover:text-fg">
              Chapter-wise weightage →
            </Link>
          )}
          {subjects.length > 0 && (
            <Link href={`/${track}/pyq/`} className="rounded-md border border-line px-3 py-1.5 text-sm text-fg-soft hover:border-line-strong hover:text-fg">
              Previous year papers →
            </Link>
          )}
        </div>
      </PageHeader>

      {subjects.length === 0 && (
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <EmptyState
            kitty={<Kitty pose="sleep" className="h-16 w-auto text-fg-subtle" />}
            title={`${info.name} practice is coming soon`}
            body="We are still preparing and checking questions for this exam. Practice for other exams is available in the meantime."
          >
            <ButtonLink href="/" variant="secondary" size="sm">
              Back to home
            </ButtonLink>
          </EmptyState>
        </div>
      )}

      {subjects.length > 0 && (
      <section aria-labelledby="exams-h" className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <h2 id="exams-h" className="sr-only">
          Exams
        </h2>
        <div className={cn("grid gap-4", exams.length > 1 && "md:grid-cols-2")}>
          {exams.map((id) => {
            const e = EXAMS[id];
            const n = papers.filter((p) => p.exam === id).length;
            const rules = Object.entries(e.marking).map(([type, r]) => `${type === "single_correct" ? "MCQ" : type === "numerical" ? "Numerical" : "Multi-correct"} +${r!.correct}/${r!.incorrect}`);
            return (
              <article key={id} className="flex flex-col rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold">{e.name}</h3>
                    <p className="mt-1 text-sm text-fg-muted">{e.pattern}</p>
                  </div>
                  {PAPERS_VISIBLE && <span className="pixel-corners bg-surface-2 px-2 py-1 font-pixel text-[0.6rem] uppercase tracking-widest text-fg-muted">{n} papers</span>}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-fg-soft">{e.blurb}</p>
                {PAPERS_VISIBLE && <p className="mt-3 text-xs text-fg-muted">Demo marking: {rules.join(" · ")}</p>}
                <div className="mt-6 flex flex-wrap gap-2">
                  <ButtonLink href={`/practice/new/?exam=${id}`} size="sm" pixel>
                    <Icon name="play" className="size-3.5" /> Practise {e.short}
                  </ButtonLink>
                  {FULL_PAPERS && (
                    <ButtonLink href={`/tests/?exam=${id}`} size="sm" variant="secondary">
                      {PAPERS_VISIBLE ? "Full papers & mocks" : "Full papers in CBT"}
                    </ButtonLink>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      )}

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-14 sm:px-6">
        {subjects.map((s) => {
          const style = SUBJECT_STYLE[s.id];
          const list = chapters.filter((c) => c.subject === s.id);
          const groups = [...new Set(list.map((c) => c.group ?? ""))];
          return (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
                <div>
                  <h2 id={`${s.id}-h`} className={cn("text-3xl font-semibold", style.text)}>
                    <Link href={`/${track}/${s.id}/`} className="decoration-2 underline-offset-8 hover:underline">
                      {s.name}
                    </Link>
                  </h2>
                  {s.summary && <p className="mt-2 max-w-2xl text-sm text-fg-muted">{s.summary}</p>}
                </div>
                <p className="text-sm tabular-nums text-fg-muted">
                  {list.length} chapters · {counts.bySubject.get(s.id) ?? 0} questions
                </p>
              </div>
              {groups.map((g) => (
                <div key={g}>
                  {g && <h3 className="mt-6 font-pixel text-[0.68rem] uppercase tracking-[0.18em] text-fg-muted">{g}</h3>}
                  <ul className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3">
                    {list
                      .filter((c) => (c.group ?? "") === g)
                      .map((c) => {
                        const n = counts.byChapter.get(`${s.id}/${c.slug}`) ?? 0;
                        return (
                          <li key={c.slug}>
                            <Link href={`/${track}/${s.id}/${c.slug}/`} className="group flex items-center justify-between gap-4 border-b border-line py-3 pr-4 text-sm">
                              <span className="text-fg-soft group-hover:text-fg">{c.name}</span>
                              <span className="shrink-0 text-xs tabular-nums text-fg-subtle group-hover:text-fg-muted">{n > 0 ? `${n} Q` : "Soon"}</span>
                            </Link>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

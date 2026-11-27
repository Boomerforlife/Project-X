import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { Chapter, Subject } from "@/contracts";
import { pct, questionStats, yearSpan, type QuestionStats } from "@/lib/chapter-stats";
import { cn } from "@/lib/cn";
import { getChapters, getExams, getQuestions, getSubjects } from "@/lib/data";
import { TRACKS, TRACK_INFO, examLabel, isTrack, type Track } from "@/lib/exams";
import { routes } from "@/lib/routes";
import { NOT_FOUND_METADATA, pageMetadata, safeMetadata } from "@/lib/seo";
import { SUBJECT_STYLE } from "@/lib/subjects";

/**
 * /jee/chapter-weightage/: how many previous-year questions each chapter has, per subject and per year, counted from the
 * questions published on TabbyPrep. Answers "JEE Main chapter-wise weightage" with our own counts, states exactly which
 * years they cover, and links every chapter to its practice page. Not indexed until the track has questions.
 */
export async function generateStaticParams() {
  return TRACKS.map((track) => ({ track }));
}

type Row = { chapter: Chapter; stats: QuestionStats };
type SubjectBlock = { subject: Subject; rows: Row[]; total: number };

async function load(track: string) {
  if (!isTrack(track)) return null;
  const [subjects, chapters, exams] = await Promise.all([getSubjects(track), getChapters({ track }), getExams(track)]);
  const rows: Row[] = await Promise.all(
    chapters.map(async (c) => ({ chapter: c, stats: questionStats(await getQuestions({ subject: c.subject, chapter: c.slug, track })) })),
  );
  const blocks: SubjectBlock[] = subjects
    .map((s) => {
      // Weightage counts previous-year questions only; practice questions written for the site are left out.
      const list = rows.filter((r) => r.chapter.subject === s.id).sort((a, b) => b.stats.pyq - a.stats.pyq);
      return { subject: s, rows: list, total: list.reduce((n, r) => n + r.stats.pyq, 0) };
    })
    .filter((b) => b.total > 0);
  const total = blocks.reduce((n, b) => n + b.total, 0);
  const years = [...new Set(rows.flatMap((r) => r.stats.years.map((y) => y.year)))].sort((a, b) => b - a);
  return { track: track as Track, blocks, total, years, exam: examLabel(track as Track, exams) };
}

export async function generateMetadata({ params }: PageProps<"/[track]/chapter-weightage">) {
  return safeMetadata(async () => {
    const d = await load((await params).track);
    if (!d || d.total === 0) return NOT_FOUND_METADATA;
    const span = yearSpan(d.years);
    // The year span goes in the description, not the title: it can be long ("2019–2021, 2024–2026") and titles truncate near 60 chars.
    return pageMetadata({
      title: `${d.exam} Chapter-wise Weightage: PYQs per Chapter, Year by Year`,
      description: `How many ${d.exam} previous-year questions each Physics, Chemistry and Mathematics chapter has, year by year, counted from ${d.total.toLocaleString("en-IN")} PYQs${span ? ` in the ${span} papers` : ""}. With the most-asked chapters per subject.`,
      path: `/${d.track}/chapter-weightage/`,
    });
  });
}

export default async function WeightagePage({ params }: PageProps<"/[track]/chapter-weightage">) {
  const d = await load((await params).track);
  if (!d || d.total === 0) notFound();
  const { track, blocks, total, years, exam } = d;
  const info = TRACK_INFO[track];
  const span = yearSpan(years);
  const practice = blocks.reduce((n, b) => n + b.rows.reduce((m, r) => m + r.stats.unknownYear, 0), 0);

  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: info.name, path: `/${track}/` },
          { name: "Chapter-wise weightage", path: `/${track}/chapter-weightage/` },
        ]}
        eyebrow={`${exam} · Previous-year question analysis`}
        title={`${exam} chapter-wise weightage`}
        lede={`How many questions each chapter has had in ${exam}, counted one by one from the ${total.toLocaleString("en-IN")} previous-year questions on TabbyPrep${span ? ` (${span} papers)` : ""}. Use it to decide where your next hour of practice goes.`}
      >
        <nav aria-label="Subjects" className="mt-8 flex flex-wrap gap-2">
          {blocks.map((b) => (
            <Link key={b.subject.id} href={`#${b.subject.id}`} className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-line-strong">
              <span className={SUBJECT_STYLE[b.subject.id].text}>{b.subject.name}</span>
              <span className="ml-2 tabular-nums text-fg-subtle">{b.total.toLocaleString("en-IN")}</span>
            </Link>
          ))}
        </nav>
      </PageHeader>

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-14 sm:px-6">
        <section aria-labelledby="top-h">
          <h2 id="top-h" className="text-2xl font-semibold">
            Most-asked chapters in each subject
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">
            The five chapters with the most questions per subject. Big chapters are not automatically the best use of time: a chapter with fewer questions you
            keep getting wrong is often worth more marks.
          </p>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {blocks.map((b) => (
              <div key={b.subject.id} className="rounded-xl border border-line p-5">
                <h3 className={cn("font-semibold", SUBJECT_STYLE[b.subject.id].text)}>{b.subject.name}</h3>
                <ol className="mt-3 space-y-2 text-sm">
                  {b.rows.slice(0, 5).map((r, i) => (
                    <li key={r.chapter.slug} className="flex items-baseline justify-between gap-3">
                      <Link href={routes.chapter(track, b.subject.id, r.chapter.slug)} className="inline-flex min-h-8 items-center text-fg-soft underline-offset-4 hover:text-fg hover:underline">
                        <span className="mr-2 font-pixel text-[0.65rem] text-fg-subtle">{i + 1}</span>
                        {r.chapter.name}
                      </Link>
                      <span className="shrink-0 tabular-nums text-fg-muted">{pct(r.stats.pyq, b.total)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        {blocks.map((b) => (
          <SubjectTable key={b.subject.id} block={b} years={years} track={track} exam={exam} />
        ))}

        <section aria-labelledby="method-h" className="max-w-3xl space-y-3 text-sm leading-relaxed text-fg-muted">
          <h2 id="method-h" className="text-xl font-semibold text-fg">
            How these numbers are counted
          </h2>
          <p>
            Every number on this page is a count of the previous-year questions on TabbyPrep, taken from the official {exam} question papers released by the National
            Testing Agency (NTA). Nothing is projected or estimated, and there are no predictions for future papers.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Years covered: {span}. Years that are missing are not on TabbyPrep yet, so a chapter&rsquo;s total is not a count of every {exam} paper ever set.
            </li>
            <li>&ldquo;Share&rdquo; is a chapter&rsquo;s questions as a percentage of all questions in that subject on this page.</li>
            <li>Each question is assigned to one chapter. A question that spans two chapters is counted once, so a few may sit in a neighbouring chapter.</li>
            {practice > 0 && <li>The {practice.toLocaleString("en-IN")} practice questions written for TabbyPrep are not previous-year questions and are not counted.</li>}
          </ul>
          <p>
            The page updates as questions are added. Spotted a question in the wrong chapter? Use &ldquo;Report&rdquo; on the question, or{" "}
            <Link href="/contact/" className="text-fg underline underline-offset-2">
              contact us
            </Link>
            .
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-8">
          <ButtonLink href={routes.practice(track)} pixel>
            <Icon name="play" className="size-3.5" /> Practise free by chapter
          </ButtonLink>
          <ButtonLink href={routes.pyq(track)} variant="secondary">
            PYQs
          </ButtonLink>
          <ButtonLink href={routes.practice(track)} variant="ghost">
            All {exam} chapters
          </ButtonLink>
        </div>
      </div>
    </>
  );
}

function SubjectTable({ block, years, track, exam }: { block: SubjectBlock; years: number[]; track: Track; exam: string }) {
  const { subject, rows, total } = block;
  const style = SUBJECT_STYLE[subject.id];
  return (
    <section id={subject.id} aria-labelledby={`${subject.id}-h`} className="scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <h2 id={`${subject.id}-h`} className={cn("text-2xl font-semibold", style.text)}>
          {exam} {subject.name} chapter-wise weightage
        </h2>
        <Link href={`/${track}/${subject.id}/`} className="text-sm text-fg-soft underline-offset-4 hover:text-fg hover:underline">
          {subject.name} chapters <span aria-hidden>→</span>
        </Link>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm tabular-nums">
          <caption className="sr-only">
            {exam} {subject.name} questions per chapter and per year
          </caption>
          <thead className="text-xs text-fg-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-4 font-medium">Chapter</th>
              <th scope="col" className="py-2 pr-4 font-medium">Questions</th>
              <th scope="col" className="py-2 pr-4 font-medium">Share</th>
              {years.map((y) => (
                <th key={y} scope="col" className="py-2 pr-3 font-medium">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.chapter.slug} className="border-b border-line/60">
                <th scope="row" className="py-2 pr-4 font-normal">
                  <Link
                    href={routes.chapter(track, subject.id, r.chapter.slug)}
                    className={cn("underline-offset-4 hover:text-fg hover:underline", r.stats.pyq > 0 ? "text-fg-soft" : "text-fg-subtle")}
                  >
                    {r.chapter.name}
                  </Link>
                </th>
                <td className="py-2 pr-4">{r.stats.pyq}</td>
                <td className="py-2 pr-4 text-fg-muted">{pct(r.stats.pyq, total)}</td>
                {years.map((y) => (
                  <td key={y} className="py-2 pr-3 text-fg-muted">
                    {r.stats.years.find((x) => x.year === y)?.total ?? "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-fg-soft">
              <th scope="row" className="py-2 pr-4 font-medium">All {subject.name}</th>
              <td className="py-2 pr-4 font-medium">{total.toLocaleString("en-IN")}</td>
              <td className="py-2 pr-4 text-fg-muted">100%</td>
              {years.map((y) => (
                <td key={y} className="py-2 pr-3 text-fg-muted">
                  {rows.reduce((n, r) => n + (r.stats.years.find((x) => x.year === y)?.total ?? 0), 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

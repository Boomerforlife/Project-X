import Link from "next/link";
import { notFound } from "next/navigation";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { ChapterQuestions, type ChapterRow } from "@/components/chapter/ChapterQuestions";
import { PractiseSheet } from "@/components/chapter/PractiseSheet";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { DifficultyChip, TypeChip } from "@/components/ui/Badges";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { FULL_PAPERS, getChapter, getChapters, getQuestionCounts, getQuestions, getSubjects } from "@/lib/data";
import { RichText, richTextToPlain } from "@/components/content/RichText";
import { routes } from "@/lib/routes";
import type { QuestionCard } from "@/contracts";
import { EXAMS, TRACKS, TRACK_INFO, isTrack, type Track } from "@/lib/exams";
import { pct, questionStats, yearSpan, type QuestionStats } from "@/lib/chapter-stats";
import { isChapterIndexable } from "@/lib/indexing";
import { pageMetadata, safeMetadata, NOT_FOUND_METADATA } from "@/lib/seo";
import { SUBJECT_STYLE } from "@/lib/subjects";

export async function generateStaticParams() {
  const out: { track: string; subject: string; chapter: string }[] = [];
  for (const track of TRACKS) for (const c of await getChapters({ track })) out.push({ track, subject: c.subject, chapter: c.slug });
  // cacheComponents requires at least one param; the sentinel resolves to notFound() in load().
  return out.length ? out : [{ track: "jee", subject: "physics", chapter: "none" }];
}

async function load(track: string, subject: string, chapter: string) {
  if (!isTrack(track)) return null;
  const [subjects, c] = await Promise.all([getSubjects(track), getChapter(subject, chapter)]);
  const s = subjects.find((x) => x.id === subject);
  if (!s || !c || !c.exams.some((e) => TRACK_INFO[track].exams.includes(e))) return null;
  return { track, s, c };
}

export async function generateMetadata({ params }: PageProps<"/[track]/[subject]/[chapter]">) {
  return safeMetadata(async () => {
    const { track, subject, chapter } = await params;
    const d = await load(track, subject, chapter);
    if (!d) return NOT_FOUND_METADATA;
    const [counts, qs] = await Promise.all([getQuestionCounts(d.track), getQuestions({ subject: d.s.id, chapter: d.c.slug, track: d.track })]);
    const exam = examLabel(d.track, qs);
    const stats = questionStats(qs);
    const span = yearSpan(stats.years.map((y) => y.year));
    // Titles follow what students type ("kinematics jee mains pyq"); counts are today's published questions.
    return pageMetadata({
      title: stats.pyq ? `${d.c.name} ${exam} PYQs: ${stats.pyq} Questions with Answers` : `${d.c.name} – ${exam} ${d.s.name} practice`,
      description: stats.pyq
        ? `${stats.pyq} ${exam} previous-year questions on ${d.c.name}${span ? ` from the ${span} papers` : ""}, with answers and a year-by-year count. ${d.c.summary} Practise free online.`.trim()
        : `${d.c.summary} Practise ${exam} ${d.c.name} questions.`.trim(),
      path: `/${d.track}/${d.s.id}/${d.c.slug}/`,
      // Thin-content guard (CLAUDE.md §5): no index until the chapter has real substance.
      noindex: !isChapterIndexable(counts.byChapter.get(`${d.s.id}/${d.c.slug}`) ?? 0),
    });
  });
}

export default async function ChapterPage({ params }: PageProps<"/[track]/[subject]/[chapter]">) {
  const p = await params;
  const d = await load(p.track, p.subject, p.chapter);
  if (!d) notFound();
  const { track, s, c } = d;
  const info = TRACK_INFO[track];
  const [qs, siblings, counts] = await Promise.all([
    getQuestions({ subject: s.id, chapter: c.slug, track }),
    getChapters({ subject: s.id, track }),
    getQuestionCounts(track),
  ]);
  const total = Math.max(qs.length, counts.byChapter.get(`${s.id}/${c.slug}`) ?? 0);
  const exam = examLabel(track, qs);
  const stats = questionStats(qs);
  const style = SUBJECT_STYLE[s.id];
  const idx = siblings.findIndex((x) => x.slug === c.slug);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];
  // Newest paper first; questions without a year (written for TabbyPrep) last, in the API's order.
  const ordered = [...qs].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const rows: ChapterRow[] = ordered.map((q) => ({ id: q.id, slug: q.slug, year: q.year ?? null, type: q.type, difficulty: q.difficulty ?? null, topic: q.topic ?? null, publicPage: Boolean(q.publicPage) }));
  const bodies = Object.fromEntries(ordered.map((q) => [q.id, <RowBody key={q.id} q={q} />]));
  const topicNames = Object.fromEntries(c.topics.map((t) => [t.slug, t.name]));
  const years = [...new Set(ordered.map((q) => q.year).filter((y): y is number => typeof y === "number"))].sort((a, b) => b - a);
  // Signed-out visitors practise right on the public question pages (no login); the first one starts the chapter.
  const firstPublic = ordered.find((q) => q.publicPage);
  const startPublic = firstPublic ? routes.question(track, firstPublic.slug) : null;

  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: info.name, path: `/${track}/` },
          { name: s.name, path: `/${track}/${s.id}/` },
          { name: c.name, path: `/${track}/${s.id}/${c.slug}/` },
        ]}
        eyebrow={
          <span>
            <span className={style.text}>{s.name}</span>
            {[c.group, c.grade ? `Class ${c.grade}` : null].filter(Boolean).map((part) => ` · ${part}`)}
          </span>
        }
        title={
          <>
            {c.name}
            {qs.length > 0 && " "}
            {qs.length > 0 && <span className="mt-2 block text-2xl font-medium text-fg-soft sm:text-3xl">{exam} previous-year questions</span>}
          </>
        }
        lede={c.summary}
      >
        {total > 0 && (
          <div className="mt-8">
            <PractiseSheet exam={info.primaryExam} subject={s.id} chapter={c.slug} chapterName={c.name} total={total} years={years} firstPublicHref={startPublic} />
          </div>
        )}
      </PageHeader>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_17rem]">
        <section aria-labelledby="qs-h" className="min-w-0">
          <h2 id="qs-h" className="mb-4 text-xl font-semibold">
            Questions
          </h2>
          {qs.length ? (
            <>
              <ChapterQuestions rows={rows} bodies={bodies} track={track} exam={info.primaryExam} subject={s.id} chapter={c.slug} chapterName={c.name} topicNames={topicNames} />
              <ChapterAnalysis stats={stats} chapter={c.name} exam={exam} track={track} />
              <AllQuestions questions={ordered} track={track} chapter={c.name} />
            </>
          ) : (
            <EmptyState
              kitty={<TabbyMascot state="idle" className="h-16 text-fg-subtle" />}
              title="No questions here yet"
              body={`Questions for ${c.name} are still being added and checked. Try another ${s.name} chapter in the meantime.`}
            >
              <ButtonLink href={`/${track}/${s.id}/`} variant="secondary" size="sm">
                All {s.name} chapters
              </ButtonLink>
            </EmptyState>
          )}
        </section>

        <aside className="space-y-10 text-sm lg:sticky lg:top-20 lg:self-start">
          <section aria-labelledby="topics-h">
            <h2 id="topics-h" className="mb-3 font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">
              Topics
            </h2>
            <ul className="space-y-2">
              {c.topics.map((t) => (
                <li key={t.slug} className="flex items-center gap-2 text-fg-soft">
                  <span aria-hidden className={cn("size-1", style.bg)} />
                  {t.name}
                </li>
              ))}
            </ul>
          </section>
          {FULL_PAPERS && (
            <section className="rounded-xl border border-line p-4">
              <h2 className="font-medium">Exam-style practice</h2>
              <p className="mt-1 text-fg-muted">Sit a full previous-year paper in the CBT interface when you are ready.</p>
              <Link href={routes.pyq(track)} className="mt-3 inline-flex min-h-11 items-center gap-1 text-fg underline-offset-4 hover:underline">
                Full papers in PYQs <Icon name="arrowRight" className="size-3.5" />
              </Link>
            </section>
          )}
          <nav aria-label="Adjacent chapters" className="space-y-2 border-t border-line pt-6">
            {prev && (
              <Link href={`/${track}/${s.id}/${prev.slug}/`} className="block text-fg-muted hover:text-fg">
                <span aria-hidden>← </span>
                {prev.name}
              </Link>
            )}
            {next && (
              <Link href={`/${track}/${s.id}/${next.slug}/`} className="block text-fg-muted hover:text-fg">
                {next.name}
                <span aria-hidden> →</span>
              </Link>
            )}
          </nav>
        </aside>
      </div>
    </>
  );
}

/** A question row's content, rendered on the server (maths included) and handed to the filterable list. */
function RowBody({ q }: { q: QuestionCard }) {
  return (
    <>
      <p className="line-clamp-3 leading-relaxed text-fg-soft group-hover:text-fg">
        <RichText value={q.stem} inline />
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {/* Only previous-year questions carry a year. */}
        {q.year ? <span className="rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-fg-muted">PYQ {q.year}</span> : null}
        <TypeChip type={q.type} />
        {q.difficulty && <DifficultyChip difficulty={q.difficulty} />}
      </div>
    </>
  );
}

/**
 * An index of every public question of the chapter as plain links, newest paper first, folded away under the list. Gives
 * students (and crawlers) a path to each question page whatever the list's filters and paging show.
 */
function AllQuestions({ questions, track, chapter }: { questions: QuestionCard[]; track: Track; chapter: string }) {
  const rest = questions.filter((q) => q.publicPage);
  if (rest.length === 0) return null;
  const byYear = new Map<string, QuestionCard[]>();
  for (const q of [...rest].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))) {
    const key = q.year ? String(q.year) : "Other";
    byYear.set(key, [...(byYear.get(key) ?? []), q]);
  }
  return (
    <details className="group mt-12 rounded-xl border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <h2 className="text-lg font-semibold">Index of all {rest.length} {chapter} questions</h2>
        <Icon name="chevronDown" className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-6 border-t border-line px-5 py-5">
        {[...byYear].map(([year, list]) => (
          <div key={year}>
            <h3 className="mb-2 font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">
              {year === "Other" ? "Other questions" : `Previous-year questions ${year}`}
            </h3>
            <ul className="space-y-1.5 text-sm">
              {list.map((q) => (
                <li key={q.id}>
                  <Link href={routes.question(track, q.slug)} className="line-clamp-1 text-fg-soft underline-offset-4 hover:text-fg hover:underline">
                    {linkText(q)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function linkText(q: QuestionCard): string {
  const plain = richTextToPlain(q.stem).replace(/\s+/g, " ").trim();
  if (plain.length >= 12) return plain.length > 140 ? `${plain.slice(0, 139).trimEnd()}…` : plain;
  // No readable text: fall back to the slug's words ("a-person-has-three-bags-jee-main-2026").
  return q.slug.replace(/-/g, " ");
}

/** "JEE Main" when every question on the page is from JEE Main (true today), else the track name ("JEE"). */
function examLabel(track: Track, qs: QuestionCard[]): string {
  const primary = TRACK_INFO[track].primaryExam;
  return qs.length > 0 && qs.every((q) => q.exams.includes(primary)) ? EXAMS[primary].name : TRACK_INFO[track].name;
}

/**
 * How often this chapter is asked, counted from the questions on this page: per year, MCQ vs numerical, and the
 * difficulty mix. Unique to each chapter and answers "how many questions come from X in JEE Main?".
 */
function ChapterAnalysis({
  stats,
  chapter,
  exam,
  track,
}: {
  stats: QuestionStats;
  chapter: string;
  exam: string;
  track: Track;
}) {
  if (stats.pyq < 5 || stats.years.length === 0) return null;
  const span = yearSpan(stats.years.map((y) => y.year));
  const top = [...stats.years].sort((a, b) => b.total - a.total)[0]!;
  const rated = stats.total - stats.difficulty.unrated;
  const pyqMcq = stats.years.reduce((n, y) => n + y.mcq, 0);
  return (
    <section aria-labelledby="analysis-h" className="mt-12 rounded-xl border border-line p-5 sm:p-6">
      <h2 id="analysis-h" className="text-lg font-semibold">
        How often {chapter} comes up in {exam}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        {chapter} has {stats.pyq} previous-year questions on TabbyPrep from the {span} {exam} papers. The most in one year was {top.total}, in {top.year}.
        About {pct(pyqMcq, stats.pyq)} are multiple-choice and {pct(stats.pyq - pyqMcq, stats.pyq)} numerical-answer.
      </p>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left text-sm tabular-nums">
          <caption className="sr-only">
            {chapter} questions per year, by type
          </caption>
          <thead className="text-xs text-fg-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-4 font-medium">Year</th>
              <th scope="col" className="py-2 pr-4 font-medium">Questions</th>
              <th scope="col" className="py-2 pr-4 font-medium">MCQ</th>
              <th scope="col" className="py-2 font-medium">Numerical</th>
            </tr>
          </thead>
          <tbody>
            {stats.years.map((y) => (
              <tr key={y.year} className="border-b border-line/60">
                <th scope="row" className="py-2 pr-4 font-medium text-fg-soft">{y.year}</th>
                <td className="py-2 pr-4">{y.total}</td>
                <td className="py-2 pr-4 text-fg-muted">{y.mcq}</td>
                <td className="py-2 text-fg-muted">{y.numerical}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rated > 0 && (
        <p className="mt-4 text-sm text-fg-muted">
          Difficulty mix of all {stats.total} questions on this page (estimated per question, not an official rating): {pct(stats.difficulty.easy, rated)} easy · {pct(stats.difficulty.medium, rated)} medium ·{" "}
          {pct(stats.difficulty.hard, rated)} hard.
        </p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
        Counted from the previous-year questions on this page{stats.unknownYear ? `; the ${stats.unknownYear} practice questions written for TabbyPrep are not counted` : ""}. Years
        not listed are not in TabbyPrep yet, so this is not a count of every paper ever set. Chapters are assigned per question and a few may sit in a neighbouring
        chapter. See{" "}
        <Link href={`/${track}/chapter-weightage/`} className="underline underline-offset-2 hover:text-fg">
          chapter-wise weightage for every chapter
        </Link>
        .
      </p>
    </section>
  );
}

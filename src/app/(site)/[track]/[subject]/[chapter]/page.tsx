import Link from "next/link";
import { notFound } from "next/navigation";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { QuestionList } from "@/components/content/QuestionList";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { getChapter, getChapters, getQuestions, getSubject } from "@/lib/data";
import { TRACKS, TRACK_INFO, isTrack } from "@/lib/exams";
import { isChapterIndexable } from "@/lib/indexing";
import { pageMetadata } from "@/lib/seo";
import { SUBJECT_STYLE } from "@/lib/subjects";

const PREVIEW = 12;

export async function generateStaticParams() {
  const out: { track: string; subject: string; chapter: string }[] = [];
  for (const track of TRACKS) for (const c of await getChapters({ track })) out.push({ track, subject: c.subject, chapter: c.slug });
  return out;
}

async function load(track: string, subject: string, chapter: string) {
  if (!isTrack(track)) return null;
  const [s, c] = await Promise.all([getSubject(subject), getChapter(subject, chapter)]);
  if (!s || !c || !c.exams.some((e) => TRACK_INFO[track].exams.includes(e))) return null;
  return { track, s, c };
}

export async function generateMetadata({ params }: PageProps<"/[track]/[subject]/[chapter]">) {
  const { track, subject, chapter } = await params;
  const d = await load(track, subject, chapter);
  if (!d) return {};
  const qs = await getQuestions({ subject: d.s.id, chapter: d.c.slug, track: d.track });
  const name = TRACK_INFO[d.track].name;
  return pageMetadata({
    title: `${d.c.name} – ${name} ${d.s.name} practice`,
    description: `${d.c.summary} Practise ${name} ${d.c.name} questions with step-by-step solutions.`,
    path: `/${d.track}/${d.s.id}/${d.c.slug}/`,
    // Thin-content guard (CLAUDE.md §5): no index until the chapter has real substance.
    noindex: !isChapterIndexable(qs.filter((q) => q.publicPage).length),
  });
}

export default async function ChapterPage({ params }: PageProps<"/[track]/[subject]/[chapter]">) {
  const p = await params;
  const d = await load(p.track, p.subject, p.chapter);
  if (!d) notFound();
  const { track, s, c } = d;
  const info = TRACK_INFO[track];
  const [qs, siblings] = await Promise.all([getQuestions({ subject: s.id, chapter: c.slug, track }), getChapters({ subject: s.id, track })]);
  const style = SUBJECT_STYLE[s.id];
  const idx = siblings.findIndex((x) => x.slug === c.slug);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];
  const base = `/practice/new/?exam=${info.primaryExam}&subject=${s.id}&chapter=${c.slug}`;
  // Public pages first (crawlable), then the rest as previews.
  const shown = [...qs.filter((q) => q.publicPage), ...qs.filter((q) => !q.publicPage)].slice(0, PREVIEW);

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
            <span className={style.text}>{s.name}</span> · {c.group ? `${c.group} · ` : ""}Class {c.grade}
          </span>
        }
        title={c.name}
        lede={c.summary}
      >
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink href={`${base}&mode=learning`} pixel>
            <Icon name="play" className="size-3.5" /> Practise this chapter
          </ButtonLink>
          <ButtonLink href={`${base}&mode=test`} variant="secondary">
            <Icon name="clock" className="size-4" /> Timed test
          </ButtonLink>
          {qs.length > 0 && (
            <span className="text-sm tabular-nums text-fg-muted">
              {qs.length} question{qs.length === 1 ? "" : "s"} available
            </span>
          )}
        </div>
      </PageHeader>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_17rem]">
        <section aria-labelledby="qs-h" className="min-w-0">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2 id="qs-h" className="text-xl font-semibold">
              Questions
            </h2>
            {qs.length > PREVIEW && <p className="text-sm text-fg-muted">Showing {PREVIEW} of {qs.length}</p>}
          </div>
          {qs.length ? (
            <>
              <QuestionList questions={shown} track={track} />
              {qs.length > PREVIEW && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong p-4 text-sm">
                  <span className="text-fg-muted">{qs.length - PREVIEW} more questions are available in practice.</span>
                  <ButtonLink href={`${base}&mode=learning`} size="sm" variant="secondary">
                    Practise all {qs.length}
                  </ButtonLink>
                </div>
              )}
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
          <section className="rounded-xl border border-line p-4">
            <h2 className="font-medium">Exam-style practice</h2>
            <p className="mt-1 text-fg-muted">Sit a full paper in the CBT interface when you are ready.</p>
            <Link href={`/tests/?exam=${info.primaryExam}`} className="mt-3 inline-flex items-center gap-1 text-fg underline-offset-4 hover:underline">
              Papers & mocks <Icon name="arrowRight" className="size-3.5" />
            </Link>
          </section>
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

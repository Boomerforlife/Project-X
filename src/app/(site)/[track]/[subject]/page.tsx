import Link from "next/link";
import { isSubjectIndexable } from "@/lib/indexing";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ChapterProgress } from "@/components/site/ChapterProgress";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { getChapters, getExams, getQuestionCounts, getSubjects } from "@/lib/data";
import { TRACKS, TRACK_INFO, examLabel, isTrack } from "@/lib/exams";
import { pageMetadata, safeMetadata, NOT_FOUND_METADATA } from "@/lib/seo";
import { SUBJECT_STYLE } from "@/lib/subjects";

export async function generateStaticParams() {
  const out: { track: string; subject: string }[] = [];
  for (const track of TRACKS) for (const s of await getSubjects(track)) out.push({ track, subject: s.id });
  // cacheComponents requires at least one param; the sentinel resolves to notFound() in load().
  return out.length ? out : [{ track: "jee", subject: "physics" }];
}

async function load(track: string, subject: string) {
  if (!isTrack(track) || !TRACK_INFO[track].subjects.includes(subject as never)) return null;
  // Subjects come from the active exams of this track (API mode); inactive exams have none.
  const s = (await getSubjects(track)).find((x) => x.id === subject);
  return s ? { track, s } : null;
}

export async function generateMetadata({ params }: PageProps<"/[track]/[subject]">) {
  return safeMetadata(async () => {
    const { track, subject } = await params;
    const d = await load(track, subject);
    if (!d) return NOT_FOUND_METADATA;
    const [chapters, counts, exams] = await Promise.all([getChapters({ subject: d.s.id, track: d.track }), getQuestionCounts(d.track), getExams(d.track)]);
    const name = examLabel(d.track, exams);
    const n = counts.bySubject.get(d.s.id) ?? 0;
    return pageMetadata({
      // The count includes practice questions written for the site, so the number is never labelled "PYQs".
      title: n ? `${name} ${d.s.name} PYQs Chapter-wise, with Answers` : `${name} ${d.s.name}: chapter-wise practice`,
      description: `${n ? `${n.toLocaleString("en-IN")} ${name} ${d.s.name} questions, most of them previous-year questions (PYQs),` : `${name} ${d.s.name} practice`} across ${chapters.length} chapters, with answers. Pick a chapter, practise free online and see how often each chapter is asked. ${d.s.summary}`.trim(),
      path: `/${d.track}/${d.s.id}/`,
      noindex: !isSubjectIndexable(d.s.id, chapters, counts),
    });
  });
}

export default async function SubjectPage({ params }: PageProps<"/[track]/[subject]">) {
  const { track: t, subject } = await params;
  const d = await load(t, subject);
  if (!d) notFound();
  const { track, s } = d;
  const info = TRACK_INFO[track];
  const [chapters, counts, subjects, exams] = await Promise.all([getChapters({ subject: s.id, track }), getQuestionCounts(track), getSubjects(track), getExams(track)]);
  const exam = examLabel(track, exams);
  const total = counts.bySubject.get(s.id) ?? 0;
  const style = SUBJECT_STYLE[s.id];
  const groups = [...new Set(chapters.map((c) => c.group ?? ""))];

  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: info.name, path: `/${track}/` },
          { name: s.name, path: `/${track}/${s.id}/` },
        ]}
        eyebrow={<span className={style.text}>{info.name} · {s.name}</span>}
        title={
          <>
            {exam} {s.name}
            {total > 0 && " "}
            {total > 0 && <span className="mt-2 block text-2xl font-medium text-fg-soft sm:text-3xl">Chapter-wise previous-year questions</span>}
          </>
        }
        lede={s.summary}
      >
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink href="#chapters" pixel>
            <Icon name="play" className="size-3.5" /> Pick a chapter to practise
          </ButtonLink>
          <span className="text-sm tabular-nums text-fg-muted">
            {chapters.length} chapters · {total.toLocaleString("en-IN")} questions
          </span>
          {total > 0 && (
            <Link href={`/${track}/chapter-weightage/#${s.id}`} className="text-sm text-fg-soft underline-offset-4 hover:text-fg hover:underline">
              Chapter-wise weightage →
            </Link>
          )}
        </div>
      </PageHeader>

      <div id="chapters" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6">
        {groups.map((g) =>
          ([11, 12, undefined] as const).map((grade) => {
            const list = chapters.filter((c) => c.grade === grade && (c.group ?? "") === g);
            if (!list.length) return null;
            const label = grade ? `Class ${grade}` : g ? "" : "Chapters";
            return (
              <section key={`${g}${grade}`} aria-labelledby={`g${g}${grade}`} className="mb-14">
                <h2 id={`g${g}${grade}`} className="mb-4 font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">
                  {[g, label].filter(Boolean).join(" · ")}
                </h2>
                <ul className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2">
                  {list.map((c) => {
                    const n = counts.byChapter.get(`${s.id}/${c.slug}`) ?? 0;
                    return (
                      <li key={c.slug} className="bg-bg">
                        <Link href={`/${track}/${s.id}/${c.slug}/`} className="group flex h-full min-h-11 flex-col gap-2 p-5 transition-colors hover:bg-surface">
                          <div className="flex items-start justify-between gap-4">
                            <h3 className="text-lg font-semibold underline-offset-4 group-hover:underline">{c.name}</h3>
                            <span className={cn("shrink-0 text-xs tabular-nums", n ? style.text : "text-fg-subtle")}>{n ? `${n} question${n === 1 ? "" : "s"}` : "Coming soon"}</span>
                          </div>
                          {c.summary && <p className="text-sm text-fg-muted">{c.summary}</p>}
                          <p className="mt-1 text-xs text-fg-subtle">{c.topics.map((x) => x.name).join(" · ")}</p>
                          <ChapterProgress subject={s.id} chapter={c.slug} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          }),
        )}

        <nav aria-label="Other subjects" className="flex flex-wrap gap-3 border-t border-line pt-8 text-sm">
          <span className="text-fg-muted">Other subjects:</span>
          {subjects
            .filter((o) => o.id !== s.id)
            .map((o) => (
              <Link key={o.id} href={`/${track}/${o.id}/`} className={cn("inline-flex min-h-11 items-center underline-offset-4 hover:underline", SUBJECT_STYLE[o.id].text)}>
                {o.name}
              </Link>
            ))}
        </nav>
      </div>
    </>
  );
}

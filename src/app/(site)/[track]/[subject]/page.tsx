import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { getChapters, getQuestionCounts, getSubject, getSubjects } from "@/lib/data";
import { TRACKS, TRACK_INFO, isTrack } from "@/lib/exams";
import { pageMetadata } from "@/lib/seo";
import { SUBJECT_STYLE } from "@/lib/subjects";

export async function generateStaticParams() {
  return TRACKS.flatMap((track) => TRACK_INFO[track].subjects.map((subject) => ({ track, subject })));
}

async function load(track: string, subject: string) {
  if (!isTrack(track) || !TRACK_INFO[track].subjects.includes(subject as never)) return null;
  const s = await getSubject(subject);
  return s ? { track, s } : null;
}

export async function generateMetadata({ params }: PageProps<"/[track]/[subject]">) {
  const { track, subject } = await params;
  const d = await load(track, subject);
  if (!d) return {};
  const name = TRACK_INFO[d.track].name;
  return pageMetadata({
    title: `${name} ${d.s.name}: chapter-wise practice`,
    description: `All ${name} ${d.s.name} chapters with practice questions and step-by-step solutions. ${d.s.summary}`,
    path: `/${d.track}/${d.s.id}/`,
  });
}

export default async function SubjectPage({ params }: PageProps<"/[track]/[subject]">) {
  const { track: t, subject } = await params;
  const d = await load(t, subject);
  if (!d) notFound();
  const { track, s } = d;
  const info = TRACK_INFO[track];
  const [chapters, counts, subjects] = await Promise.all([getChapters({ subject: s.id, track }), getQuestionCounts(track), getSubjects(track)]);
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
        title={s.name}
        lede={s.summary}
      >
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink href={`/practice/new/?exam=${info.primaryExam}&subject=${s.id}`} pixel>
            <Icon name="play" className="size-3.5" /> Practise {s.name}
          </ButtonLink>
          <span className="text-sm tabular-nums text-fg-muted">
            {chapters.length} chapters · {counts.bySubject.get(s.id) ?? 0} questions
          </span>
        </div>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        {groups.map((g) =>
          ([11, 12] as const).map((grade) => {
            const list = chapters.filter((c) => c.grade === grade && (c.group ?? "") === g);
            if (!list.length) return null;
            return (
              <section key={`${g}${grade}`} aria-labelledby={`g${g}${grade}`} className="mb-14">
                <h2 id={`g${g}${grade}`} className="mb-4 font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">
                  {g ? `${g} · ` : ""}Class {grade}
                </h2>
                <ul className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2">
                  {list.map((c) => {
                    const n = counts.byChapter.get(`${s.id}/${c.slug}`) ?? 0;
                    return (
                      <li key={c.slug} className="bg-bg">
                        <Link href={`/${track}/${s.id}/${c.slug}/`} className="group flex h-full flex-col gap-2 p-5 transition-colors hover:bg-surface">
                          <div className="flex items-start justify-between gap-4">
                            <h3 className="text-lg font-semibold underline-offset-4 group-hover:underline">{c.name}</h3>
                            <span className={cn("shrink-0 text-xs tabular-nums", n ? style.text : "text-fg-subtle")}>{n ? `${n} question${n === 1 ? "" : "s"}` : "Coming soon"}</span>
                          </div>
                          <p className="text-sm text-fg-muted">{c.summary}</p>
                          <p className="mt-1 text-xs text-fg-subtle">{c.topics.map((x) => x.name).join(" · ")}</p>
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
              <Link key={o.id} href={`/${track}/${o.id}/`} className={cn("underline-offset-4 hover:underline", SUBJECT_STYLE[o.id].text)}>
                {o.name}
              </Link>
            ))}
        </nav>
      </div>
    </>
  );
}

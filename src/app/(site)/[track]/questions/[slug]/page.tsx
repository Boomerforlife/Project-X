import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Blocks } from "@/components/content/Blocks";
import { richTextToPlain } from "@/components/content/RichText";
import { PageHeader } from "@/components/layout/PageHeader";
import { DifficultyChip, SubjectTag, TypeChip, VERIFICATION_COPY, VerificationBadge } from "@/components/ui/Badges";
import { ContinueInPlayer } from "@/components/practice/ContinueInPlayer";
import { AUTHOR, DisputedNote, PROVENANCE, SolutionSteps } from "@/components/practice/SolutionPanel";
import { PublicTry } from "@/components/practice/PublicTry";
import type { AnswerKey, Question, Solution } from "@/contracts";
import { cn } from "@/lib/cn";
import { getChapter, getPublicQuestions, getQuestionPage, getQuestions, getRelatedQuestions, getSubjects } from "@/lib/data";
import { EXAMS, TRACK_INFO, isTrack, trackOf, type Track } from "@/lib/exams";
import { routes } from "@/lib/routes";
import { isQuestionIndexable } from "@/lib/indexing";
import { answerLabel } from "@/lib/practice/check";
import { stripPaperHeader } from "@/lib/api/adapters/blocks";
import { sourceLabel } from "@/lib/source";
import { SITE } from "@/lib/site";
import { pageMetadata, safeMetadata, NOT_FOUND_METADATA } from "@/lib/seo";

export async function generateStaticParams() {
  const params = (await getPublicQuestions()).map((q) => ({ track: trackOf(q.exams[0]), slug: q.slug }));
  // cacheComponents requires at least one param; the sentinel resolves to notFound().
  return params.length ? params : [{ track: "jee", slug: "none" }];
}

type Loaded = { kind: "ok"; q: Question; s: { id: Question["subject"]; name: string }; c: { slug: string; name: string; summary: string }; sol: Solution | null; track: Track };
type LoadResult = Loaded | { kind: "moved"; slug: string } | { kind: "missing" };

async function load(track: string, slug: string): Promise<LoadResult> {
  if (!isTrack(track)) return { kind: "missing" };
  const page = await getQuestionPage(slug);
  if (page.status !== "ok") return page.status === "moved" ? { kind: "moved", slug: page.slug } : { kind: "missing" };
  const { question: q, solution: sol } = page;
  // Only questions the backend marks as public-page-eligible get a URL, under their own track.
  if (!q.publicPage || trackOf(q.exams[0]) !== track) return { kind: "missing" };
  const [subjects, c] = await Promise.all([getSubjects(track), getChapter(q.subject, q.chapter)]);
  const s = subjects.find((x) => x.id === q.subject);
  if (!s || !c) return { kind: "missing" };
  return { kind: "ok", q, s, c, sol, track };
}

export async function generateMetadata({ params }: PageProps<"/[track]/questions/[slug]">) {
  return safeMetadata(async () => {
    const p = await params;
    const data = await load(p.track, p.slug);
    if (data.kind !== "ok") return NOT_FOUND_METADATA;
    const { q, s, c, track, sol } = data;
    const words = questionWords(q);
    const worked = (sol?.steps.length ?? 0) > 0 ? " Worked solution included." : " Official answer key included.";
    // Lead with the question's own words: that is what a student types into a search box.
    const title = words ? `${clip(words, 58)} | ${shortSource(q, c.name)}` : `${c.name} question: ${sourceLabel(q.source)}`;
    const description = words
      ? clip(`${clip(words, 105)} ${sourceLabel(q.source)}, ${s.name} (${c.name}).${worked}`, 165)
      : `${TRACK_INFO[track].name} ${s.name} · ${c.name}. ${sourceLabel(q.source)}.${worked}`;
    return pageMetadata({
      title,
      description,
      path: `/${track}/questions/${q.slug}/`,
      // Disputed or solution-less questions stay out of the index until resolved; so does an image-only question with
      // no readable text (a thin page: nothing for a search engine or AI answer engine to read).
      noindex: !isQuestionIndexable(q) || !words,
      ogType: "article",
    });
  });
}

export default async function QuestionPage({ params }: PageProps<"/[track]/questions/[slug]">) {
  const p = await params;
  const data = await load(p.track, p.slug);
  // Renamed slug: permanent redirect to the new URL under the same track.
  if (data.kind === "moved") permanentRedirect(`/${p.track}/questions/${data.slug}/`);
  if (data.kind !== "ok") notFound();
  const { q, s, c, sol, track } = data;
  const [relatedAll, chapterQs] = await Promise.all([
    getRelatedQuestions(q.slug, 4),
    getQuestions({ subject: s.id, chapter: c.slug, track }).catch(() => []),
  ]);
  const related = relatedAll.filter((x) => x.id !== q.id && x.publicPage);
  // Previous / Next walk the chapter in the same order as its list (newest paper first). Next wraps to the first, so a
  // visitor can keep going; Previous stops at the start.
  const ordered = [...chapterQs].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const publicInChapter = ordered.filter((x) => x.publicPage);
  const at = publicInChapter.findIndex((x) => x.slug === q.slug);
  const next = publicInChapter.length > 1 ? publicInChapter[(at + 1) % publicInChapter.length] : undefined;
  const nextHref = next && next.slug !== q.slug ? routes.question(track, next.slug) : null;
  const prev = at > 0 ? publicInChapter[at - 1] : undefined;
  const prevHref = prev ? routes.question(track, prev.slug) : null;
  const position = at >= 0 && publicInChapter.length > 1 ? `Question ${at + 1} of ${publicInChapter.length} in ${c.name}` : null;
  const optionRefs = Object.fromEntries(q.options.flatMap((o) => (o.ref ? [[o.id, o.ref] as const] : [])));

  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: TRACK_INFO[track].name, path: `/${track}/` },
          { name: s.name, path: `/${track}/${s.id}/` },
          { name: c.name, path: `/${track}/${s.id}/${c.slug}/` },
          { name: "Question", path: `/${track}/questions/${q.slug}/` },
        ]}
        eyebrow={q.source.kind === "pyq" ? "Previous-year question" : "Practice question"}
        title={heading(q, c.name)}
        titleClass="text-2xl! sm:text-3xl! leading-snug"
      >
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <SubjectTag subject={s.id} label={s.name} />
          <TypeChip type={q.type} />
          {q.difficulty && <DifficultyChip difficulty={q.difficulty} />}
          <VerificationBadge status={q.verification.status} note={q.verification.note} />
          <SourceLabel q={q} />
        </div>
      </PageHeader>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,46rem)_1fr]">
        <article className="min-w-0">
          {q.verification.status === "disputed" && (
            <div role="note" className="mb-6 rounded-md border border-review/40 bg-review/5 p-4 text-sm text-fg-soft">
              <p className="font-medium text-review">This question is under review</p>
              <p className="mt-1">{q.verification.note ?? VERIFICATION_COPY.disputed.help}</p>
            </div>
          )}

          <div className="text-lg leading-relaxed">
            <Blocks blocks={q.blocks} fallback={q.stem} />
          </div>
          {q.textVersion && (
            <section aria-labelledby="tv-h" className="mt-4 rounded-md border border-line bg-surface/40 p-4">
              <h2 id="tv-h" className="text-xs font-medium uppercase tracking-wider text-fg-muted">
                Text version
              </h2>
              <p className="mt-2 leading-relaxed text-fg-soft">{q.textVersion}</p>
              <p className="mt-2 text-xs text-fg-subtle">
                Read automatically from the question paper, so symbols and formulas may be garbled. The image above is the original.
              </p>
            </section>
          )}

          {/* Answer right here, no account needed (the answer is public on this page anyway); signed-out visitors are
              invited to sign up after a few questions. Options stay server-rendered for crawlers and KaTeX. */}
          <p className="mt-8 text-sm text-fg-muted">Pick an answer and check it: free, no sign-up needed.</p>
          <PublicTry
            slug={q.slug}
            type={q.type}
            options={q.options.map((o) => ({ id: o.id, node: <Blocks blocks={o.blocks} fallback={o.body} zoom={false} /> }))}
            answer={sol?.answer ?? null}
            nextHref={nextHref}
            prevHref={prevHref}
            position={position}
            solutionId="solution"
            questionId={q.id}
            optionRefs={optionRefs}
          />

          <div className="mt-6 flex flex-wrap gap-3">
            <ContinueInPlayer exam={q.exams[0] ?? TRACK_INFO[track].primaryExam} subject={s.id} chapter={c.slug} chapterName={c.name} ids={ordered.map((x) => x.id)} startId={q.id} />
          </div>

          <SolutionBlock sol={sol} />
        </article>

        <aside className="space-y-8 text-sm lg:pt-1">
          <section aria-labelledby="ch-h" className="rounded-lg border border-line p-5">
            <h2 id="ch-h" className="font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">
              Chapter
            </h2>
            <Link href={`/${track}/${s.id}/${c.slug}/`} className="mt-2 block text-base font-semibold hover:underline underline-offset-4">
              {c.name}
            </Link>
            {c.summary && <p className="mt-1 text-fg-muted">{c.summary}</p>}
          </section>
          {related.length > 0 && (
            <section aria-labelledby="rel-h">
              <h2 id="rel-h" className="mb-3 font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">
                More from this chapter
              </h2>
              <ul className="space-y-2">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/${track}/questions/${r.slug}/`} className="line-clamp-2 text-fg-soft hover:text-fg">
                      {richTextToPlain(r.stem)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

/** The question's own words: its text stem, else the machine-read text of an image stem. Empty when neither reads. */
function questionWords(q: Question): string {
  const plain = stripPaperHeader(richTextToPlain(q.stem).replace(/\s+/g, " ").trim());
  if (plain.length >= 20) return plain;
  return q.textVersion ?? "";
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.(-]+$/, "")}…`;
}

/** "JEE Main 2024 PYQ" for previous-year questions, else the chapter (keeps titles short). */
function shortSource(q: Question, chapter: string): string {
  if (q.source.kind !== "pyq") return chapter;
  const exam = q.exams.some((e) => e === "jee-advanced") ? "JEE Advanced" : q.exams.some((e) => e === "neet") ? "NEET" : "JEE Main";
  return `${exam} ${q.source.year} PYQ`;
}

/**
 * H1: short and readable (UX audit H10): the chapter and the sitting, e.g. "Electrostatics · JEE Main 2024, Shift 1".
 * The question itself follows in full right below; the page title keeps the question's own words for search.
 */
function heading(q: Question, chapter: string): string {
  const src = q.source;
  if (src.kind !== "pyq") return `${chapter} · practice question`;
  if (src.paper) return `${chapter} · ${src.paper}`;
  const sitting = [src.session, src.shift ? `Shift ${src.shift}` : null].filter(Boolean).join(", ");
  return `${chapter} · ${EXAMS[src.exam].name} ${src.year}${sitting ? `, ${sitting}` : ""}`;
}

function SourceLabel({ q }: { q: Question }) {
  if (q.source.kind !== "pyq") return <span className="text-xs text-fg-muted">{sourceLabel(q.source)}</span>;
  // Previous-year question: credit the publisher (Terms, "Previous-year questions and official answer keys").
  const body = q.exams.some((e) => e === "jee-advanced") ? "JAB / IIT (jeeadv.ac.in)" : "the National Testing Agency (NTA)";
  return (
    <span className="text-xs text-fg-muted">
      {sourceLabel(q.source)} · Question paper and answer key published by {body}. Reproduced for practice; {SITE.name} is not affiliated with the exam body.
    </span>
  );
}

function answerText(a: AnswerKey) {
  return answerLabel(a, "Option");
}

/**
 * Answer + solution are in the server HTML (useful, crawlable) but collapsed
 * by default so a student is never spoiled before they try.
 */
function SolutionBlock({ sol }: { sol: Solution | null }) {
  if (!sol) {
    return (
      <div className="mt-10 rounded-lg border border-dashed border-line-strong p-5 text-sm text-fg-muted">
        A worked solution for this question isn&rsquo;t available yet.
      </div>
    );
  }
  return (
    <details id="solution" className="group mt-10 scroll-mt-20 rounded-lg border border-line bg-surface open:bg-surface/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg p-5 font-medium select-none hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <span>
          Show answer and solution
          {sol.verification.status === "disputed" && <span className="ml-2 text-xs font-normal text-review">· under review</span>}
        </span>
        <span aria-hidden className="font-pixel text-xs text-fg-muted transition-transform group-open:rotate-90">
          ▶
        </span>
      </summary>
      <div className="space-y-6 border-t border-line p-5">
        <DisputedNote solution={sol} className="rounded-md border border-review/40 px-4 py-3" />
        <div>
          <p className="font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">Answer</p>
          <p className="mt-2 text-2xl font-semibold">{answerText(sol.answer)}</p>
          <p className="mt-1 text-xs text-fg-muted">{PROVENANCE[sol.answerProvenance]}</p>
        </div>
        <div>
          <p className="font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">Solution</p>
          <SolutionSteps solution={sol} />
        </div>
        <p className={cn("flex flex-wrap items-center gap-2 border-t border-line pt-4 text-xs text-fg-muted")}>
          <span>{AUTHOR[sol.generatedBy]}</span>
          <span aria-hidden>·</span>
          <VerificationBadge status={sol.verification.status} note={sol.verification.note} />
        </p>
      </div>
    </details>
  );
}

import Link from "next/link";
import { Kitty } from "@/components/brand/Kitty";
import { RichText } from "@/components/content/RichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { tryQuestionHref } from "@/components/site/try-target";
import { VERIFICATION_COPY } from "@/components/ui/Badges";
import { ButtonLink } from "@/components/ui/Button";
import type { VerificationStatus } from "@/contracts";
import { cn } from "@/lib/cn";
import type { Chapter, ExamId, Subject } from "@/contracts";
import { brandFacts, fmt, type TrackFacts } from "@/lib/brand-facts";
import { COPY } from "@/lib/copy";
import { FULL_PAPERS, PAPERS_VISIBLE, getChapters, getExams, getPyqPapers, getQuestionCounts, getSubjects } from "@/lib/data";
import { EXAMS, EXAM_LIST } from "@/lib/exams";
import { liveTracks } from "@/lib/live-tracks";
import { routes } from "@/lib/routes";
import { pageMetadata, siteJsonLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { SUBJECT_STYLE } from "@/lib/subjects";

/** Brand first, then what students search for ("online JEE practice", "JEE Main PYQs"). */
const HOME_TITLE = `${SITE.name}: Free JEE Main PYQs & Chapter-wise Practice Online`;

export const metadata = {
  ...pageMetadata({ title: HOME_TITLE, description: SITE.description, path: "/" }),
  title: { absolute: HOME_TITLE },
};

type Num = { n: number; label: string };

export default async function HomePage() {
  const [subjects, chapters, facts, jeeExams, tracks, tryHref, counts, papers] = await Promise.all([
    getSubjects(),
    getChapters(),
    brandFacts().catch(() => []),
    getExams("jee"),
    liveTracks(),
    tryQuestionHref("jee"),
    getQuestionCounts("jee").catch(() => null),
    // An API failure only hides the paper numbers; the page still renders.
    getPyqPapers("jee").catch(() => []),
  ]);
  const jee = facts.find((f) => f.track === "jee");
  // Only exams that have questions today are named in the hero (no JEE Advanced/NEET claims before they exist).
  const live = facts.flatMap((f) => (f.track === "jee" ? jeeExams.map((e) => EXAMS[e].name) : [f.name]));
  const neet = tracks.includes("neet") && facts.some((f) => f.track === "neet");
  // Exams that are actually live: JEE's active exams, plus every exam of another live track.
  const liveExamIds = new Set<ExamId>(EXAM_LIST.filter((e) => (e.track === "jee" ? jeeExams.includes(e.id) : tracks.includes(e.track))).map((e) => e.id));
  const realPapers = papers.filter((p) => !p.isDemo);
  const years = new Set(realPapers.map((p) => p.year));
  const nums = [
    counts && counts.total > 0 ? { n: counts.total, label: "questions" } : null,
    realPapers.length > 0 ? { n: realPapers.length, label: "complete papers" } : null,
    years.size > 0 ? { n: years.size, label: "exam years" } : null,
  ].filter((x): x is Num => x !== null);

  return (
    <>
      <JsonLd data={siteJsonLd()} />
      <Hero exams={live} neet={neet} tryHref={tryHref} nums={nums} />
      {jee && <Inside facts={jee} />}
      <HowItWorks />
      <ExamsSection subjects={subjects} chapters={chapters} liveExamIds={liveExamIds} />
      <CommonQuestions facts={jee} />
      <ClosingCta tryHref={tryHref} />
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">{children}</p>;
}

function Hero({ exams, neet, tryHref, nums }: { exams: string[]; neet: boolean; tryHref: string; nums: Num[] }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div aria-hidden className="dot-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pt-8 pb-14 sm:px-6 md:grid-cols-[1.15fr_1fr] md:gap-12 md:pt-24 md:pb-28">
        <div>
          <p className="pixel-corners inline-flex items-center gap-2 bg-surface-2 px-3 py-1.5 font-pixel text-[0.7rem] uppercase tracking-widest text-fg-soft">
            <span aria-hidden className="size-1.5 bg-ok" /> {exams.length ? exams.join(" · ") : "JEE Main"} · Physics · Chemistry · Maths
          </p>
          {/* One H1 that says what the site is (read by search engines and screen readers); the display line stays the visual. */}
          <h1 className="mt-4 sm:mt-6">
            <span className="block max-w-md text-base leading-snug font-medium text-fg-soft sm:text-xl">
              {SITE.name}: online JEE preparation with previous-year questions, chapter by chapter
            </span>{" "}
            <span className="mt-3 block text-[2.4rem] leading-[1.02] font-semibold sm:mt-5 sm:text-6xl lg:text-[4.25rem]">
              Practise.
              <br />
              Understand.
              <br />
              <span className="caret-block">Improve</span>
            </span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-fg-muted sm:mt-6 sm:text-lg">
            Practise {neet ? "JEE and NEET" : "JEE Main"} previous-year questions chapter by chapter{FULL_PAPERS ? ", sit full papers in an exam-style CBT" : ""}, check
            every answer, and keep the mistakes worth revisiting in one place. Free to start, and you can try a question without an account.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
            <ButtonLink href={tryHref} size="lg" pixel>
              Try a question
            </ButtonLink>
            <ButtonLink href={routes.signup()} size="lg" variant="secondary">
              Create a free account
            </ButtonLink>
            <Link
              href={FULL_PAPERS ? routes.pyq("jee") : routes.practice("jee")}
              className="inline-flex min-h-11 items-center px-2 text-sm text-fg-soft underline-offset-4 hover:text-fg hover:underline"
            >
              {FULL_PAPERS ? `Browse ${COPY.pyqs}` : "Browse chapters"} <span aria-hidden className="ml-1">→</span>
            </Link>
          </div>
          {nums.length > 0 && (
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2">
              {nums.map((x) => (
                <div key={x.label} className="flex items-baseline gap-2">
                  <dd className="order-1 text-xl font-semibold tabular-nums">{fmt(x.n)}</dd>
                  <dt className="order-2 text-sm text-fg-muted">{x.label}</dt>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="relative mx-auto w-full max-w-[180px] sm:max-w-[320px] md:max-w-[420px]">
          <Kitty animated className="relative z-10 w-full text-fg" />
          <div aria-hidden className="absolute inset-x-[8%] bottom-[2.5%] h-px bg-line-strong" />
        </div>
      </div>
    </section>
  );
}

const MODES = [
  {
    name: "Learning mode",
    tag: "Feedback after every answer",
    points: ["See whether you were right immediately", "Hints before the full solution", "Solutions with step-by-step working"],
  },
  {
    name: "Test mode",
    tag: "Answers stay hidden until you submit",
    points: ["Timer and mark-for-review", "No hints during the attempt", "Full results and solutions at the end"],
  },
  {
    name: "CBT simulation",
    tag: "A dedicated exam-style interface",
    points: ["Question palette and section navigation", "Autosave, with save status always shown", "Every retry is a fresh attempt"],
  },
];

/**
 * How it works, in one section: the practise/understand/improve loop, the three ways to practise, and how answers are
 * checked. These were three full-height sections, which made the page very long on phones.
 */
function HowItWorks() {
  // Only labels questions actually carry today (search engines and AI assistants repeat this list as features).
  // Add "human_reviewed" back once questions are reviewed by a person.
  const shown: VerificationStatus[] = ["official_key_checked", "ai_checked", "disputed"];
  return (
    <section aria-labelledby="loop-h" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <SectionLabel>How it works</SectionLabel>
      <h2 id="loop-h" className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">
        One loop: practise, understand, improve.
      </h2>
      <ol className="mt-8 grid gap-4 sm:mt-12 md:grid-cols-3 md:gap-6">
        <LoopStep n={1} title="Practise" body="Pick a chapter, a year, or a difficulty. Answer MCQs and numerical questions with a timer, scratchpad and calculator.">
          <div className="space-y-2 text-sm">
            <p className="text-fg-soft">
              <RichText value="Flux through one face of a cube with $q$ at its centre:" />
            </p>
            {[
              ["A", "$\\dfrac{q}{\\varepsilon_0}$", false],
              ["B", "$\\dfrac{q}{6\\varepsilon_0}$", true],
            ].map(([id, body, sel]) => (
              <div key={id as string} className={cn("flex items-center gap-3 rounded-md border px-3 py-2", sel ? "border-fg bg-surface-2" : "border-line")}>
                <span className={cn("grid size-6 place-items-center rounded-sm text-xs font-semibold", sel ? "bg-fg text-bg" : "bg-surface-3")}>{id as string}</span>
                <RichText value={body as string} />
              </div>
            ))}
          </div>
        </LoopStep>
        <LoopStep n={2} title="Understand" body="See the answer, with a step-by-step solution where one is written and an honest label for how it was checked.">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-ok">
              <span aria-hidden>✓</span> Correct, option B
            </div>
            <div className="border-l-2 border-line-strong pl-3 text-fg-soft">
              <RichText value="By symmetry, all six faces share the total flux $\dfrac{q}{\varepsilon_0}$ equally." />
            </div>
          </div>
        </LoopStep>
        <LoopStep n={3} title="Improve" body="Wrong answers land in your mistake notebook automatically. Tag why you slipped, then reattempt them later.">
          <ul className="space-y-2 text-sm">
            {[
              ["Rotational Motion", "Calculation error", "text-physics"],
              ["Equilibrium", "Formula recall", "text-chemistry"],
              ["Definite integrals", "Misread question", "text-mathematics"],
            ].map(([ch, tag, c]) => (
              <li key={ch} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                <span className={c}>{ch}</span>
                <span className="text-xs text-fg-muted">{tag}</span>
              </li>
            ))}
          </ul>
        </LoopStep>
      </ol>

      <div className="mt-12 border-t border-line pt-10 sm:mt-14">
        <h3 className="max-w-2xl text-2xl font-semibold">Learn when you want to learn. Test when you need to know.</h3>
        <div className="mt-8 grid gap-8 md:grid-cols-3 md:gap-8">
          {MODES.map((m) => (
            <div key={m.name}>
              <h4 className="text-lg font-semibold">{m.name}</h4>
              <p className="mt-1 text-sm text-fg-muted">{m.tag}</p>
              <ul className="mt-4 space-y-2 text-sm text-fg-soft">
                {m.points.map((p) => (
                  <li key={p} className="flex gap-3">
                    <span aria-hidden className="mt-2 size-1 shrink-0 bg-fg-muted" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 grid gap-8 border-t border-line pt-10 sm:mt-14 md:grid-cols-[1fr_1.2fr] md:gap-12">
        <div>
          <h3 className="text-2xl font-semibold">Every answer says how it was checked.</h3>
          <p className="mt-4 max-w-md leading-relaxed text-fg-muted">
            Solutions can be wrong, including AI-assisted ones. Each question carries a label that tells you how far to trust it, and you can report anything that
            looks off.
          </p>
        </div>
        <dl className="divide-y divide-line rounded-lg border border-line">
          {shown.map((s) => {
            const c = VERIFICATION_COPY[s];
            return (
              <div key={s} className="grid gap-1 p-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className={cn("font-medium", c.tone === "good" && "text-ok", c.tone === "warn" && "text-review")}>{c.label}</dt>
                <dd className="text-sm leading-relaxed text-fg-muted">{c.help}</dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

function LoopStep({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col rounded-lg border border-line bg-surface">
      {/* The little product preview is decoration: it is hidden on phones to keep the page short. */}
      <div aria-hidden className="pointer-events-none hidden select-none border-b border-line p-5 sm:block">
        {children}
      </div>
      <div className="p-5">
        <h3 className="flex items-center gap-3 text-xl font-semibold">
          <span className="font-pixel text-xs text-fg-subtle">0{n}</span>
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</p>
      </div>
    </li>
  );
}

function ClosingCta({ tryHref }: { tryHref: string }) {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="relative flex flex-col items-start gap-6 overflow-hidden rounded-lg border border-line bg-surface p-6 sm:gap-8 sm:p-12 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-semibold">Start with one question.</h2>
          <p className="mt-2 text-fg-muted">A few questions a day add up. Pick a chapter when you are ready.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <ButtonLink href={tryHref} size="lg" pixel>
            Try a question
          </ButtonLink>
          <ButtonLink href={routes.signup()} size="lg" variant="secondary">
            Create a free account
          </ButtonLink>
          <Kitty pose="sleep" className="hidden h-20 w-auto text-fg-subtle sm:block" />
        </div>
      </div>
    </section>
  );
}

function ExamsSection({ subjects, chapters, liveExamIds }: { subjects: Subject[]; chapters: Chapter[]; liveExamIds: Set<ExamId> }) {
  // Only exams with content are shown: no "Coming soon" cards for exams that are gated off (NEET, JEE Advanced).
  const exams = EXAM_LIST.filter((e) => liveExamIds.has(e.id));
  if (exams.length === 0) return null;
  const hasNeet = exams.some((e) => e.track === "neet");
  return (
    <section aria-labelledby="exams-h" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <SectionLabel>Exams</SectionLabel>
      <h2 id="exams-h" className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">
        {hasNeet ? "JEE and NEET" : "JEE"}, organised the way you revise.
      </h2>
      <div className={cn("mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:mt-10", exams.length > 1 && "md:grid-cols-2", exams.length > 2 && "md:grid-cols-3")}>
        {exams.map((e) => {
          const subs = subjects.filter((s) => e.subjects.includes(s.id));
          const n = chapters.filter((c) => c.exams.includes(e.id)).length;
          return (
            <div key={e.id} className="flex flex-col gap-5 bg-bg p-6 sm:p-8">
              <div>
                <h3 className="text-2xl font-semibold">{e.name}</h3>
                <p className="mt-1 text-sm text-fg-muted">{e.pattern}</p>
              </div>
              <p className="text-sm leading-relaxed text-fg-soft">{e.blurb}</p>
              <ul className="space-y-1.5 text-sm">
                {subs.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span aria-hidden className={cn("size-1.5", SUBJECT_STYLE[s.id].bg)} />
                    {n > 0 ? (
                      <Link href={routes.subject(e.track, s.id)} className={cn("inline-flex min-h-8 items-center hover:underline", SUBJECT_STYLE[s.id].text)}>
                        {s.name}
                      </Link>
                    ) : (
                      <span className={SUBJECT_STYLE[s.id].text}>{s.name}</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-5 text-sm">
                {n > 0 ? (
                  <Link href={routes.practice(e.track)} className="inline-flex min-h-11 items-center text-fg-soft hover:text-fg">
                    {n} chapters <span aria-hidden className="ml-1">→</span>
                  </Link>
                ) : null}
                {FULL_PAPERS && n > 0 ? (
                  <Link href={routes.pyq(e.track)} className="inline-flex min-h-11 items-center text-fg-soft hover:text-fg">
                    {PAPERS_VISIBLE ? `${COPY.pyqs} and papers` : `${COPY.pyqs}: full papers in CBT`} <span aria-hidden className="ml-1">→</span>
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * What is on the site, in counts read from the API (never rounded up), with links into the most-asked chapters. Tells
 * a first-time visitor (and a crawler) what TabbyPrep actually contains without signing in.
 */
function Inside({ facts }: { facts: TrackFacts }) {
  const subjects = facts.subjects.filter((s) => s.questions > 0);
  return (
    <section aria-labelledby="inside-h" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <SectionLabel>What&rsquo;s inside</SectionLabel>
        <h2 id="inside-h" className="mt-3 max-w-3xl text-3xl font-semibold sm:text-4xl">
          {fmt(facts.questions)} JEE Main questions, sorted by chapter.
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-fg-muted">
          Most are previous-year questions from official JEE Main papers published by the National Testing Agency, shown as they were set, with their answers; a
          smaller set are practice questions written for the site and labelled as such. Open any chapter to see its questions and how often it has been asked, then
          practise it free.
        </p>
        <div className="mt-8 grid gap-4 sm:mt-10 sm:gap-6 md:grid-cols-3">
          {subjects.map((s) => {
            const all = facts.chapters.filter((c) => c.subject === s.id);
            const top = [...all].sort((a, b) => b.questions - a.questions).slice(0, 4);
            const style = SUBJECT_STYLE[s.id as keyof typeof SUBJECT_STYLE];
            return (
              <div key={s.id} className="rounded-xl border border-line bg-surface p-6">
                <h3 className={cn("text-xl font-semibold", style?.text)}>
                  <Link href={routes.subject(facts.track, s.id)} className="underline-offset-4 hover:underline">
                    JEE Main {s.name}
                  </Link>
                </h3>
                <p className="mt-1 text-sm tabular-nums text-fg-muted">
                  {fmt(s.questions)} questions · {all.length} chapters
                </p>
                <p className="mt-5 text-xs text-fg-subtle">Most-asked chapters</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {top.map((c) => (
                    <li key={c.slug} className="flex items-baseline justify-between gap-3">
                      <Link href={routes.chapter(facts.track, c.subject as string, c.slug)} className="inline-flex min-h-8 items-center text-fg-soft underline-offset-4 hover:text-fg hover:underline">
                        {c.name}
                      </Link>
                      <span className="shrink-0 text-xs tabular-nums text-fg-subtle">{c.questions}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Link href={routes.practice(facts.track)} className="inline-flex min-h-11 items-center text-fg-soft hover:text-fg">
            All {facts.chapters.length} chapters <span aria-hidden className="ml-1">→</span>
          </Link>
          <Link href={`/${facts.track}/chapter-weightage/`} className="inline-flex min-h-11 items-center text-fg-soft hover:text-fg">
            JEE Main chapter-wise weightage <span aria-hidden className="ml-1">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Questions students ask before they sign up, answered in visible text only: no FAQPage markup (CLAUDE.md §15). Every
 * answer must stay true; counts come from the API. Native <details>: collapsed on screen, the text stays in the HTML.
 */
function CommonQuestions({ facts }: { facts?: TrackFacts }) {
  const items: { q: string; a: React.ReactNode }[] = [
    {
      q: `What is ${SITE.name}?`,
      a: (
        <>
          {SITE.name} is an independent online JEE preparation site. It collects JEE Main previous-year questions (PYQs) chapter by chapter so you can practise
          one topic at a time, check each answer, and keep a notebook of the questions you got wrong. <Link href="/about/">More about {SITE.name}</Link>.
        </>
      ),
    },
    {
      q: "Is it free?",
      a: (
        <>
          Yes. You can start answering chapter questions right away, without an account. A free account keeps your progress and mistake notebook, with
          unlimited practice{FULL_PAPERS ? " and a few full papers in the exam-style CBT each month" : ""}. An optional paid plan adds more:{" "}
          <Link href="/pricing/">see what each plan includes</Link>.
        </>
      ),
    },
    {
      q: "Where do the questions and answers come from?",
      a: `Most are previous-year questions from the official JEE Main papers, with answers matched to the answer keys published by the National Testing Agency (NTA). A smaller set are practice questions written for the site, labelled as such. Each question page shows how its answer was checked. ${SITE.name} is not affiliated with NTA.`,
    },
    {
      q: "Can I prepare for JEE without coaching?",
      a: "Many students do much of their preparation on their own. What helps most is regular practice on real exam questions and an honest review of mistakes, which is what this site is for. It does not replace learning the concepts from your textbooks or teachers.",
    },
    ...(facts
      ? [
          {
            q: "Which chapters come up most often?",
            a: (
              <>
                It differs by subject. The <Link href={`/${facts.track}/chapter-weightage/`}>chapter-wise weightage page</Link> counts the questions per chapter
                and per year across the previous-year questions here.
              </>
            ),
          },
        ]
      : []),
  ];
  return (
    <section aria-labelledby="faq-h" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
      <SectionLabel>Questions</SectionLabel>
      <h2 id="faq-h" className="mt-3 text-3xl font-semibold sm:text-4xl">
        Before you start
      </h2>
      <div className="mt-8 divide-y divide-line rounded-lg border border-line md:max-w-3xl [&_a]:text-fg [&_a]:underline [&_a]:underline-offset-2">
        {items.map((i) => (
          <details key={i.q} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-semibold marker:hidden [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:-outline-offset-2">
              {i.q}
              <span aria-hidden className="shrink-0 text-fg-muted transition-transform group-open:rotate-45 motion-reduce:transition-none">
                +
              </span>
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-fg-muted">{i.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

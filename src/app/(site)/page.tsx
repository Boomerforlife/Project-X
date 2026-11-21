import Link from "next/link";
import { Kitty } from "@/components/brand/Kitty";
import { RichText } from "@/components/content/RichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { VERIFICATION_COPY } from "@/components/ui/Badges";
import { ButtonLink } from "@/components/ui/Button";
import type { VerificationStatus } from "@/contracts";
import { cn } from "@/lib/cn";
import type { Chapter, Subject } from "@/contracts";
import { brandFacts, fmt, type TrackFacts } from "@/lib/brand-facts";
import { FULL_PAPERS, PAPERS_VISIBLE, getChapters, getExams, getSubjects } from "@/lib/data";
import { EXAMS, EXAM_LIST } from "@/lib/exams";
import { pageMetadata, siteJsonLd } from "@/lib/seo";
import { DATA_SOURCE, SITE } from "@/lib/site";
import { SUBJECT_STYLE } from "@/lib/subjects";

/** Brand first, then what students search for ("online JEE practice", "JEE Main PYQs"). */
const HOME_TITLE = `${SITE.name}: Free JEE Main PYQs & Chapter-wise Practice Online`;

export const metadata = {
  ...pageMetadata({ title: HOME_TITLE, description: SITE.description, path: "/" }),
  title: { absolute: HOME_TITLE },
};

export default async function HomePage() {
  const [subjects, chapters, facts, jeeExams] = await Promise.all([getSubjects(), getChapters(), brandFacts().catch(() => []), getExams("jee")]);
  const jee = facts.find((f) => f.track === "jee");
  // Only exams that have questions today are named in the hero (no JEE Advanced/NEET claims before they exist).
  const live = facts.flatMap((f) => (f.track === "jee" ? jeeExams.map((e) => EXAMS[e].name) : [f.name]));

  return (
    <>
      <JsonLd data={siteJsonLd()} />
      <Hero exams={live} neet={facts.some((f) => f.track === "neet")} />
      {jee && <Inside facts={jee} />}
      <Loop />
      <ExamsSection subjects={subjects} chapters={chapters} neet={facts.some((f) => f.track === "neet")} />
      <Modes />
      <Trust />
      <CommonQuestions facts={jee} />
      <ClosingCta />
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">{children}</p>;
}

function Hero({ exams, neet }: { exams: string[]; neet: boolean }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div aria-hidden className="dot-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pt-24 md:pb-28">
        <div>
          <p className="pixel-corners inline-flex items-center gap-2 bg-surface-2 px-3 py-1.5 font-pixel text-[0.7rem] uppercase tracking-widest text-fg-soft">
            <span aria-hidden className="size-1.5 bg-ok" /> {exams.length ? exams.join(" · ") : "JEE Main"} · Physics · Chemistry · Maths
          </p>
          {/* One H1 that says what the site is (read by search engines and screen readers); the display line stays the visual. */}
          <h1 className="mt-6">
            <span className="block max-w-md text-lg leading-snug font-medium text-fg-soft sm:text-xl">
              {SITE.name}: online JEE preparation with previous-year questions, chapter by chapter
            </span>{" "}
            <span className="mt-5 block text-[2.6rem] leading-[1.02] font-semibold sm:text-6xl lg:text-[4.25rem]">
              Practise.
              <br />
              Understand.
              <br />
              <span className="caret-block">Improve</span>
            </span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-fg-muted">
            Practise {neet ? "JEE and NEET" : "JEE Main"} previous-year questions chapter by chapter{FULL_PAPERS ? ", sit full papers in an exam-style CBT" : ""}, check
            every answer, and keep the mistakes worth revisiting in one place. Free to start.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/signup/" size="lg" pixel>
              {DATA_SOURCE === "api" ? "Start practising free" : "Try the demo"}
            </ButtonLink>
            {/* Papers stay hidden until they exist; until then the second action goes to real content. */}
            <ButtonLink href={PAPERS_VISIBLE ? "/jee/pyq/" : FULL_PAPERS ? "/tests/" : "/jee/"} size="lg" variant="secondary">
              {PAPERS_VISIBLE ? "See the papers" : FULL_PAPERS ? "Sit a full paper" : "Browse chapters"}
            </ButtonLink>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[240px] sm:max-w-[320px] md:max-w-[420px]">
          <Kitty animated className="relative z-10 w-full text-fg" />
          <div aria-hidden className="absolute inset-x-[8%] bottom-[2.5%] h-px bg-line-strong" />
        </div>
      </div>
    </section>
  );
}

/** Product loop illustrated with real components, not stock marketing art. */
function Loop() {
  return (
    <section aria-labelledby="loop-h" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <SectionLabel>How it works</SectionLabel>
      <h2 id="loop-h" className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">
        One loop, repeated a few hundred times.
      </h2>
      <ol className="mt-12 grid gap-6 md:grid-cols-3">
        <LoopStep n={1} title="Practise" body="Pick a chapter, a year, or a difficulty. Answer MCQs and numerical questions with a timer, scratchpad and calculator.">
          <div className="space-y-2 text-sm">
            <p className="text-fg-soft">
              <RichText value="Flux through one face of a cube with $q$ at its centre:" />
            </p>
            {[
              ["A", "$\\dfrac{q}{\\varepsilon_0}$", false],
              ["B", "$\\dfrac{q}{6\\varepsilon_0}$", true],
            ].map(([id, body, sel]) => (
              <div
                key={id as string}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-3 py-2",
                  sel ? "border-fg bg-surface-2" : "border-line",
                )}
              >
                <span className={cn("grid size-6 place-items-center rounded-sm text-xs font-semibold", sel ? "bg-fg text-bg" : "bg-surface-3")}>
                  {id as string}
                </span>
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
    </section>
  );
}

function LoopStep({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col rounded-lg border border-line bg-surface">
      <div aria-hidden className="pointer-events-none select-none border-b border-line p-5">{children}</div>
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

function Modes() {
  const modes = [
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
  return (
    <section aria-labelledby="modes-h" className="border-y border-line bg-surface/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>Modes</SectionLabel>
        <h2 id="modes-h" className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">
          Learn when you want to learn. Test when you need to know.
        </h2>
        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {modes.map((m) => (
            <div key={m.name}>
              <h3 className="text-xl font-semibold">{m.name}</h3>
              <p className="mt-1 text-sm text-fg-muted">{m.tag}</p>
              <ul className="mt-5 space-y-2.5 text-sm text-fg-soft">
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
    </section>
  );
}

function Trust() {
  // Only labels questions actually carry today (search engines and AI assistants repeat this list as features).
  // Add "human_reviewed" back once questions are reviewed by a person.
  const shown: VerificationStatus[] = ["official_key_checked", "ai_checked", "disputed"];
  return (
    <section aria-labelledby="trust-h" className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.2fr]">
      <div>
        <SectionLabel>Trust</SectionLabel>
        <h2 id="trust-h" className="mt-3 text-3xl font-semibold sm:text-4xl">
          Every answer says how it was checked.
        </h2>
        <p className="mt-4 max-w-md leading-relaxed text-fg-muted">
          Solutions can be wrong, including AI-assisted ones. Each question carries a label that tells you how far to trust it, and you
          can report anything that looks off.
        </p>
      </div>
      <dl className="divide-y divide-line rounded-lg border border-line">
        {shown.map((s) => {
          const c = VERIFICATION_COPY[s];
          return (
            <div key={s} className="grid gap-1 p-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
              <dt
                className={cn(
                  "font-medium",
                  c.tone === "good" && "text-ok",
                  c.tone === "warn" && "text-review",
                )}
              >
                {c.label}
              </dt>
              <dd className="text-sm leading-relaxed text-fg-muted">{c.help}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="relative flex flex-col items-start gap-8 overflow-hidden rounded-lg border border-line bg-surface p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-semibold">Start with one chapter.</h2>
          <p className="mt-2 text-fg-muted">Ten questions a day adds up quicker than you&rsquo;d think.</p>
        </div>
        <div className="flex items-center gap-6">
          <ButtonLink href="/signup/" size="lg" pixel>
            {DATA_SOURCE === "api" ? "Start practising free" : "Try the demo"}
          </ButtonLink>
          <Kitty pose="sleep" className="hidden h-20 w-auto text-fg-subtle sm:block" />
        </div>
      </div>
    </section>
  );
}

function ExamsSection({ subjects, chapters, neet }: { subjects: Subject[]; chapters: Chapter[]; neet: boolean }) {
  return (
    <section aria-labelledby="exams-h" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <SectionLabel>Exams</SectionLabel>
      <h2 id="exams-h" className="mt-3 max-w-2xl text-3xl font-semibold sm:text-4xl">
        {neet ? "JEE and NEET" : "JEE"}, organised the way you revise.
      </h2>
      <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
        {EXAM_LIST.map((e) => {
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
                      <Link href={`/${e.track}/${s.id}/`} className={cn("hover:underline", SUBJECT_STYLE[s.id].text)}>
                        {s.name}
                      </Link>
                    ) : (
                      <span className={SUBJECT_STYLE[s.id].text}>{s.name}</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-sm">
                {n > 0 ? (
                  <Link href={`/${e.track}/`} className="text-fg-soft hover:text-fg">
                    {n} chapters <span aria-hidden>→</span>
                  </Link>
                ) : (
                  <span className="text-fg-muted">Coming soon</span>
                )}
                {!PAPERS_VISIBLE && FULL_PAPERS && n > 0 ? (
                  <Link href={`/tests/?exam=${e.id}`} className="text-fg-soft hover:text-fg">
                    Full papers in CBT <span aria-hidden>→</span>
                  </Link>
                ) : null}
                {PAPERS_VISIBLE && n > 0 ? (
                  <>
                    <Link href={`/${e.track}/pyq/`} className="text-fg-soft hover:text-fg">
                      Papers <span aria-hidden>→</span>
                    </Link>
                    <Link href={`/tests/?exam=${e.id}`} className="text-fg-soft hover:text-fg">
                      Mock tests <span aria-hidden>→</span>
                    </Link>
                  </>
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
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionLabel>What&rsquo;s inside</SectionLabel>
        <h2 id="inside-h" className="mt-3 max-w-3xl text-3xl font-semibold sm:text-4xl">
          {fmt(facts.questions)} JEE Main questions, sorted by chapter.
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-fg-muted">
          Most are previous-year questions from official JEE Main papers published by the National Testing Agency, shown as they were set, with their answers; a
          smaller set are practice questions written for the site and labelled as such. Open any chapter to see its questions and how often it has been asked, then
          practise it free.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {subjects.map((s) => {
            const all = facts.chapters.filter((c) => c.subject === s.id);
            const top = [...all].sort((a, b) => b.questions - a.questions).slice(0, 4);
            const style = SUBJECT_STYLE[s.id as keyof typeof SUBJECT_STYLE];
            return (
              <div key={s.id} className="rounded-xl border border-line bg-surface p-6">
                <h3 className={cn("text-xl font-semibold", style?.text)}>
                  <Link href={`/${facts.track}/${s.id}/`} className="underline-offset-4 hover:underline">
                    JEE Main {s.name}
                  </Link>
                </h3>
                <p className="mt-1 text-sm tabular-nums text-fg-muted">
                  {fmt(s.questions)} questions · {all.length} chapters
                </p>
                <p className="mt-5 text-xs text-fg-subtle">Most-asked chapters</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {top.map((c) => (
                    <li key={c.slug} className="flex items-baseline justify-between gap-3">
                      <Link href={`/${facts.track}/${c.subject}/${c.slug}/`} className="text-fg-soft underline-offset-4 hover:text-fg hover:underline">
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
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href={`/${facts.track}/`} className="text-fg-soft hover:text-fg">
            All {facts.chapters.length} chapters <span aria-hidden>→</span>
          </Link>
          <Link href={`/${facts.track}/chapter-weightage/`} className="text-fg-soft hover:text-fg">
            JEE Main chapter-wise weightage <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Questions students ask before they sign up, answered in visible text only: no FAQPage markup (CLAUDE.md §15). Every
 * answer must stay true; counts come from the API.
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
    <section aria-labelledby="faq-h" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <SectionLabel>Questions</SectionLabel>
      <h2 id="faq-h" className="mt-3 text-3xl font-semibold sm:text-4xl">
        Before you start
      </h2>
      <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2 [&_a]:text-fg [&_a]:underline [&_a]:underline-offset-2">
        {items.map((i) => (
          <div key={i.q}>
            <dt className="font-semibold">{i.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-fg-muted">{i.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

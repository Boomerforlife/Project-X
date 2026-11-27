import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { OpenPlanButton } from "@/components/site/OpenPlanButton";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { buttonClass } from "@/components/ui/Button";
import { COPY } from "@/lib/copy";
import { routes } from "@/lib/routes";
import { pageMetadata } from "@/lib/seo";

// Indexed: the page explains how the feature actually works (no thin page). The plan itself is private and lives at /plan/.
export const metadata = pageMetadata({
  title: "JEE Main study plan: a diagnostic and a day-by-day practice plan",
  description:
    "How the JEE Main study plan works: a short timed diagnostic on the chapters you have studied, a report on where you are weak, and a day-by-day practice plan that updates as you answer. What is free and what is part of Tabby Plus.",
  path: "/study-plans/",
});

const STEPS = [
  {
    n: "1",
    title: "A diagnostic, not a mock",
    body: "You choose the chapters you have actually studied and a length: 15, 30 or 45 questions. It mixes Easy, Medium and Hard (we aim for about 30% Easy, 50% Medium and 20% Hard; if a level runs short, the gap goes to the nearest level and the report says so). It is timed, with no hints, and you can stop and come back.",
  },
  {
    n: "2",
    title: "A report you can check",
    body: "Each chapter is marked Needs work, Getting there or Strong, with the answers behind the judgement. A missed easy question counts for more than a missed hard one. There is no predicted rank or score.",
  },
  {
    n: "3",
    title: "A plan made of real practice",
    body: "You pick the minutes per day and the length. Each day lists practice sessions in Learning mode, specific problems from the problem library, mistakes to redo and timed drills, sized to the time you have. Chapters you are weak in come back on later days.",
  },
  {
    n: "4",
    title: "It adjusts as you go",
    body: "Every session you finish updates the rest of the plan. Checkpoint tests on day 7 and day 14 re-weight what comes next, and you can take a new diagnostic whenever you want a fresh picture.",
  },
] as const;

const DAY_ITEMS = [
  ["Practise a chapter", "Questions in Learning mode, with the solution after each answer."],
  ["Solve problems", "Specific problems picked from the problem library for a chapter."],
  ["Redo your mistakes", "Questions you got wrong earlier, from your mistake notebook."],
  ["Timed drill", "A short timed set on a chapter where you were right but slow."],
  ["Checkpoint test", "A timed mixed set that re-weights the rest of the plan."],
] as const;

export default function StudyPlansPage() {
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: COPY.studyPlans, path: "/study-plans/" },
        ]}
        eyebrow={COPY.studyPlans}
        title="JEE Main study plan"
        lede="Find out where to focus, then follow a plan built from your own answers."
      />
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.n} className="surface-flat p-6">
              <span className="font-pixel text-xs text-fg-muted">STEP {s.n}</span>
              <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-fg-muted">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-14 grid gap-10 md:grid-cols-2 md:gap-12">
          <section aria-labelledby="day-h">
            <h2 id="day-h" className="text-2xl font-semibold">What a day in the plan looks like</h2>
            <p className="mt-3 text-fg-muted">A day is a short list of tasks. Each one opens the normal practice screen, so you work the way you already do.</p>
            <ul className="mt-5 divide-y divide-line rounded-lg border border-line">
              {DAY_ITEMS.map(([t, d]) => (
                <li key={t} className="px-5 py-4">
                  <p className="font-medium">{t}</p>
                  <p className="mt-1 text-sm text-fg-muted">{d}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="free-h">
            <h2 id="free-h" className="text-2xl font-semibold">What is free and what is Tabby Plus</h2>
            <dl className="mt-5 space-y-5 text-fg-muted">
              <div>
                <dt className="font-medium text-fg">Free account</dt>
                <dd className="mt-1">
                  The diagnostic, its summary and a basic plan: up to one week, up to 60 minutes a day, built from the free problems. Practice itself is always
                  free.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-fg">Tabby Plus</dt>
                <dd className="mt-1">
                  The full chapter-by-chapter breakdown in the report, plans up to two weeks and up to 120 minutes a day, and every problem in the library.{" "}
                  <Link href="/pricing/" className="text-fg underline underline-offset-2">
                    See what each plan includes
                  </Link>
                  .
                </dd>
              </div>
              <div>
                <dt className="font-medium text-fg">What it does not do</dt>
                <dd className="mt-1">
                  It does not predict your rank or percentile, and it only uses what you have answered on {COPY.pyqs} and practice questions here. The more you
                  answer, the sharper it gets.
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-6 border-t border-line pt-10">
          <TabbyMascot state="curious" className="h-14 text-fg-subtle" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Ready? The diagnostic takes 15 to 45 questions and you can pause it.</p>
            <p className="text-sm text-fg-muted">You need a free account so the plan can follow your answers.</p>
          </div>
          <OpenPlanButton />
        </div>

        <nav aria-label="Related" className="mt-10 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Link href={routes.practice("jee")} className={buttonClass({ variant: "ghost", size: "md" })}>
            Practice by chapter
          </Link>
          <Link href={routes.pyq("jee")} className={buttonClass({ variant: "ghost", size: "md" })}>
            {COPY.pyqs}
          </Link>
          <Link href="/jee/chapter-weightage/" className={buttonClass({ variant: "ghost", size: "md" })}>
            Chapter-wise weightage
          </Link>
        </nav>
      </div>
    </>
  );
}

import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { pageMetadata } from "@/lib/seo";

// Not indexed until the feature is live on the production API (no thin pages).
export const metadata = pageMetadata({
  title: "JEE Main study plans",
  description: "Take a short diagnostic across the chapters you have studied and get a day-by-day JEE Main practice plan that adjusts as you go.",
  path: "/study-plans/",
  noindex: true,
});

const STEPS = [
  {
    n: "1",
    title: "A diagnostic, not a mock",
    body: "15, 30 or 45 questions from the chapters you have actually studied, mixing Easy, Medium and Hard. Timed, no hints. It's free.",
  },
  {
    n: "2",
    title: "A report you can check",
    body: "Each chapter is marked Needs work, Getting there or Strong, with the answers behind it. A missed easy question counts for more than a missed hard one. No predicted rank or score.",
  },
  {
    n: "3",
    title: "A plan made of real practice",
    body: "Each day lists practice sessions, specific problems from the library, mistakes to redo and timed drills, sized to the time you have. Weak chapters come back on spaced days.",
  },
  {
    n: "4",
    title: "It adjusts as you go",
    body: "Every session you finish updates the rest of the plan. Checkpoint tests on day 7 and day 14 re-weight what comes next.",
  },
] as const;

export default function StudyPlansPage() {
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Study plans", path: "/study-plans/" },
        ]}
        eyebrow="Plans"
        title="Study plans"
        lede="Find out where to focus, then follow a plan built from your own answers."
      />
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <ol className="grid gap-4 md:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.n} className="surface-flat p-6">
              <span className="font-pixel text-xs text-fg-muted">STEP {s.n}</span>
              <h2 className="mt-2 text-xl font-semibold">{s.title}</h2>
              <p className="mt-2 text-fg-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <TabbyMascot state="curious" className="h-14 text-fg-subtle" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">The diagnostic and its summary are free. The day-by-day plan is part of Tabby Plus.</p>
            <p className="text-sm text-fg-muted">Practice itself stays free.</p>
          </div>
          <ButtonLink href="/plan/" size="lg" pixel>
            Take the diagnostic
          </ButtonLink>
        </div>
      </div>
    </>
  );
}

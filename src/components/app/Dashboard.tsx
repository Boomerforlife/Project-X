"use client";

import { AdSlot } from "@/components/ads/AdSlot";
import { PremiumUpgradePrompt } from "@/components/billing/PremiumUpgradePrompt";
import Link from "next/link";
import { DemoBadge } from "@/components/app/ModeBadge";
import { FirstSteps, NextActionCard, NotebookLinks, SubjectsSection, ThisWeek, TodayPanel } from "@/components/app/home/HomeSections";
import { useQuickStart } from "@/components/app/home/useQuickStart";
import { useTodaysPlanTask } from "@/components/app/home/useTodaysPlanTask";
import { DashboardSkeleton } from "@/components/ui/Primitives";
import { isAnswered } from "@/lib/demo/scoring";
import { STREAK_MIN_QUESTIONS, recommendation, streaks, today, totals } from "@/lib/demo/progress";
import { attemptsList, inProgress } from "@/lib/demo/store";
import type { Attempt, DemoState, DemoUser } from "@/lib/demo/types";
import { EXAMS } from "@/lib/exams";
import { chooseNextAction, planTaskLabel } from "@/lib/home/next-action";
import { mistakesDue, openMistakes } from "@/lib/home/mistakes-due";
import { routes } from "@/lib/routes";
import { DemoGate } from "./DemoGate";

/**
 * Home (/dashboard/). Where am I, what next, how am I doing. Five sections: Today, Next action, Notebook, This week,
 * Subjects. XP, challenges, achievements, the heatmap and attempt history live on /progress/.
 */
export function DashboardPage() {
  return <DemoGate fallback={<DashboardSkeleton />}>{(s) => <Home s={s} user={s.user} />}</DemoGate>;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function progressOf(a: Attempt) {
  return a.questionIds.filter((q) => (a.mode === "learning" ? a.responses[q]?.checked : isAnswered(a.responses[q]?.answer))).length;
}

function Home({ s, user }: { s: DemoState; user: DemoUser }) {
  const exam = EXAMS[user.exam];
  const track = exam.track;
  const { starting, start } = useQuickStart(user.exam);
  const st = streaks(s);
  const td = today(s);
  const goal = user.dailyGoal;
  const left = Math.max(0, goal - td.answered);

  const unfinished = inProgress(s);
  const resume = unfinished.find((a) => a.exam === user.exam) ?? unfinished[0] ?? null;
  const serverAnswered = s.server?.chapters.some((c) => c.answered > 0) ?? false;
  const firstRun = totals(s).answered === 0 && attemptsList(s).length === 0 && !serverAnswered;

  // Today's study-plan task loads in the background; Home never waits for it.
  const planTask = useTodaysPlanTask(!firstRun && !resume, user.exam);
  const open = openMistakes(s.mistakes);
  const due = mistakesDue(s.mistakes, new Date());
  const rec = recommendation(s);
  const action = chooseNextAction({
    resume: resume ? { id: resume.id, mode: resume.mode, title: resume.title, done: progressOf(resume), total: resume.questionIds.length } : null,
    plan: planTask ? { label: planTaskLabel(planTask) } : null,
    mistakesDue: due.length,
    weak: rec?.kind === "weak" ? { subject: rec.subject, chapter: rec.chapter, accuracy: rec.accuracy ?? 0, answered: rec.answered } : null,
    firstRun,
  });

  const summary =
    td.answered >= goal
      ? `Today's goal is done. Anything more is a bonus.`
      : st.todayDone
        ? `Your streak is safe for today. ${left} more question${left === 1 ? "" : "s"} to reach your goal.`
        : st.current > 0
          ? STREAK_MIN_QUESTIONS === 1
            ? `Answer a question today to keep your ${st.current}-day streak going.`
            : `${Math.max(0, STREAK_MIN_QUESTIONS - td.answered)} more question${STREAK_MIN_QUESTIONS - td.answered === 1 ? "" : "s"} keeps your ${st.current}-day streak going.`
          : "Ten focused questions is a good way to start the day.";
  const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section aria-labelledby="today-h" className="relative pb-10 pt-10 sm:pt-14">
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-80 [mask-image:radial-gradient(ellipse_at_20%_0%,black,transparent_70%)]" />
        <div className="relative grid gap-10 lg:grid-cols-[1.45fr_1fr] lg:gap-14">
          <div className="min-w-0">
            <p className="eyebrow flex flex-wrap items-center gap-2">
              {dateLabel} <span aria-hidden>·</span> Preparing for {exam.name}{" "}
              <Link href={routes.account} className="normal-case underline underline-offset-4 hover:text-fg">
                change
              </Link>
              <DemoBadge />
            </p>
            <h1 id="today-h" className="mt-3 text-4xl font-semibold leading-[1.05] sm:text-5xl">
              {greeting()}, {user.name}.
            </h1>
            <p className="mt-4 text-xl font-medium tabular-nums">
              {td.answered} of {goal} questions today <span aria-hidden>·</span> <span className="whitespace-nowrap">{st.current > 0 ? `${st.current}-day streak` : "no streak yet"}</span>
            </p>
            <p className="mt-2 max-w-xl text-lg leading-relaxed text-fg-muted">{summary}</p>

            <NextActionCard action={action} track={track} starting={starting} onStart={start} />
          </div>
          <TodayPanel s={s} user={user} />
        </div>
      </section>

      {firstRun ? (
        <FirstSteps track={track} starting={starting} onStart={start} />
      ) : (
        <>
          <NotebookLinks open={open.length} due={due.length} review={Object.keys(s.review).length} bookmarks={Object.keys(s.bookmarks).length} />
          <ThisWeek s={s} user={user} />
          <SubjectsSection s={s} user={user} track={track} />
          {/* Below the fold and quiet: the upgrade card shows at most weekly, and never for Plus. */}
          <div className="border-t border-line py-10 empty:hidden">
            <PremiumUpgradePrompt context="dashboard" />
          </div>
          {/* Free tier only, nothing renders for Plus. */}
          <AdSlot placement="dashboard-bottom" />
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { Bar, Ring } from "@/components/ui/Primitives";
import { cn } from "@/lib/cn";
import { catalog } from "@/lib/data/catalog";
import { dayKey, daysAgo, formatDuration } from "@/lib/demo/dates";
import { STREAK_MIN_QUESTIONS, chapterStats, streaks, subjectStats, today, weeklyTrend } from "@/lib/demo/progress";
import type { DemoState, DemoUser } from "@/lib/demo/types";
import { EXAMS, type Track } from "@/lib/exams";
import type { NextAction } from "@/lib/home/next-action";
import { routes } from "@/lib/routes";
import { SUBJECT_STYLE } from "@/lib/subjects";

const linkRow = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-fg-soft transition-colors hover:bg-surface-2 hover:text-fg";

/* ───────── 1 · Today ───────── */

/** The goal ring and the last seven days. The streak counts real practice only. */
export function TodayPanel({ s, user }: { s: DemoState; user: DemoUser }) {
  const st = streaks(s);
  const td = today(s);
  const pct = Math.min(1, td.answered / user.dailyGoal);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = daysAgo(6 - i);
    const a = s.activity[dayKey(d)];
    return { label: d.toLocaleDateString("en-IN", { weekday: "narrow" }), n: a?.answered ?? 0, today: i === 6 };
  });
  return (
    <aside aria-label="Today" className="relative self-end pt-16 lg:pt-20">
      {/* The kitty quietly sits on the panel and gives one small hop once today's streak or goal is reached. */}
      <TabbyMascot state={td.answered >= STREAK_MIN_QUESTIONS || pct >= 1 ? "success" : "idle"} cosmetic={user.cosmetic} className="absolute right-8 top-0 h-[4.6rem] w-auto text-fg lg:h-[5.6rem]" />
      <div className="surface relative p-6">
        <div className="flex items-center gap-6">
          <Ring value={pct} size={124} stroke={9} colorVar={pct >= 1 ? "var(--ok)" : "var(--fg)"} label={`${td.answered} of ${user.dailyGoal} questions today`}>
            <div className="text-center">
              <p className="numeral text-3xl">{td.answered}</p>
              <p className="text-xs text-fg-muted">of {user.dailyGoal}</p>
            </div>
          </Ring>
          <div>
            <p className="eyebrow">Daily goal</p>
            <p className="mt-1 text-lg font-semibold">{pct >= 1 ? "Done for today" : `${user.dailyGoal - td.answered} to go`}</p>
            <p className="mt-1 text-sm text-fg-muted">{formatDuration(td.seconds)} studied today</p>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <div className="flex items-baseline justify-between">
            <p className="flex items-center gap-2 font-semibold">
              <PixelIcon name="flame" className={cn("size-5", st.current ? "text-review" : "text-fg-subtle")} />
              <span className="numeral text-xl">{st.current}</span> day streak
            </p>
            <p className="text-sm text-fg-muted">Best {st.longest}</p>
          </div>
          <ol className="mt-4 grid grid-cols-7 gap-2" aria-label="Last 7 days">
            {week.map((d, i) => {
              const hit = d.n >= STREAK_MIN_QUESTIONS;
              return (
                <li key={i} className="flex flex-col items-center gap-1.5">
                  <span
                    aria-label={`${d.n} questions${hit ? ", counted" : ""}`}
                    className={cn(
                      "grid aspect-square w-full max-w-9 place-items-center",
                      hit ? "pixel-corners bg-review text-bg" : d.today ? "rounded-md border border-dashed border-line-strong" : "rounded-md bg-surface-3",
                    )}
                  >
                    {hit && <PixelIcon name="check" className="size-3.5" />}
                  </span>
                  <span className={cn("text-xs", d.today ? "font-semibold text-fg" : "text-fg-muted")}>{d.label}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-xs text-fg-muted">{STREAK_MIN_QUESTIONS === 1 ? "A day counts once you answer a question." : `A day counts once you answer ${STREAK_MIN_QUESTIONS} questions.`}</p>
        </div>
      </div>
    </aside>
  );
}

/* ───────── 2 · Next action ───────── */

export function NextActionCard({ action, track, starting, onStart }: { action: NextAction; track: Track; starting: boolean; onStart: () => void }) {
  let icon: React.ReactNode = <Icon name="zap" className="size-5" />;
  let plain = false;
  let kicker = "";
  let title = "";
  let detail = "";
  let cta: React.ReactNode = null;

  switch (action.kind) {
    case "resume": {
      const cbt = action.mode === "cbt";
      plain = true;
      icon = (
        <Ring value={action.total ? action.done / action.total : 0} size={56} stroke={5} label={`${action.done} of ${action.total} done`}>
          <Icon name={cbt ? "monitor" : "play"} className="size-4" />
        </Ring>
      );
      kicker = "Continue where you left off";
      title = action.title;
      detail = `${cbt ? "Exam-style CBT" : action.mode === "test" ? "Timed test" : "Learning mode"} · ${action.done} of ${action.total} done`;
      cta = (
        <ButtonLink size="lg" pixel href={cbt ? routes.cbt(action.id) : routes.session(action.id)} className="flex-1 sm:flex-none">
          Continue <Icon name="arrowRight" className="size-4" />
        </ButtonLink>
      );
      break;
    }
    case "plan":
      icon = <Icon name="target" className="size-5" />;
      kicker = "Today in your study plan";
      title = action.label;
      detail = "Open your plan to start today's task.";
      cta = (
        <ButtonLink size="lg" pixel href={routes.studyPlan} className="flex-1 sm:flex-none">
          Open study plan <Icon name="arrowRight" className="size-4" />
        </ButtonLink>
      );
      break;
    case "mistakes":
      icon = <Icon name="rotate" className="size-5" />;
      kicker = "Due for a retry";
      title = `${action.count} mistake${action.count === 1 ? "" : "s"} to reattempt`;
      detail = "Questions you got wrong a while ago. Getting them right clears them from your notebook.";
      cta = (
        <ButtonLink size="lg" pixel href={routes.mistakes} className="flex-1 sm:flex-none">
          Reattempt <Icon name="arrowRight" className="size-4" />
        </ButtonLink>
      );
      break;
    case "weak": {
      const ch = catalog.chapter(action.subject as Parameters<typeof catalog.chapter>[0], action.chapter)?.name ?? action.chapter;
      const st = SUBJECT_STYLE[action.subject as keyof typeof SUBJECT_STYLE];
      plain = true;
      icon = (
        <span aria-hidden className={cn("grid size-14 place-items-center rounded-lg bg-surface-2 font-display text-xl", st?.text)}>
          {st?.glyph}
        </span>
      );
      kicker = "Your weakest chapter";
      title = ch;
      detail = `${Math.round(action.accuracy * 100)}% on your last ${action.answered} here`;
      cta = (
        <ButtonLink size="lg" pixel href={routes.chapterPractise(track, action.subject, action.chapter)} className="flex-1 sm:flex-none">
          Practise <Icon name="arrowRight" className="size-4" />
        </ButtonLink>
      );
      break;
    }
    case "start":
      kicker = action.firstRun ? "Your first step" : "Quick practice";
      title = action.firstRun ? "Start with 10 questions" : "10 mixed questions";
      detail = "Learning mode · instant feedback · ~15 min";
      cta = (
        <Button size="lg" pixel disabled={starting} onClick={onStart} className="flex-1 sm:flex-none">
          {starting ? "Starting…" : action.firstRun ? "Try 10 questions" : "Start practising"} <Icon name="arrowRight" className="size-4" />
        </Button>
      );
      break;
  }

  return (
    <div className="mt-8">
      <div className="surface flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className={cn("shrink-0", !plain && "grid size-14 place-items-center rounded-full bg-fg text-bg")}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg-muted">{kicker}</p>
          <p className="mt-0.5 truncate text-lg font-semibold">{title}</p>
          <p className="text-sm text-fg-muted">{detail}</p>
        </div>
        <div className="flex gap-2">{cta}</div>
      </div>
      {action.kind !== "plan" && (
        <p className="mt-2">
          <Link href={routes.studyPlan} className={linkRow}>
            <Icon name="target" className="size-4" /> Study plan
          </Link>
        </p>
      )}
    </div>
  );
}

/* ───────── First run ───────── */

export function FirstSteps({ track, starting, onStart }: { track: Track; starting: boolean; onStart: () => void }) {
  const steps = [
    { n: 1, title: "Try 10 questions", sub: "A quick Learning session with instant feedback.", icon: "zap" as const, href: null },
    { n: 2, title: "Build a study plan", sub: "A short diagnostic, then a plan around your weak spots.", icon: "target" as const, href: routes.studyPlan },
    { n: 3, title: "Attempt a PYQ paper", sub: "A real previous-year paper, in the exam interface.", icon: "monitor" as const, href: routes.pyq(track) },
  ];
  return (
    <section aria-labelledby="first-h" className="border-t border-line py-12">
      <div className="flex items-center gap-4">
        <TabbyMascot state="idle" animated={false} className="h-12 text-fg-subtle" />
        <h2 id="first-h" className="text-2xl font-semibold">
          Three ways to begin
        </h2>
      </div>
      <ol className="mt-6 grid gap-3 md:grid-cols-3">
        {steps.map((x) => {
          const inner = (
            <>
              <span className="grid size-10 place-items-center rounded-lg bg-surface-2 text-fg-muted">
                <Icon name={x.icon} className="size-4" />
              </span>
              <span className="mt-4 block font-semibold">
                <span className="text-fg-muted">{x.n}. </span>
                {x.title}
              </span>
              <span className="mt-1 block text-sm text-fg-muted">{x.sub}</span>
            </>
          );
          const cls = "surface block h-full w-full p-5 text-left transition-colors hover:border-line-strong";
          return (
            <li key={x.n}>
              {x.href ? (
                <Link href={x.href} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button type="button" disabled={starting} onClick={onStart} className={cn(cls, "disabled:opacity-60")}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ───────── 3 · Notebook ───────── */

export function NotebookLinks({ open, due, review, bookmarks }: { open: number; due: number; review: number; bookmarks: number }) {
  const card = "surface flex min-h-11 items-center justify-between gap-3 p-4 transition-colors hover:border-line-strong";
  return (
    <section aria-labelledby="nb-h" className="border-t border-line py-10">
      <h2 id="nb-h" className="text-2xl font-semibold">
        Notebook
      </h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <Link href={routes.mistakes} className={card}>
            <span>
              <span className="block font-medium">{open > 0 ? `Reattempt ${open} mistake${open === 1 ? "" : "s"}` : "Mistake notebook"}</span>
              <span className="block text-sm text-fg-muted">{open === 0 ? "No open mistakes" : due > 0 ? `${due} due for a retry` : "None due for a retry yet"}</span>
            </span>
            <Icon name="chevronRight" className="size-4 text-fg-subtle" />
          </Link>
        </li>
        <li>
          <Link href={routes.review} className={card}>
            <span>
              <span className="block font-medium">Review list ({review})</span>
              <span className="block text-sm text-fg-muted">Questions you marked for later</span>
            </span>
            <Icon name="chevronRight" className="size-4 text-fg-subtle" />
          </Link>
        </li>
        <li>
          <Link href={routes.bookmarks} className={card}>
            <span>
              <span className="block font-medium">Bookmarks ({bookmarks})</span>
              <span className="block text-sm text-fg-muted">Questions you saved</span>
            </span>
            <Icon name="chevronRight" className="size-4 text-fg-subtle" />
          </Link>
        </li>
      </ul>
    </section>
  );
}

/* ───────── 4 · This week ───────── */

export function ThisWeek({ s, user }: { s: DemoState; user: DemoUser }) {
  const trend = weeklyTrend(s, 2);
  const prev = trend[0]!;
  const cur = trend[1]!;
  const pct = (a: number | null) => (a === null ? "—" : `${Math.round(a * 100)}%`);
  const practised = chapterStats(s).filter((c) => c.answered > 0).length;
  const total = catalog.chapters({ exam: user.exam }).length;
  const stats = [
    { label: "Questions answered", value: cur.answered.toLocaleString("en-IN"), sub: prev.answered ? `${prev.answered.toLocaleString("en-IN")} last week` : "Last week: —" },
    { label: "Accuracy", value: pct(cur.accuracy), sub: `Last week: ${pct(prev.accuracy)}` },
    { label: "Chapters practised", value: String(practised), sub: total > 0 ? `of ${total} in ${EXAMS[user.exam].name}` : "All time" },
  ];
  return (
    <section aria-labelledby="wk-h" className="border-t border-line py-10">
      <h2 id="wk-h" className="text-2xl font-semibold">
        This week
      </h2>
      <dl className="surface mt-5 grid grid-cols-3">
        {stats.map((x, i) => (
          <div key={x.label} className={cn("p-4 sm:p-6", i > 0 && "border-l border-line")}>
            <dt className="text-sm text-fg-muted">{x.label}</dt>
            <dd className="numeral mt-2 text-2xl sm:text-3xl">{x.value}</dd>
            <dd className="mt-1 text-xs text-fg-muted sm:text-sm">{x.sub}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ───────── 5 · Subjects ───────── */

export function SubjectsSection({ s, user, track }: { s: DemoState; user: DemoUser; track: Track }) {
  const stats = subjectStats(s);
  const chapters = chapterStats(s);
  return (
    <section aria-labelledby="sub-h" className="border-t border-line py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="sub-h" className="text-2xl font-semibold">
          Subjects
        </h2>
        <Link href={routes.progress} className="inline-flex min-h-11 items-center gap-1 text-sm text-fg-muted hover:text-fg">
          Full progress <Icon name="arrowRight" className="size-3.5" />
        </Link>
      </div>
      <ul className="surface mt-5 divide-y divide-line">
        {stats.map((x) => {
          const sub = catalog.subject(x.subject);
          if (!sub) return null;
          const style = SUBJECT_STYLE[x.subject];
          const done = new Set(chapters.filter((c) => c.subject === x.subject && c.answered > 0).map((c) => c.chapter)).size;
          const total = catalog.chapters({ exam: user.exam, subject: x.subject }).length;
          return (
            <li key={x.subject}>
              <Link href={routes.subject(track, x.subject)} className="grid min-h-11 grid-cols-[auto_1fr_auto] items-center gap-4 p-4 transition-colors hover:bg-surface-2 sm:px-6">
                <span aria-hidden className={cn("grid size-9 place-items-center rounded-lg bg-surface-2 font-display", style.text)}>
                  {style.glyph}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{sub.name}</span>
                    <span className="text-sm tabular-nums text-fg-muted">
                      {x.accuracy === null ? (
                        "Not practised yet"
                      ) : (
                        <>
                          <span className="font-medium text-fg">{Math.round(x.accuracy * 100)}%</span> accuracy · {done}
                          {total > 0 ? ` of ${total}` : ""} chapters
                        </>
                      )}
                    </span>
                  </div>
                  {x.accuracy !== null && <Bar value={x.accuracy} className="mt-2" colorClass={style.bg} label={`${sub.name} accuracy`} />}
                </div>
                <Icon name="chevronRight" className="size-4 text-fg-subtle" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

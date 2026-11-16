"use client";

import { PremiumUpgradePrompt } from "@/components/billing/PremiumUpgradePrompt";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Kitty } from "@/components/brand/Kitty";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { Heatmap, TrendBars } from "@/components/charts/Charts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { Bar, DashboardSkeleton, PixelBar, Ring } from "@/components/ui/Primitives";
import { DemoBadge } from "@/components/app/ModeBadge";
import { cn } from "@/lib/cn";
import { catalog } from "@/lib/data/catalog";
import { dayKey, daysAgo, formatDuration, relativeDay } from "@/lib/demo/dates";
import { quickPractice } from "@/lib/demo/launch";
import {
  COSMETICS,
  STREAK_MIN_QUESTIONS,
  achievements,
  challenges,
  leaderboard,
  level,
  recommendation,
  scoredAttempts,
  streaks,
  subjectStats,
  thisWeek,
  today,
  totals,
  weeklyTrend,
  PAPERS_ENABLED,
  LEADERBOARD_ENABLED,
} from "@/lib/demo/progress";
import { isAnswered } from "@/lib/demo/scoring";
import { inProgress } from "@/lib/demo/store";
import type { Attempt, DemoState, DemoUser } from "@/lib/demo/types";
import { EXAMS } from "@/lib/exams";
import { SUBJECT_STYLE } from "@/lib/subjects";
import { DemoGate } from "./DemoGate";
import { toast } from "@/components/ui/Toast";
import { DATA_SOURCE } from "@/lib/site";

export function DashboardPage() {
  return <DemoGate fallback={<DashboardSkeleton />}>{(s) => <Dashboard s={s} user={s.user} />}</DemoGate>;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function progressOf(a: Attempt) {
  return a.questionIds.filter((q) => (a.mode === "learning" ? a.responses[q]?.checked : isAnswered(a.responses[q]?.answer))).length;
}

function Dashboard({ s, user }: { s: DemoState; user: DemoUser }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const exam = EXAMS[user.exam];
  const st = streaks(s);
  const td = today(s);
  const resume = inProgress(s).find((a) => a.exam === user.exam) ?? inProgress(s)[0];
  const rec = recommendation(s);
  const recChapter = rec ? catalog.chapter(rec.subject, rec.chapter) : null;
  const goal = user.dailyGoal;
  const left = Math.max(0, goal - td.answered);

  const start = async (pending: Promise<string | null> | string | null) => {
    setStarting(true);
    try {
      const id = await pending;
      if (id) router.push(`/practice/session/?id=${id}`);
      else {
        setStarting(false);
        toast("You've solved everything there. Open a chapter to include solved questions.", { icon: "info", tone: "warn" });
      }
    } catch {
      setStarting(false);
      toast("Couldn't start the session. Please try again.", { icon: "alert", tone: "warn" });
    }
  };

  const summary =
    td.answered >= goal
      ? `Today's goal is done — ${td.answered} questions. Anything more is a bonus.`
      : st.todayDone
        ? `Your streak is safe for today. ${left} more question${left === 1 ? "" : "s"} to reach your goal.`
        : st.current > 0
          ? STREAK_MIN_QUESTIONS === 1
            ? `Answer a question today to keep your ${st.current}-day streak going.`
            : `${STREAK_MIN_QUESTIONS - td.answered} question${STREAK_MIN_QUESTIONS - td.answered === 1 ? "" : "s"} keep${STREAK_MIN_QUESTIONS - td.answered === 1 ? "s" : ""} your ${st.current}-day streak going.`
          : "Ten focused questions is a good way to start the day.";

  const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* ─────────────── 1 · Today ─────────────── */}
      <section aria-labelledby="today-h" className="relative pb-14 pt-10 sm:pt-14">
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-80 [mask-image:radial-gradient(ellipse_at_20%_0%,black,transparent_70%)]" />
        <div className="relative grid gap-10 lg:grid-cols-[1.45fr_1fr] lg:gap-14">
          <div className="min-w-0">
            <p className="eyebrow flex flex-wrap items-center gap-2">
              {dateLabel} <span aria-hidden>·</span> {exam.name} <DemoBadge />
            </p>
            <h1 id="today-h" className="mt-3 text-4xl font-semibold leading-[1.05] sm:text-5xl">
              {greeting()}, {user.name}.
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-fg-muted">{summary}</p>

            {/* The one thing to do next */}
            <div className="surface mt-8 flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
              {resume ? (
                <>
                  <Ring value={progressOf(resume) / resume.questionIds.length} size={56} stroke={5} label={`${progressOf(resume)} of ${resume.questionIds.length} done`}>
                    <Icon name={resume.mode === "cbt" ? "monitor" : "play"} className="size-4" />
                  </Ring>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg-muted">Continue where you left off</p>
                    <p className="mt-0.5 truncate text-lg font-semibold">{resume.title}</p>
                    <p className="text-sm text-fg-muted">
                      {resume.mode === "cbt" ? "Exam-style CBT" : resume.mode === "test" ? "Test mode" : "Learning mode"} · {progressOf(resume)} of {resume.questionIds.length} done
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="lg" pixel className="flex-1 sm:flex-none" onClick={() => router.push(resume.mode === "cbt" ? `/cbt/?id=${resume.id}` : `/practice/session/?id=${resume.id}`)}>
                      Continue <Icon name="arrowRight" className="size-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="grid size-14 shrink-0 place-items-center rounded-full bg-fg text-bg">
                    <Icon name="zap" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg-muted">Start today&rsquo;s practice</p>
                    <p className="mt-0.5 text-lg font-semibold">10 mixed {exam.name} questions</p>
                    <p className="text-sm text-fg-muted">Learning mode · instant feedback · ~15 min</p>
                  </div>
                  <Button size="lg" pixel disabled={starting} onClick={() => start(quickPractice(user.exam))}>
                    {starting ? "Starting…" : "Start practising"} <Icon name="arrowRight" className="size-4" />
                  </Button>
                </>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
              {resume && (
                <button type="button" onClick={() => start(quickPractice(user.exam))} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-fg-soft hover:bg-surface-2 hover:text-fg">
                  <Icon name="zap" className="size-4" /> New quick practice
                </button>
              )}
              {PAPERS_ENABLED && (
                <Link href={`/tests/?exam=${user.exam}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-fg-soft hover:bg-surface-2 hover:text-fg">
                  <Icon name="monitor" className="size-4" /> Full paper in CBT
                </Link>
              )}
              <Link href="/practice/#library" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-fg-soft hover:bg-surface-2 hover:text-fg">
                <Icon name="layers" className="size-4" /> Choose a chapter
              </Link>
            </div>

            {rec && recChapter && (
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-6">
                <span aria-hidden className={cn("grid size-10 place-items-center rounded-lg bg-surface-2 font-display text-lg", SUBJECT_STYLE[rec.subject].text)}>
                  {SUBJECT_STYLE[rec.subject].glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg-muted">Up next for you</p>
                  <p className="font-medium">
                    {recChapter.name}
                    <span className="font-normal text-fg-muted">
                      {" "}
                      — {rec.kind === "weak" ? `${Math.round((rec.accuracy ?? 0) * 100)}% on your last ${rec.answered} here` : "not practised yet"}
                    </span>
                  </p>
                </div>
                <Button variant="secondary" onClick={() => start(quickPractice(user.exam, { subject: rec.subject, chapter: rec.chapter }))}>
                  Practise
                </Button>
              </div>
            )}
          </div>

          <TodayPanel s={s} user={user} />
        </div>
      </section>

      <div className="pb-10">
        <PremiumUpgradePrompt context="dashboard" />
      </div>

      <Performance s={s} user={user} onStart={start} />
      <Momentum s={s} user={user} />
    </div>
  );
}

/* ───────── Today panel: goal ring, streak week, the kitty ───────── */

function TodayPanel({ s, user }: { s: DemoState; user: DemoUser }) {
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

/* ───────── 2 · Performance ───────── */

function SectionHead({ id, title, sub, href, cta }: { id: string; title: string; sub?: string; href?: string; cta?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-2xl font-semibold">
          {title}
        </h2>
        {sub && <p className="mt-1 text-sm text-fg-muted">{sub}</p>}
      </div>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
          {cta} <Icon name="arrowRight" className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function Performance({ s, user, onStart }: { s: DemoState; user: DemoUser; onStart: (p: Promise<string | null> | string | null) => void }) {
  const t = totals(s);
  const w = thisWeek(s);
  const trend = weeklyTrend(s, 8);
  const [prevWeek, curWeek] = trend.slice(-2);
  const delta = prevWeek.accuracy !== null && curWeek.accuracy !== null ? Math.round((curWeek.accuracy - prevWeek.accuracy) * 100) : null;
  const subjects = subjectStats(s);
  const recent = useMemo(() => scoredAttempts(s), [s]);
  const papers = recent.filter((r) => r.attempt.kind === "paper");
  const bestPaper = papers.length ? Math.max(...papers.map((p) => (p.result.max ? p.result.score / p.result.max : 0))) : null;

  const stats: { label: string; value: string; sub: React.ReactNode }[] = [
    { label: "Questions practised", value: t.answered.toLocaleString("en-IN"), sub: `+${w.answered} this week` },
    {
      label: "Accuracy",
      value: t.accuracy === null ? "—" : `${Math.round(t.accuracy * 100)}%`,
      sub:
        delta === null ? (
          "Across all practice"
        ) : (
          <span className={delta >= 0 ? "text-ok" : "text-review"}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts vs last week
          </span>
        ),
    },
    { label: "Study time this week", value: formatDuration(w.seconds), sub: `≈ ${formatDuration(w.seconds / Math.max(1, ((new Date().getDay() + 6) % 7) + 1))} a day` },
    PAPERS_ENABLED
      ? { label: "Papers & tests", value: String(papers.length), sub: bestPaper === null ? "None yet" : `Best ${Math.round(bestPaper * 100)}%` }
      : { label: "Sessions finished", value: String(recent.length), sub: recent.length ? "Completed practice sessions" : "None yet" },
  ];

  return (
    <section aria-labelledby="perf-h" className="border-t border-line py-14">
      <SectionHead id="perf-h" title="Performance" sub="How your practice is going. Not a prediction of your exam rank." href="/progress/" cta="Full progress" />
      <dl className="surface grid grid-cols-2 lg:grid-cols-4">
        {stats.map((x, i) => (
          <div key={x.label} className={cn("p-5 sm:p-6", i % 2 === 1 && "border-l border-line", i >= 2 && "border-t border-line lg:border-t-0", i === 2 && "lg:border-l")}>
            <dt className="text-sm text-fg-muted">{x.label}</dt>
            <dd className="numeral mt-2 text-3xl">{x.value}</dd>
            <dd className="mt-1 text-sm text-fg-muted">{x.sub}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="surface p-6">
          <h3 className="font-semibold">Subjects</h3>
          <ul className="mt-5 space-y-5">
            {subjects.map((x) => {
              const sub = catalog.subject(x.subject)!;
              const style = SUBJECT_STYLE[x.subject];
              return (
                <li key={x.subject} className="group grid grid-cols-[auto_1fr_auto] items-center gap-4">
                  <span aria-hidden className={cn("grid size-9 place-items-center rounded-lg bg-surface-2 font-display", style.text)}>
                    {style.glyph}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{sub.name}</span>
                      <span className="text-sm tabular-nums text-fg-muted">
                        <span className="font-medium text-fg">{Math.round(x.accuracy * 100)}%</span> · {x.answered} Qs
                      </span>
                    </div>
                    <Bar value={x.accuracy} className="mt-2" colorClass={style.bg} label={`${sub.name} accuracy`} />
                  </div>
                  <button
                    type="button"
                    onClick={() => onStart(quickPractice(user.exam, { subject: x.subject }))}
                    className="grid size-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                    aria-label={`Practise ${sub.name}`}
                    title={`Practise ${sub.name}`}
                  >
                    <Icon name="play" className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="surface p-6">
          <h3 className="font-semibold">Weekly accuracy</h3>
          <TrendBars data={trend} className="mt-3" />
        </div>
      </div>

      <div className="surface mt-4 p-2 sm:p-3">
        <div className="flex items-baseline justify-between px-3 pt-3 sm:px-4">
          <h3 className="font-semibold">Recent attempts</h3>
          {PAPERS_ENABLED && (
            <Link href="/tests/" className="text-sm text-fg-muted hover:text-fg">
              All papers
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <TabbyMascot state="idle" className="h-12 text-fg-subtle" />
            <p className="mt-3 text-sm text-fg-muted">Finished sessions and papers will show up here.</p>
          </div>
        ) : (
          <ul className="mt-2">
            {recent.slice(0, 4).map(({ attempt: a, result: r }) => (
              <li key={a.id}>
                <Link href={`/results/?id=${a.id}`} className="group flex items-center gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-surface-2 sm:px-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted group-hover:bg-surface-3">
                    <Icon name={a.mode === "cbt" ? "monitor" : a.mode === "test" ? "clock" : "book"} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.title}</span>
                    <span className="block text-sm text-fg-muted">
                      {a.mode === "cbt" ? "CBT" : a.mode === "test" ? "Test" : "Learning"} · {relativeDay(a.submittedAt!)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="numeral block text-lg">
                      {r.score}
                      <span className="text-fg-subtle">/{r.max}</span>
                    </span>
                    <span className="block text-sm tabular-nums text-fg-muted">{r.accuracy === null ? "—" : `${Math.round(r.accuracy * 100)}% accurate`}</span>
                  </span>
                  <Icon name="chevronRight" className="size-4 text-fg-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ───────── 3 · Momentum ───────── */

function Momentum({ s, user }: { s: DemoState; user: DemoUser }) {
  const t = totals(s);
  const lv = level(t.xp);
  const ch = challenges(s);
  const board = LEADERBOARD_ENABLED ? leaderboard(s) : [];
  const me = board.find((r) => r.you);
  const ach = achievements(s);
  const done = ach.filter((a) => a.done);
  const nextAch = ach.filter((a) => !a.done).sort((a, b) => b.progress[0] / b.progress[1] - a.progress[0] / a.progress[1])[0];
  const nextUnlock = COSMETICS.find((c) => c.level > lv.level);

  return (
    <section aria-labelledby="mom-h" className="border-t border-line py-14">
      <SectionHead id="mom-h" title="Momentum" sub={DATA_SOURCE === "api" ? "XP is a display score worked out from your answers: 10 per correct answer, 2 per attempt." : "XP comes from real practice: correct answers, finished papers and cleared mistakes."} href="/progress/" cta="Achievements & wardrobe" />
      <div className={cn("grid gap-4", LEADERBOARD_ENABLED ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {/* Level */}
        <div className="surface flex flex-col p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Level</p>
              <p className="numeral mt-1 text-4xl">{lv.level}</p>
            </div>
            <span className="pixel-corners bg-mathematics/15 px-2.5 py-1 text-xs font-semibold text-mathematics">{lv.tier}</span>
          </div>
          <PixelBar value={lv.into / lv.span} segments={16} className="mt-5 h-3" colorClass="bg-mathematics" label="Progress to next level" />
          <p className="mt-2 text-sm tabular-nums text-fg-muted">
            {lv.toNext.toLocaleString("en-IN")} XP to level {lv.level + 1}
          </p>
          {nextUnlock && (
            <div className="mt-auto flex items-center gap-3 border-t border-line pt-4">
              <Kitty cosmetic={nextUnlock.id} className="h-10 w-auto text-fg-subtle" />
              <p className="text-sm text-fg-muted">
                <span className="text-fg">{nextUnlock.name}</span> unlocks at level {nextUnlock.level}
              </p>
            </div>
          )}
        </div>

        {/* Challenges */}
        <div className="surface p-6">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">Weekly challenges</p>
            <span className="text-sm text-fg-muted">Resets Monday</span>
          </div>
          <ul className="mt-4 space-y-4">
            {ch.map((c) => {
              const ok = c.have >= c.need;
              return (
                <li key={c.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className={cn("flex items-center gap-2", ok && "text-fg-muted")}>
                      {ok ? <PixelIcon name="check" className="size-3.5 text-ok" /> : <span aria-hidden className="size-3.5 rounded-sm border border-line-strong" />}
                      {c.name}
                    </span>
                    <span className={cn("shrink-0 tabular-nums", ok ? "text-ok" : "text-fg-muted")}>{ok ? `+${c.xp} XP` : `${c.have}/${c.need}`}</span>
                  </div>
                  <Bar value={c.have / c.need} className="mt-2" colorClass={ok ? "bg-ok" : "bg-fg"} label={c.name} />
                </li>
              );
            })}
          </ul>
        </div>

        {/* Leaderboard (demo peers: hidden in API mode unless FEATURE_LEADERBOARD=demo) */}
        {LEADERBOARD_ENABLED && me && (
        <div className="surface flex flex-col p-6">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">This week&rsquo;s board</p>
            <Link href="/leaderboard/" className="text-sm text-fg-muted hover:text-fg">
              View all
            </Link>
          </div>
          <p className="mt-1 text-sm text-fg-muted">Practice XP since Monday · {EXAMS[user.exam].name}. Not an exam rank.</p>
          <ol className="mt-4 space-y-1">
            {[...board.slice(0, 3), ...(me.rank > 3 ? [me] : [])].map((r) => (
              <li key={r.name} className={cn("flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm", r.you && "bg-surface-2 font-medium")}>
                <span className={cn("w-6 font-display tabular-nums", r.rank <= 3 ? "text-mathematics" : "text-fg-muted")}>{r.rank}</span>
                <span className="flex-1 truncate">{r.name}</span>
                <span className="tabular-nums text-fg-muted">{r.xp.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ol>
          {me.rank > 1 && (
            <p className="mt-auto pt-4 text-sm text-fg-muted">
              {(board[me.rank - 2].xp - me.xp + 1).toLocaleString("en-IN")} XP to move up a place.
            </p>
          )}
        </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="surface p-6">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">Activity</p>
            <p className="text-sm text-fg-muted">Last 18 weeks</p>
          </div>
          <div className="mt-5">
            <Heatmap activity={s.activity} goal={user.dailyGoal} weeks={18} />
          </div>
        </div>
        <div className="surface flex flex-col p-6">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">Achievements</p>
            <span className="text-sm tabular-nums text-fg-muted">
              {done.length} of {ach.length}
            </span>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Unlocked">
            {done.map((a) => (
              <li key={a.id} title={`${a.name} — ${a.desc}`} className="pixel-corners grid size-11 place-items-center bg-mathematics/10 text-mathematics">
                <PixelIcon name={a.icon} className="size-5" />
                <span className="sr-only">{a.name}</span>
              </li>
            ))}
          </ul>
          {nextAch && (
            <div className="mt-auto border-t border-line pt-4">
              <p className="text-sm text-fg-muted">Closest next</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="pixel-corners grid size-11 shrink-0 place-items-center bg-surface-2 text-fg-subtle">
                  <PixelIcon name={nextAch.icon} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium">{nextAch.name}</p>
                    <span className="text-sm tabular-nums text-fg-muted">
                      {nextAch.progress[0]}/{nextAch.progress[1]}
                    </span>
                  </div>
                  <Bar value={nextAch.progress[0] / nextAch.progress[1]} className="mt-2" label={`${nextAch.name} progress`} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-10 flex justify-center">
        <ButtonLink href="/practice/" variant="secondary">
          Go to practice <Icon name="arrowRight" className="size-4" />
        </ButtonLink>
      </div>
    </section>
  );
}


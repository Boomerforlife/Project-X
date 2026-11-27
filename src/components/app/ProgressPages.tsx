"use client";

import { AdSlot } from "@/components/ads/AdSlot";
import { BillingSection } from "@/components/billing/BillingSection";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Kitty } from "@/components/brand/Kitty";
import { Heatmap, TrendBars } from "@/components/charts/Charts";
import { ThemeChooser } from "@/components/theme/Theme";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { Bar, Card, Dialog, Eyebrow, PageSkeleton, PixelBar, Segmented } from "@/components/ui/Primitives";
import { DemoBadge } from "@/components/app/ModeBadge";
import { cn } from "@/lib/cn";
import { catalog } from "@/lib/data/catalog";
import { formatDuration, relativeDay } from "@/lib/demo/dates";
import { COSMETICS, LEADERBOARD_ENABLED, STREAK_MIN_QUESTIONS, achievements, chapterStats, challenges, leaderboard, level, streaks, subjectStats, thisWeek, totals, weeklyTrend } from "@/lib/demo/progress";
import { DATA_SOURCE } from "@/lib/site";
import { availableExams } from "@/lib/session/exams";
import { Kitty as KittyMark } from "@/components/brand/Kitty";
import { XP, attemptsList, completeOnboarding, signOut, updateUser } from "@/lib/demo/store";
import { scoreAttempt } from "@/lib/demo/scoring";
import type { Attempt } from "@/lib/demo/types";
import { xpRuleCopy } from "@/lib/home/xp-copy";
import { routes } from "@/lib/routes";
import type { ClassLevel, DemoState } from "@/lib/demo/types";
import { EXAMS, type Track } from "@/lib/exams";
import { SUBJECT_STYLE } from "@/lib/subjects";
import { DemoGate } from "./DemoGate";

type S = DemoState & { user: NonNullable<DemoState["user"]> };

/* ---------------- /progress/ ---------------- */

export function ProgressPage() {
  return (
    <DemoGate>
      {(s) => (
        <Suspense fallback={<PageSkeleton />}>
          <ProgressTabs s={s} />
        </Suspense>
      )}
    </DemoGate>
  );
}

const TABS = ["overview", "tests", "achievements"] as const;
type Tab = (typeof TABS)[number];

function ProgressTabs({ s }: { s: S }) {
  const q = useSearchParams().get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(q ?? "") ? (q as Tab) : "overview";
  return <Progress s={s} tab={tab} />;
}

function TabNav({ tab }: { tab: Tab }) {
  const items: { id: Tab | "leaderboard"; label: string; href: string }[] = [
    { id: "overview", label: "Overview", href: routes.progress },
    { id: "tests", label: "Tests", href: routes.progressTests },
    { id: "achievements", label: "Achievements", href: `${routes.progress}?tab=achievements` },
    ...(LEADERBOARD_ENABLED ? [{ id: "leaderboard" as const, label: "Leaderboard", href: routes.leaderboard }] : []),
  ];
  return (
    <nav aria-label="Progress sections" className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((x) => (
        <Link
          key={x.id}
          href={x.href}
          aria-current={x.id === tab ? "page" : undefined}
          className={cn("inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 text-sm font-medium transition-colors", x.id === tab ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg")}
        >
          {x.label}
        </Link>
      ))}
    </nav>
  );
}

function Progress({ s, tab }: { s: S; tab: Tab }) {
  const track = EXAMS[s.user.exam].track;
  const t = totals(s);
  const st = streaks(s);
  const lv = level(t.xp);
  const w = thisWeek(s);
  const ach = achievements(s);
  const ch = challenges(s);
  const subjects = subjectStats(s);
  const weakest = chapterStats(s)
    .filter((c) => c.answered >= 2)
    .sort((a, b) => a.correct / a.answered - b.correct / b.answered)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Eyebrow className="flex items-center gap-2">
        {EXAMS[s.user.exam].name} <DemoBadge />
      </Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Progress</h1>
      <p className="mt-2 max-w-2xl text-fg-muted">Effort and accuracy over time. These numbers describe your practice — they are not a prediction of your exam rank.</p>

      <TabNav tab={tab} />

      {tab === "tests" && <TestsTab s={s} />}
      {tab === "achievements" && <AchievementsTab s={s} ach={ach} ch={ch} />}
      {tab === "overview" && (
        <>
      <div className="mt-8 grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <Kitty pose="sit" cosmetic={s.user.cosmetic} className="h-28 w-auto shrink-0 self-center text-fg" />
          <div className="flex-1">
            <div className="flex items-baseline gap-3">
              <p className="font-display text-4xl font-semibold tabular-nums">Level {lv.level}</p>
              <span className="pixel-corners bg-surface-2 px-2 py-1 font-pixel text-[0.6rem] uppercase tracking-widest text-mathematics">{lv.tier}</span>
            </div>
            <PixelBar value={lv.into / lv.span} segments={24} className="mt-4" colorClass="bg-mathematics" label="Progress to next level" />
            <p className="mt-2 text-sm tabular-nums text-fg-muted">
              {lv.into.toLocaleString("en-IN")} / {lv.span.toLocaleString("en-IN")} XP · {t.xp.toLocaleString("en-IN")} total
            </p>
            <details className="mt-3 text-xs text-fg-muted">
              <summary className="cursor-pointer select-none hover:text-fg">How XP works</summary>
              <p className="mt-2 leading-relaxed">
                {DATA_SOURCE === "api" ? "XP is a display score worked out from your recorded answers, not stored separately and not a rating. " : ""}
                {xpRuleCopy(XP)} Opening the app or clicking around earns nothing.
              </p>
            </details>
          </div>
        </Card>
        <Card className="grid grid-cols-2 gap-5 p-6">
          {[
            ["Current streak", `${st.current} days`, <PixelIcon key="f" name="flame" className="size-4 text-review" />, routes.practice(track)],
            ["Longest streak", `${st.longest} days`, <PixelIcon key="f2" name="flame2" className="size-4 text-fg-muted" />, null],
            ["Questions practised", t.answered.toLocaleString("en-IN"), null, routes.practice(track)],
            ["Overall accuracy", t.accuracy === null ? "—" : `${Math.round(t.accuracy * 100)}%`, null, routes.mistakes],
            ["This week", `${w.answered} questions`, null, routes.practice(track)],
            ["Time this week", formatDuration(w.seconds), null, null],
          ].map(([k, v, icon, href]) => {
            const body = (
              <>
                <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                  {icon}
                  {k as string}
                </p>
                <p className="mt-1 font-display text-xl font-semibold tabular-nums">{v as string}</p>
              </>
            );
            return href ? (
              <Link key={k as string} href={href as string} className="-m-2 block rounded-lg p-2 transition-colors hover:bg-surface-2">
                {body}
              </Link>
            ) : (
              <div key={k as string}>{body}</div>
            );
          })}
          <p className="col-span-2 text-xs text-fg-muted">{STREAK_MIN_QUESTIONS === 1 ? "A streak day needs at least one answered question." : `A streak day needs at least ${STREAK_MIN_QUESTIONS} answered questions.`}</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-6">
          <h2 className="font-medium">Activity</h2>
          <div className="mt-4">
            <Heatmap activity={s.activity} goal={s.user.dailyGoal} weeks={26} />
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="font-medium">Weekly accuracy</h2>
          <TrendBars data={weeklyTrend(s, 10)} className="mt-3" />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-medium">By subject</h2>
          <ul className="mt-5 space-y-5">
            {subjects.map((x) => {
              const name = catalog.subject(x.subject)!.name;
              return (
                <li key={x.subject}>
                  <Link href={routes.subject(track, x.subject)} className="-m-2 block rounded-lg p-2 transition-colors hover:bg-surface-2">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className={cn("font-medium", SUBJECT_STYLE[x.subject].text)}>{name}</span>
                      <span className="tabular-nums text-fg-muted">{x.accuracy === null ? "Not practised yet" : `${Math.round(x.accuracy * 100)}% · ${x.answered} questions`}</span>
                    </div>
                    {x.accuracy !== null && <Bar value={x.accuracy} className="mt-2" colorClass={SUBJECT_STYLE[x.subject].bg} label={`${name} accuracy`} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="p-6">
          <h2 className="font-medium">Chapters to revisit</h2>
          {weakest.length === 0 ? (
            <p className="mt-4 text-sm text-fg-muted">Practise a few chapters and the weakest ones will show up here.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {weakest.map((c) => (
                <li key={`${c.subject}/${c.chapter}`}>
                  <Link href={routes.chapterPractise(track, c.subject, c.chapter)} className="flex min-h-11 items-center justify-between gap-4 py-2.5 text-sm hover:text-fg">
                    <span>
                      <span className={cn("mr-2", SUBJECT_STYLE[c.subject].text)} aria-hidden>
                        {SUBJECT_STYLE[c.subject].glyph}
                      </span>
                      {catalog.chapter(c.subject, c.chapter)?.name ?? c.chapter}
                    </span>
                    <span className="flex items-center gap-2 tabular-nums text-fg-muted">
                      {c.correct}/{c.answered} correct <Icon name="chevronRight" className="size-3.5 text-fg-subtle" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {LEADERBOARD_ENABLED && <LeaderboardTeaser s={s} />}
        </>
      )}
      <AdSlot placement="notebook-bottom" />
    </div>
  );
}

function Wardrobe({ s }: { s: S }) {
  const lv = level(totals(s).xp).level;
  return (
    <section aria-labelledby="wr-h" className="mt-12">
      <h2 id="wr-h" className="text-xl font-semibold">
        Kitty wardrobe
      </h2>
      <p className="mt-1 text-sm text-fg-muted">Cosmetic only. Unlocks as you level up.</p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <li>
          <WardrobeItem label="Nothing" sub="Classic" active={s.user.cosmetic === null} onClick={() => updateUser({ cosmetic: null })}>
            <Kitty className="h-16 w-auto text-fg" />
          </WardrobeItem>
        </li>
        {COSMETICS.map((c) => {
          const unlocked = lv >= c.level;
          return (
            <li key={c.id}>
              <WardrobeItem label={c.name} sub={unlocked ? "Unlocked" : `Level ${c.level}`} active={s.user.cosmetic === c.id} disabled={!unlocked} onClick={() => updateUser({ cosmetic: c.id })}>
                <Kitty cosmetic={c.id} className={cn("h-16 w-auto", unlocked ? "text-fg" : "text-fg-subtle opacity-40")} />
              </WardrobeItem>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WardrobeItem({ label, sub, active, disabled, onClick, children }: { label: string; sub: string; active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn("flex w-full flex-col items-center rounded-xl border p-4 transition-colors disabled:cursor-not-allowed", active ? "border-fg bg-surface-2" : "border-line bg-surface hover:border-line-strong")}
    >
      {children}
      <span className="mt-3 text-sm font-medium">{label}</span>
      <span className="flex items-center gap-1 text-xs text-fg-muted">
        {disabled && <PixelIcon name="lock" className="size-3" />}
        {sub}
      </span>
    </button>
  );
}

/* ---------------- /leaderboard/ ---------------- */

export function LeaderboardPage() {
  if (!LEADERBOARD_ENABLED) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <KittyMark pose="sleep" className="h-20 w-auto text-fg-subtle" />
        <h1 className="mt-8 text-3xl font-semibold">No leaderboard yet</h1>
        <p className="mt-3 text-fg-muted">A weekly board will come once there are enough real students to make it meaningful. Your own progress is on the Progress page.</p>
      </div>
    );
  }
  return <DemoGate>{(s) => <Leaderboard s={s} />}</DemoGate>;
}

function Leaderboard({ s }: { s: S }) {
  const rows = leaderboard(s);
  const me = rows.find((r) => r.you)!;
  const max = rows[0].xp || 1;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Eyebrow className="flex items-center gap-2">
        {EXAMS[s.user.exam].name} · this week <DemoBadge />
      </Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Leaderboard</h1>
      <Card className="mt-6 p-5 text-sm">
        <p className="font-medium">What&rsquo;s ranked</p>
        <p className="mt-1 leading-relaxed text-fg-muted">
          Practice XP earned this week (Monday to Sunday) by students preparing for the same exam. It rewards consistent, genuine practice. It is <span className="text-fg">not</span> a
          score, a percentile or a JEE/NEET rank. Only first names and an initial are shown. Other students here are demo data.
        </p>
        <label className="mt-4 flex cursor-pointer items-center gap-3">
          <input type="checkbox" checked={s.user.showOnLeaderboard} onChange={(e) => updateUser({ showOnLeaderboard: e.target.checked })} className="size-4 accent-current" />
          Show my name to other students
        </label>
      </Card>

      <div className="mt-6 flex items-center gap-4 rounded-xl border border-line-strong bg-surface-2 p-4">
        <span className="font-pixel text-lg tabular-nums text-mathematics">#{me.rank}</span>
        <div className="flex-1">
          <p className="font-medium">Your position</p>
          <p className="text-sm text-fg-muted">
            {me.rank === 1 ? "Top of the board this week." : `${(rows[me.rank - 2].xp - me.xp + 1).toLocaleString("en-IN")} XP to move up one place.`}
          </p>
        </div>
        <span className="font-display text-xl font-semibold tabular-nums">{me.xp.toLocaleString("en-IN")}</span>
      </div>

      <ol className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.name} className={cn("grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-line px-4 py-3 last:border-0", r.you && "bg-surface-2")}>
            <span className={cn("font-pixel text-xs tabular-nums", r.rank <= 3 ? "text-mathematics" : "text-fg-muted")}>
              {r.rank <= 3 ? <PixelIcon name="crown" className="size-4" /> : r.rank}
              {r.rank <= 3 && <span className="sr-only">{r.rank}</span>}
            </span>
            <div className="min-w-0">
              <p className={cn("truncate text-sm", r.you && "font-medium")}>{r.name}</p>
              <div className="mt-1.5 h-1 rounded-full bg-surface-3">
                <div className={cn("h-full rounded-full", r.you ? "bg-fg" : "bg-fg/30")} style={{ width: `${(r.xp / max) * 100}%` }} />
              </div>
            </div>
            <span className="text-sm tabular-nums text-fg-muted">{r.xp.toLocaleString("en-IN")} XP</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------- /account/ ---------------- */

export function AccountPage() {
  return <DemoGate>{(s) => <Account s={s} />}</DemoGate>;
}

function Account({ s }: { s: S }) {
  const router = useRouter();
  const [name, setName] = useState(s.user.name);
  const [reset, setReset] = useState(false);
  const u = s.user;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Eyebrow className="flex items-center gap-2">
        Account <DemoBadge />
      </Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Profile & settings</h1>

      <div className="mt-8 space-y-4">
        <Card className="p-6">
          <h2 className="font-medium">Profile</h2>
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void updateUser({ name: name.trim() || u.name });
            }}
          >
            <label className="flex-1 text-sm">
              <span className="text-fg-muted">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-bg px-3 outline-none focus:border-fg" />
            </label>
            <Button type="submit" variant="secondary" disabled={name.trim() === u.name}>
              Save
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="font-medium">Target exam</h2>
          <p className="mt-1 text-sm text-fg-muted">Changes your dashboard, practice and papers. Your history is kept.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {availableExams().map((e) => (
              <button
                key={e.id}
                type="button"
                aria-pressed={u.exam === e.id}
                onClick={() => void updateUser({ exam: e.id })}
                className={cn("rounded-lg border p-3 text-left transition-colors", u.exam === e.id ? "border-fg bg-surface-2" : "border-line hover:border-line-strong")}
              >
                <span className="block font-medium">{e.name}</span>
                <span className="block text-xs text-fg-muted">{e.subjects.map((x) => catalog.subject(x)!.name).join(", ")}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-8">
            <div>
              <p className="text-sm text-fg-muted">Class</p>
              <Segmented
                className="mt-2"
                label="Class"
                value={u.classLevel}
                onChange={(v: ClassLevel) => void updateUser({ classLevel: v })}
                options={[
                  { id: "11", label: "Class 11" },
                  { id: "12", label: "Class 12" },
                  { id: "dropper", label: "Repeater" },
                ]}
              />
            </div>
            <div>
              <p className="text-sm text-fg-muted">Daily goal (questions)</p>
              <Segmented
                className="mt-2"
                label="Daily goal"
                value={String(u.dailyGoal)}
                onChange={(v) => void updateUser({ dailyGoal: Number(v) })}
                options={["10", "20", "35", "50"].map((n) => ({ id: n, label: n }))}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-medium">Appearance</h2>
          <p className="mt-1 text-sm text-fg-muted">Dark is the default. Your choice is remembered on this device.</p>
          <div className="mt-4">
            <ThemeChooser />
          </div>
        </Card>

        {LEADERBOARD_ENABLED && (
        <Card className="p-6">
          <h2 className="font-medium">Privacy</h2>
          <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={u.showOnLeaderboard} onChange={(e) => updateUser({ showOnLeaderboard: e.target.checked })} className="size-4 accent-current" />
            Show my first name on the weekly leaderboard
          </label>
        </Card>
        )}

        {DATA_SOURCE === "api" ? (
          <Card className="p-6">
            <h2 className="font-medium">Session</h2>
            <p className="mt-1 text-sm text-fg-muted">Your practice and progress are saved to your account. Review list and mistake tags are kept on this device for now.</p>
            <div className="mt-4">
              <Button
                variant="ghost"
                onClick={() => {
                  signOut();
                  router.push("/");
                }}
              >
                <Icon name="logout" className="size-4" /> Sign out
              </Button>
            </div>
          </Card>
        ) : (
        <Card className="p-6">
          <h2 className="font-medium">Demo data</h2>
          <p className="mt-1 text-sm text-fg-muted">Everything in this demo is stored only in this browser. Reset to start the sample history again, or sign out to clear it.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setReset(true)}>
              <Icon name="rotate" className="size-4" /> Reset sample history
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                signOut();
                router.push("/");
              }}
            >
              <Icon name="logout" className="size-4" /> Sign out & clear
            </Button>
          </div>
        </Card>
        )}
        <BillingSection />
      </div>

      <Dialog open={reset} onClose={() => setReset(false)} title="Reset sample history?">
        <p className="text-sm text-fg-soft">This replaces your attempts, notebook and activity with a fresh two-month sample for {EXAMS[u.exam].name}.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setReset(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void completeOnboarding({ exam: u.exam, classLevel: u.classLevel, dailyGoal: u.dailyGoal, name: u.name });
              setReset(false);
              router.push("/dashboard/");
            }}
          >
            Reset
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/* ---------------- Achievements tab ---------------- */

function AchievementsTab({ s, ach, ch }: { s: S; ach: ReturnType<typeof achievements>; ch: ReturnType<typeof challenges> }) {
  const track = EXAMS[s.user.exam].track;
  const where: Record<string, string> = { volume: routes.practice(track), paper: routes.pyq(track), mistakes: routes.mistakes };
  return (
    <>
      <section aria-labelledby="ch-h" className="mt-12">
        <h2 id="ch-h" className="text-xl font-semibold">
          Weekly challenges
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ch.map((c) => {
            const done = c.have >= c.need;
            return (
              <li key={c.id}>
                <Card className={cn("h-full p-5", done && "border-ok/40")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{c.name}</p>
                    {done ? <PixelIcon name="check" className="size-4 shrink-0 text-ok" /> : <span className="shrink-0 font-pixel text-[0.6rem] text-mathematics">+{c.xp} XP</span>}
                  </div>
                  <Bar value={c.have / c.need} className="mt-4" colorClass={done ? "bg-ok" : "bg-fg"} label={c.name} />
                  <p className="mt-2 flex items-center justify-between text-xs tabular-nums text-fg-muted">
                    <span>
                      {Math.min(c.have, c.need)} / {c.need}
                    </span>
                    {!done && where[c.id] && (
                      <Link href={where[c.id]!} className="inline-flex min-h-11 items-center text-fg-soft underline underline-offset-4 hover:text-fg">
                        Go
                      </Link>
                    )}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="ach-h" className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 id="ach-h" className="text-xl font-semibold">
            Achievements
          </h2>
          <p className="text-sm tabular-nums text-fg-muted">
            {ach.filter((a) => a.done).length} of {ach.length}
          </p>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ach.map((a) => (
            <li key={a.id}>
              <Card className={cn("flex h-full flex-col items-center p-5 text-center", !a.done && "bg-transparent")}>
                <span className={cn("pixel-corners grid size-14 place-items-center", a.done ? "bg-surface-2 text-mathematics" : "bg-surface-2 text-fg-subtle")}>
                  <PixelIcon name={a.done ? a.icon : "lock"} className="size-7" />
                </span>
                <p className={cn("mt-3 font-medium", !a.done && "text-fg-muted")}>{a.name}</p>
                <p className="mt-1 text-xs text-fg-muted">{a.desc}</p>
                {!a.done && (
                  <p className="mt-auto pt-3 text-xs tabular-nums text-fg-subtle">
                    {a.progress[0]} / {a.progress[1]}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <Wardrobe s={s} />
    </>
  );
}

/* ---------------- Leaderboard teaser (only when the board is enabled) ---------------- */

function LeaderboardTeaser({ s }: { s: S }) {
  const me = leaderboard(s).find((r) => r.you);
  if (!me) return null;
  return (
    <Card className="mt-4 flex flex-wrap items-center justify-between gap-4 p-6">
      <div>
        <h2 className="font-medium">This week&rsquo;s board</h2>
        <p className="mt-1 text-sm text-fg-muted">You are #{me.rank} on practice XP since Monday. Not an exam rank.</p>
      </div>
      <Link href={routes.leaderboard} className="inline-flex min-h-11 items-center gap-1 text-sm text-fg-muted hover:text-fg">
        View leaderboard <Icon name="arrowRight" className="size-3.5" />
      </Link>
    </Card>
  );
}

/* ---------------- Tests tab ---------------- */

function TestsTab({ s }: { s: S }) {
  const track = EXAMS[s.user.exam].track;
  // Full papers and timed tests (test mode / CBT); untimed learning sessions are not "tests".
  const rows = attemptsList(s).filter((a) => a.kind === "paper" || a.mode === "test" || a.mode === "cbt");
  if (rows.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
        <Kitty pose="sleep" className="h-16 w-auto text-fg-subtle" />
        <p className="mt-4 font-medium">No papers or timed tests yet</p>
        <p className="mt-1 text-sm text-fg-muted">Attempt a previous-year paper and it will be listed here, with your score.</p>
        <Link href={routes.pyq(track)} className="mt-5 inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-4 hover:text-fg">
          Browse PYQs <Icon name="arrowRight" className="size-3.5" />
        </Link>
      </div>
    );
  }
  return (
    <section aria-labelledby="tests-h" className="mt-8">
      <h2 id="tests-h" className="sr-only">
        Your papers and timed tests
      </h2>
      <ul className="surface divide-y divide-line">
        {rows.map((a) => (
          <TestRow key={a.id} a={a} track={track} />
        ))}
      </ul>
    </section>
  );
}

function TestRow({ a, track }: { a: Attempt; track: Track }) {
  const submitted = a.status === "submitted";
  const r = submitted ? scoreAttempt(a) : null;
  const when = submitted && a.submittedAt ? a.submittedAt : a.updatedAt;
  const kind = a.mode === "cbt" ? "CBT" : a.mode === "test" ? "Timed test" : "Untimed";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:px-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted">
        <Icon name={a.mode === "cbt" ? "monitor" : "clock"} className="size-4" />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate font-medium">{a.title}</p>
        <p className="text-sm text-fg-muted">
          {a.kind === "paper" ? `Paper · ${kind}` : kind} · {submitted ? "Submitted" : "In progress"} · {relativeDay(when)}
        </p>
      </div>
      {r && (
        <p className="text-right">
          <span className="numeral block text-lg">
            {r.score}
            <span className="text-fg-subtle">/{r.max}</span>
          </span>
          <span className="block text-sm tabular-nums text-fg-muted">{r.accuracy === null ? "—" : `${Math.round(r.accuracy * 100)}% accurate`}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3">
        {submitted ? (
          <Link href={routes.results(a.id)} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 hover:text-fg">
            Results
          </Link>
        ) : (
          <Link href={a.mode === "cbt" ? routes.cbt(a.id) : routes.session(a.id)} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 hover:text-fg">
            Resume
          </Link>
        )}
        {a.kind === "paper" && a.paperId && (
          <Link href={routes.pyqPaperFromSlug(track, a.paperId)} className="inline-flex min-h-11 items-center text-sm text-fg-muted underline underline-offset-4 hover:text-fg">
            Paper page
          </Link>
        )}
      </div>
    </li>
  );
}

"use client";

/**
 * Diagnostic + study plan (basic plan free, full plan Tabby Plus). Setup -> diagnostic (the normal test-mode player, no kitty, no hints) -> report ->
 * day-by-day plan. Copy is plain instruction: no readiness %, no rank, no motivational lines.
 */
import { PlusBadge } from "@/components/billing/PlusBadge";
import { useAds } from "@/components/ads/AdsProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SubjectId } from "@/contracts";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { DifficultyChip } from "@/components/ui/Badges";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { Card, Eyebrow, PageSkeleton, PixelBar, Segmented } from "@/components/ui/Primitives";
import { toast } from "@/components/ui/Toast";
import { DemoGate } from "@/components/app/DemoGate";
import { isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { catalog } from "@/lib/data/catalog";
import type { DemoState } from "@/lib/demo/types";
import { formatNumber, openProblem } from "@/lib/problems";
import {
  availableChapters,
  BAND_COPY,
  createPlan,
  currentDiagnostic,
  DiagnosticMissingError,
  getPlan,
  getReport,
  PlusRequiredError,
  resetDemoPlan,
  startDiagnostic,
  startItem,
  type ChapterView,
  type ItemView,
  type PlanView,
  type ReportView,
  type Setup,
} from "@/lib/plans";
import { DATA_SOURCE } from "@/lib/site";
import { routes } from "@/lib/routes";
import { trackOf } from "@/lib/exams";
import { SUBJECT_STYLE } from "@/lib/subjects";

type S = DemoState & { user: NonNullable<DemoState["user"]> };
type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "setup" }
  | { kind: "diagnostic"; attemptId: string; done: number; total: number }
  | { kind: "report"; report: ReportView }
  | { kind: "plan"; plan: PlanView; report: ReportView | null };

export function StudyPlanPage() {
  return <DemoGate>{(s) => <PlanRoot s={s} />}</DemoGate>;
}

function PlanRoot({ s }: { s: S }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // Reload only when attempts start or finish, not on every local state tick (each reload is an API call).
  const attempts = Object.values(s.attempts);
  const progressKey = `${s.user.exam}|${attempts.length}|${attempts.filter((a) => a.status === "submitted").length}`;

  useEffect(() => {
    let live = true;
    (async (): Promise<Phase> => {
      const plan = await getPlan(s);
      if (plan) return { kind: "plan", plan, report: await getReport(s).catch(() => null) };
      const diag = currentDiagnostic();
      if (!diag) return { kind: "setup" };
      const report = await getReport(s).catch(() => null);
      if (!report) return { kind: "setup" };
      if (!report.completed) {
        const a = s.attempts[diag.attemptId];
        const done = a ? a.questionIds.filter((q) => a.responses[q]?.answer).length : 0;
        return { kind: "diagnostic", attemptId: diag.attemptId, done, total: a?.questionIds.length ?? 0 };
      }
      return { kind: "report", report };
    })().then(
      (p) => live && setPhase(p),
      (e) =>
        live &&
        setPhase({
          kind: "error",
          message: isApiError(e) && e.status === 404 ? "Study plans aren't switched on for this server yet." : "We couldn't load your study plan.",
        }),
    );
    return () => {
      live = false;
    };
    // `s` is read for the latest attempts; `progressKey` decides when that is worth a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressKey, nonce]);

  const startOver = () => {
    resetDemoPlan();
    setPhase({ kind: "setup" });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
      {phase.kind === "loading" && <PageSkeleton />}
      {phase.kind === "error" && (
        <div role="alert" className="mx-auto max-w-md py-16 text-center">
          <TabbyMascot state="disconnected" className="mx-auto h-16 text-fg-subtle" />
          <h1 className="mt-6 text-2xl font-semibold">{phase.message}</h1>
          <p className="mt-2 text-fg-muted">Practice still works as usual.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={reload}>Try again</Button>
            <ButtonLink href="/practice/" variant="secondary">
              Go to practice
            </ButtonLink>
          </div>
        </div>
      )}
      {phase.kind === "setup" && <SetupView s={s} />}
      {phase.kind === "diagnostic" && <InProgress phase={phase} onDiscard={startOver} />}
      {phase.kind === "report" && <ReportScreen s={s} report={phase.report} onPlan={reload} onRestart={startOver} />}
      {phase.kind === "plan" && <PlanScreen s={s} plan={phase.plan} report={phase.report} onChanged={reload} onRestart={startOver} />}
    </div>
  );
}

/* ================================================================ setup */

function PlusNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-fg-muted">
      <PixelIcon name="star" className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function SetupView({ s }: { s: S }) {
  const router = useRouter();
  const exam = s.user.exam;
  const groups = useMemo(() => availableChapters(exam).filter((g) => g.chapters.length > 0), [exam]);
  const [subjects, setSubjects] = useState<SubjectId[]>(groups.map((g) => g.subject));
  const [chapters, setChapters] = useState<Set<string>>(() => new Set());
  const [length, setLength] = useState<"15" | "30" | "45">("30");
  const [open, setOpen] = useState<SubjectId | null>(null);
  const [busy, setBusy] = useState(false);

  const chosen = groups.filter((g) => subjects.includes(g.subject)).flatMap((g) => g.chapters.filter((c) => chapters.has(c.key)).map((c) => c.key));
  const minutes = Math.round((Number(length) * 150) / 60);

  const start = async () => {
    setBusy(true);
    try {
      const setup: Setup = { exam, subjects, chapters: chosen, length: Number(length) as Setup["length"] };
      const { attemptId } = await startDiagnostic(setup, s);
      router.push(`/practice/session/?id=${attemptId}`);
    } catch (e) {
      setBusy(false);
      toast(isApiError(e) && e.status === 404 ? "Diagnostics aren't switched on for this server yet." : e instanceof Error ? e.message : "Couldn't start the diagnostic.", { icon: "alert", tone: "warn" });
    }
  };

  return (
    <>
      <Eyebrow className="flex items-center gap-2">Study plan</Eyebrow>
      <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">Find where to focus</h1>
      <p className="mt-3 max-w-2xl text-lg text-fg-muted">
        Take one mixed test across the chapters you have studied. We use your answers to build a day-by-day plan from the problems, practice sessions and mistakes already on Tabby.
      </p>

      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {(
          [
            ["1", "Diagnostic", `${length} questions, timed, no hints. Easy, Medium and Hard mixed.`],
            ["2", "Report", "Each chapter marked Needs work, Getting there or Strong, with the answers behind it."],
            ["3", "Plan", "What to do each day, sized to your time. It adjusts as you practise."],
          ] as const
        ).map(([n, t, d]) => (
          <li key={n} className="surface-flat p-4">
            <span className="font-pixel text-xs text-fg-muted">STEP {n}</span>
            <p className="mt-1 font-semibold">{t}</p>
            <p className="mt-1 text-sm text-fg-muted">{d}</p>
          </li>
        ))}
      </ol>

      <Card className="mt-8 space-y-7 p-6">
        <div>
          <p className="text-sm font-medium">Subjects</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {groups.map((g) => {
              const on = subjects.includes(g.subject);
              return (
                <button
                  key={g.subject}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSubjects((xs) => (on ? xs.filter((x) => x !== g.subject) : [...xs, g.subject]))}
                  className={cn("inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium", on ? "border-fg bg-surface-2" : "border-line text-fg-muted hover:border-line-strong")}
                >
                  <span aria-hidden className={cn("size-2", SUBJECT_STYLE[g.subject].bg)} />
                  {catalog.subject(g.subject)?.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">Chapters you have studied</p>
          <p className="mt-1 text-sm text-fg-muted">Tick the chapters you have covered, so the test doesn&rsquo;t mark chapters you haven&rsquo;t reached as weak.</p>
          <div className="mt-2 flex gap-3 text-sm">
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-fg-muted underline-offset-2 hover:text-fg hover:underline sm:min-h-0"
              onClick={() => setChapters(new Set(groups.filter((g) => subjects.includes(g.subject)).flatMap((g) => g.chapters.map((c) => c.key))))}
            >
              Select all chapters
            </button>
            <button type="button" className="inline-flex min-h-11 items-center text-fg-muted underline-offset-2 hover:text-fg hover:underline sm:min-h-0" onClick={() => setChapters(new Set())}>
              Clear all
            </button>
          </div>
          <div className="mt-3 divide-y divide-line rounded-xl border border-line">
            {groups
              .filter((g) => subjects.includes(g.subject))
              .map((g) => {
                const n = g.chapters.filter((c) => chapters.has(c.key)).length;
                const expanded = open === g.subject;
                return (
                  <div key={g.subject}>
                    <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : g.subject)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                      <Icon name="chevronRight" className={cn("size-4 text-fg-muted transition-transform motion-reduce:transition-none", expanded && "rotate-90")} />
                      <span className={cn("flex-1 font-medium", SUBJECT_STYLE[g.subject].text)}>{catalog.subject(g.subject)?.name}</span>
                      <span className="text-sm tabular-nums text-fg-muted">
                        {n} of {g.chapters.length} chapters
                      </span>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4">
                        <div className="mb-2 flex gap-3 text-sm">
                          <button type="button" className="text-fg-muted underline-offset-2 hover:text-fg hover:underline" onClick={() => setChapters((c) => new Set([...c, ...g.chapters.map((x) => x.key)]))}>
                            Select all
                          </button>
                          <button type="button" className="text-fg-muted underline-offset-2 hover:text-fg hover:underline" onClick={() => setChapters((c) => new Set([...c].filter((k) => !k.startsWith(`${g.subject}/`))))}>
                            Clear
                          </button>
                        </div>
                        <ul className="grid gap-1 sm:grid-cols-2">
                          {g.chapters.map((c) => (
                            <li key={c.key}>
                              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                                <input
                                  type="checkbox"
                                  className="size-4 accent-current"
                                  checked={chapters.has(c.key)}
                                  onChange={(e) =>
                                    setChapters((set) => {
                                      const next = new Set(set);
                                      if (e.target.checked) next.add(c.key);
                                      else next.delete(c.key);
                                      return next;
                                    })
                                  }
                                />
                                {c.name}
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-8">
          <div>
            <p className="text-sm font-medium">Length</p>
            <Segmented
              className="mt-3"
              label="Diagnostic length"
              value={length}
              onChange={setLength}
              options={[
                { id: "15", label: "Short · 15" },
                { id: "30", label: "Standard · 30" },
                { id: "45", label: "Long · 45" },
              ]}
            />
          </div>
          <p className="pb-2 text-sm text-fg-muted">Time limit: {minutes} minutes. You can stop and come back.</p>
        </div>

        <div className="space-y-2">
          <PlusNote>We aim for about 30% Easy, 50% Medium and 20% Hard. If a level runs short, the gap goes to the nearest level and the report says so.</PlusNote>
          <PlusNote>The diagnostic, its summary and a basic one-week plan are free. The full chapter breakdown and longer plans are part of Tabby Plus.</PlusNote>
        </div>

        <Button size="lg" pixel onClick={start} disabled={busy || chosen.length === 0} className="w-full sm:w-auto">
          <Icon name="play" className="size-4" /> {busy ? "Preparing…" : "Start the diagnostic"}
        </Button>
        {chosen.length === 0 && <p className="text-sm text-review">Tick at least one chapter you have covered to start.</p>}
        {DATA_SOURCE === "api" && (
          <p className="text-sm text-fg-muted">Took a diagnostic on another device or browser? It can&rsquo;t be linked here yet, so take a short new one to build a plan.</p>
        )}
      </Card>
    </>
  );
}

function InProgress({ phase, onDiscard }: { phase: Extract<Phase, { kind: "diagnostic" }>; onDiscard: () => void }) {
  return (
    <>
      <Eyebrow>Study plan</Eyebrow>
      <h1 className="mt-3 text-4xl font-semibold">Your diagnostic is waiting</h1>
      <Card className="mt-8 flex flex-wrap items-center gap-5 p-6">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {phase.total ? `${phase.done} of ${phase.total} answered` : "In progress"}
          </p>
          <p className="mt-1 text-sm text-fg-muted">Answers are saved as you go. Submit it to see your report.</p>
          {phase.total > 0 && <PixelBar value={phase.done / phase.total} className="mt-3 max-w-sm" label={`${phase.done} of ${phase.total} answered`} />}
        </div>
        <ButtonLink href={`/practice/session/?id=${phase.attemptId}`} size="lg">
          Continue
        </ButtonLink>
      </Card>
      <button type="button" onClick={onDiscard} className="mt-4 text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline">
        Start a different diagnostic
      </button>
    </>
  );
}

/* ================================================================ report */

function BandChip({ band }: { band: ChapterView["band"] }) {
  const tone = band === "weak" ? "border-bad/50 text-bad" : band === "shaky" ? "border-review/50 text-review" : band === "strong" ? "border-ok/50 text-ok" : "border-line text-fg-muted";
  const glyph = band === "weak" ? "▁" : band === "shaky" ? "▃" : band === "strong" ? "▇" : "·";
  return (
    <span title={BAND_COPY[band].help} className={cn("inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium", tone)}>
      <span aria-hidden>{glyph}</span>
      {BAND_COPY[band].label}
    </span>
  );
}

function ChapterLine({ c }: { c: ChapterView }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <span aria-hidden className={cn("size-2 shrink-0", SUBJECT_STYLE[c.subject].bg)} />
      <span className="min-w-0 flex-1 font-medium">{c.name}</span>
      {c.slow && <span className="text-xs text-fg-muted">correct but slow</span>}
      <span className="text-sm tabular-nums text-fg-muted">{c.answered ? `${c.correct} of ${c.answered} correct` : "no answer"}</span>
      <BandChip band={c.band} />
    </li>
  );
}

function ReportBody({ report }: { report: ReportView }) {
  const mix = report.actualMix;
  return (
    <>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {report.subjects.map((x) => (
          <div key={x.subject} className="surface-flat p-4">
            <p className={cn("text-sm font-medium", SUBJECT_STYLE[x.subject].text)}>{x.name}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
              {x.correct}
              <span className="text-base font-normal text-fg-subtle"> / {x.answered + x.skipped}</span>
            </p>
            <p className="text-sm text-fg-muted">
              correct{x.skipped ? ` · ${x.skipped} left blank` : ""}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-fg-muted">
        This test had {mix.easy} Easy, {mix.medium} Medium and {mix.hard} Hard question{mix.hard === 1 ? "" : "s"}.
        {mix.hard === 0 && " Hard problems are still being added, so their share went to Medium."}
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Focus here first</h2>
      {report.focus.length ? (
        <ul className="surface mt-4 divide-y divide-line overflow-hidden p-0">
          {report.focus.map((c) => (
            <ChapterLine key={`${c.subject}/${c.chapter}`} c={c} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-fg-muted">No chapter stood out as weak. The plan will keep everything warm and push difficulty up.</p>
      )}

      <h2 className="mt-10 flex items-center gap-2 text-2xl font-semibold">
        Every chapter <PlusTag />
      </h2>
      {report.chapters ? (
        <ul className="surface mt-4 divide-y divide-line overflow-hidden p-0">
          {report.chapters.map((c) => (
            <ChapterLine key={`${c.subject}/${c.chapter}`} c={c} />
          ))}
        </ul>
      ) : (
        <LockedCard title="The full breakdown is part of Tabby Plus" body="See every chapter you were tested on, with the answers behind each judgement." />
      )}
    </>
  );
}

function PlusTag() {
  return <PlusBadge />;
}

function LockedCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-line-strong p-5">
      <PixelIcon name="lock" className="size-6 text-fg-muted" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-fg-muted">{body}</p>
      </div>
      <ButtonLink href="/pricing/" size="sm">
        See pricing
      </ButtonLink>
    </div>
  );
}

function ReportScreen({ s, report, onPlan, onRestart }: { s: S; report: ReportView; onPlan: () => void; onRestart: () => void }) {
  // Free users get a basic plan inside the server's limits (GET /entitlements); Plus gets every length. The API enforces it.
  const { entitlements: ent } = useAds();
  const maxDays = report.plus ? 14 : (ent?.limits.plan_max_days ?? 7);
  const maxMinutes = report.plus ? 120 : (ent?.limits.plan_max_daily_minutes ?? 60);
  const minuteOptions = (["30", "60", "90", "120"] as const).filter((m) => Number(m) <= maxMinutes);
  const dayOptions = (["7", "14"] as const).filter((d) => Number(d) <= maxDays);
  const [minutes, setMinutes] = useState<"30" | "60" | "90" | "120">(minuteOptions.includes("60") ? "60" : (minuteOptions[0] ?? "30"));
  const [days, setDays] = useState<"7" | "14">(dayOptions.includes("14") ? "14" : "7");
  const [busy, setBusy] = useState(false);
  const [needsPlus, setNeedsPlus] = useState(false);
  const [noDiagnostic, setNoDiagnostic] = useState(false);

  const build = async () => {
    setBusy(true);
    try {
      await createPlan({ dailyMinutes: Number(minutes) as 30 | 60 | 90 | 120, days: Number(days) as 7 | 14 }, s);
      onPlan();
    } catch (e) {
      setBusy(false);
      if (e instanceof PlusRequiredError) setNeedsPlus(true);
      else if (e instanceof DiagnosticMissingError) setNoDiagnostic(true);
      else toast("Couldn't build the plan. Please try again.", { icon: "alert", tone: "warn" });
    }
  };

  return (
    <>
      <Eyebrow>Diagnostic report</Eyebrow>
      <h1 className="mt-3 text-4xl font-semibold">Here&rsquo;s where you stand</h1>
      <p className="mt-3 max-w-2xl text-fg-muted">Based only on this test and your earlier practice. More answers make it sharper; your plan updates as you go.</p>
      <ReportBody report={report} />

      <section aria-labelledby="build-h" className="mt-12">
        <h2 id="build-h" className="flex items-center gap-2 text-2xl font-semibold">
          Build your study plan {!report.plus && <span className="text-sm font-normal text-fg-muted">· free basic plan</span>}
        </h2>
        {!report.plus && !needsPlus && (
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">
            Free study plans run up to {maxDays === 7 ? "1 week" : "2 weeks"} at up to {maxMinutes} minutes a day, using the problems on the free tier. Longer plans,
            longer days and every problem are part of Tabby Plus <PlusTag />.
          </p>
        )}
        {noDiagnostic ? (
          <div role="alert" className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-line-strong p-5">
            <div className="min-w-0 flex-1">
              <p className="font-medium">We can&rsquo;t find your diagnostic on this device</p>
              <p className="text-sm text-fg-muted">It was probably taken on another device or browser. A plan is built from a diagnostic, so take a short new one.</p>
            </div>
            <Button size="sm" onClick={onRestart}>
              Take a new diagnostic
            </Button>
          </div>
        ) : needsPlus ? (
          <LockedCard title="Day-by-day study plans are part of Tabby Plus" body="Your study plan picks practice sessions, specific problems and mistakes to redo, and adjusts after every session." />
        ) : (
          <Card className="mt-4 flex flex-wrap items-end gap-8 p-6">
            <div>
              <p className="text-sm font-medium">Time each day</p>
              <Segmented className="mt-3" label="Minutes a day" value={minutes} onChange={setMinutes} options={minuteOptions.map((m) => ({ id: m, label: `${m} min` }))} />
            </div>
            <div>
              <p className="text-sm font-medium">Length</p>
              <Segmented
                className="mt-3"
                label="Plan length"
                value={days}
                onChange={setDays}
                options={dayOptions.map((d) => ({ id: d, label: d === "7" ? "1 week" : "2 weeks" }))}
              />
            </div>
            <Button size="lg" pixel onClick={build} disabled={busy}>
              {busy ? "Building…" : "Build my plan"}
            </Button>
          </Card>
        )}
      </section>
      <button type="button" onClick={onRestart} className="mt-6 text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline">
        Take a new diagnostic instead
      </button>
    </>
  );
}

/* ================================================================ plan */

const KIND_ICON: Record<ItemView["kind"], IconName> = {
  REVIEW_DIAGNOSTIC: "list",
  PRACTICE: "pencil",
  PROBLEMS: "grid",
  MISTAKES: "target",
  TIMED: "clock",
  CHECKPOINT: "flag",
  READ: "book",
};

function itemTitle(it: ItemView): string {
  const ch = it.chapterName ?? "";
  switch (it.kind) {
    case "REVIEW_DIAGNOSTIC":
      return "Go through your diagnostic answers and solutions";
    case "PRACTICE":
      return `Practise ${ch}`;
    case "PROBLEMS":
      return `Solve ${it.problems?.length ?? 0} problems in ${ch}`;
    case "MISTAKES":
      return `Redo your mistakes in ${ch}`;
    case "TIMED":
      return `Timed drill: ${ch}`;
    case "CHECKPOINT":
      return "Checkpoint test";
    case "READ":
      return `Read the ${ch} guide`;
  }
}

function itemDetail(it: ItemView): string {
  switch (it.kind) {
    case "REVIEW_DIAGNOSTIC":
      return "Read the solution for every question you missed or left blank.";
    case "PRACTICE":
      return `${it.size} questions · Learning mode, with solutions after each answer`;
    case "PROBLEMS":
      return "From the problem library";
    case "MISTAKES":
      return `Up to ${it.size} questions you got wrong before`;
    case "TIMED":
      return `${it.size} questions in ${Math.round((it.timeLimitSec ?? 0) / 60)} minutes. You were right here, just slow.`;
    case "CHECKPOINT":
      return `${it.size} mixed questions, timed. The rest of the plan re-weights from your answers.`;
    case "READ":
      return "";
  }
}

function PlanScreen({ s, plan, report, onChanged, onRestart }: { s: S; plan: PlanView; report: ReportView | null; onChanged: () => void; onRestart: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const all = plan.plan.flatMap((d) => d.items);
  const done = all.filter((i) => i.completedAt).length;
  const today = plan.plan.find((d) => d.index === plan.todayIndex) ?? null;
  const finished = plan.todayIndex >= plan.days;
  const upcoming = plan.plan.filter((d) => d.index > plan.todayIndex);
  const past = plan.plan.filter((d) => d.index < plan.todayIndex);

  const start = async (it: ItemView) => {
    if (plan.locked) return; // lapsed Plus: the API refuses plan sessions; each task offers its free alternative instead
    setBusy(it.key);
    try {
      const href = await startItem(plan, it, s);
      if (href) router.push(href);
      else {
        setBusy(null);
        onChanged();
      }
    } catch (e) {
      setBusy(null);
      if (e instanceof PlusRequiredError) router.push(routes.pricing(routes.studyPlan));
      else toast(e instanceof Error ? e.message : "Couldn't start that.", { icon: "alert", tone: "warn" });
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow className="flex items-center gap-2">
            Study plan <PlusTag />
          </Eyebrow>
          <h1 className="mt-3 text-4xl font-semibold">{finished ? "Study plan complete" : `Day ${plan.todayIndex + 1} of ${plan.days}`}</h1>
          <p className="mt-2 text-fg-muted">
            {plan.dailyMinutes} minutes a day · started {formatDate(plan.startsOn)}
          </p>
        </div>
        <div className="min-w-56">
          <p className="text-sm text-fg-muted">
            {done} of {all.length} tasks done
          </p>
          <PixelBar value={all.length ? done / all.length : 0} className="mt-2" label={`${done} of ${all.length} tasks done`} />
        </div>
      </div>

      {plan.locked && (
        <div role="note" className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-line-strong p-5">
          <PixelIcon name="lock" className="size-6 text-fg-muted" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Your Plus access has ended</p>
            <p className="text-sm text-fg-muted">
              Your study plan and its progress are kept exactly as they were. Plan sessions (checkpoints, plan-tracked practice and the diagnostic review) are part of Plus. Chapter practice stays free, so each task below links to it where it can.
            </p>
          </div>
          <ButtonLink href={routes.pricing(routes.studyPlan)} size="sm">
            Renew Plus
          </ButtonLink>
        </div>
      )}

      {finished ? (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
          <TabbyMascot state="idle" className="h-16 text-fg-subtle" />
          <p className="mt-4 font-medium">You reached the end of this plan</p>
          <p className="mt-1 text-sm text-fg-muted">Take a new diagnostic to see what changed and get the next plan.</p>
          <Button className="mt-5" onClick={onRestart}>
            New diagnostic
          </Button>
        </div>
      ) : (
        today && (
          <section aria-labelledby="today-h" className="mt-10">
            <h2 id="today-h" className="text-2xl font-semibold">
              Today <span className="text-base font-normal text-fg-muted">· {formatDate(today.date)}</span>
            </h2>
            {today.items.length === 0 || today.light ? (
              <p className="mt-3 text-fg-muted">A light day: nothing new is due. Pick anything from the problem library if you have time.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {today.items.map((it) => (
                  <ItemCard key={it.key} it={it} s={s} busy={busy === it.key} onStart={() => start(it)} locked={plan.locked} alt={plan.locked ? freeAlternative(it, plan) : null} prominent />
                ))}
              </ul>
            )}
          </section>
        )
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="next-h" className="mt-12">
          <h2 id="next-h" className="text-xl font-semibold">
            Coming up
          </h2>
          <p className="mt-1 text-sm text-fg-muted">These adjust to how today goes. Finished days stay as they were.</p>
          <ol className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {upcoming.map((d) => (
              <li key={d.index} className="grid gap-2 px-4 py-3 sm:grid-cols-[7rem_1fr] sm:px-5">
                <span className="text-sm text-fg-muted">
                  <span className="font-medium text-fg">Day {d.index + 1}</span> · {formatDate(d.date, true)}
                </span>
                {d.light ? (
                  <span className="text-sm text-fg-muted">Light day</span>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {d.items.map((it) => (
                      <li key={it.key} className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-sm">
                        <Icon name={KIND_ICON[it.kind]} className="size-3.5 text-fg-muted" />
                        {it.subject && <span aria-hidden className={cn("size-1.5", SUBJECT_STYLE[it.subject].bg)} />}
                        <span className="max-w-64 truncate">{shortTitle(it)}</span>
                        <span className="tabular-nums text-fg-subtle">{it.minutes}m</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {past.length > 0 && (
        <details className="group mt-10">
          <summary className="cursor-pointer text-sm text-fg-muted hover:text-fg">Earlier days ({past.length})</summary>
          <ol className="mt-3 divide-y divide-line rounded-2xl border border-line">
            {past.map((d) => (
              <li key={d.index} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="w-24 text-fg-muted">Day {d.index + 1}</span>
                <span>
                  {d.items.filter((i) => i.completedAt).length} of {d.items.length} done
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {report && (
        <section className="mt-12">
          <button type="button" aria-expanded={showReport} onClick={() => setShowReport((x) => !x)} className="flex items-center gap-2 text-sm font-medium text-fg-muted hover:text-fg">
            <Icon name="chevronRight" className={cn("size-4 transition-transform motion-reduce:transition-none", showReport && "rotate-90")} /> Diagnostic report
          </button>
          {showReport && <ReportBody report={report} />}
        </section>
      )}

      <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-line pt-6 text-sm text-fg-muted">
        <span>The plan uses only problems and sessions on Tabby, and it never predicts a rank or score.</span>
        <button type="button" onClick={onRestart} className="underline-offset-2 hover:text-fg hover:underline">
          Start over with a new diagnostic
        </button>
      </div>
    </>
  );
}

function shortTitle(it: ItemView) {
  if (it.kind === "CHECKPOINT") return "Checkpoint test";
  if (it.kind === "REVIEW_DIAGNOSTIC") return "Review diagnostic";
  const verb = { PRACTICE: "Practise", PROBLEMS: "Problems", MISTAKES: "Mistakes", TIMED: "Timed", READ: "Read" }[it.kind];
  return `${verb} · ${it.chapterName ?? ""}`;
}

function formatDate(d: string, short = false) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", short ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short" });
}

/** What a lapsed-Plus student can still do for a task. Chapter practice, the problem library, their mistakes and their own results are free. */
function freeAlternative(it: ItemView, plan: PlanView): { href: string; label: string } | null {
  const track = trackOf(plan.exam);
  switch (it.kind) {
    case "PRACTICE":
      return it.subject && it.chapter ? { href: routes.chapterPractise(track, it.subject, it.chapter), label: "Practise this chapter" } : null;
    case "TIMED":
      return it.subject && it.chapter ? { href: routes.chapterPractise(track, it.subject, it.chapter, { timed: true }), label: "Timed practice for this chapter" } : null;
    case "MISTAKES":
      return { href: routes.mistakes, label: "Open your mistakes" };
    case "PROBLEMS":
      return { href: `${routes.allQuestions}#library`, label: "Open the problem library" };
    case "REVIEW_DIAGNOSTIC":
      return { href: routes.results(plan.diagnosticAttemptId), label: "Review your diagnostic" };
    default:
      return null;
  }
}

function ItemCard({ it, s, busy, onStart, locked, alt = null, prominent }: { it: ItemView; s: S; busy: boolean; onStart: () => void; locked: boolean; alt?: { href: string; label: string } | null; prominent?: boolean }) {
  const router = useRouter();
  const [opening, setOpening] = useState<number | null>(null);
  const status = it.completedAt ? "done" : it.startedAt ? "started" : "todo";
  const openOne = async (n: number) => {
    setOpening(n);
    try {
      const id = await openProblem(n, s.user.exam, s);
      router.push(`/practice/session/?id=${id}`);
    } catch {
      setOpening(null);
      toast("Couldn't open that problem.", { icon: "alert", tone: "warn" });
    }
  };
  return (
    <li className={cn("surface-flat relative overflow-hidden p-4 sm:p-5", status === "done" && "opacity-70")}>
      {it.subject && <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", SUBJECT_STYLE[it.subject].bg)} />}
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2">
          <Icon name={KIND_ICON[it.kind]} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium", prominent && "text-lg")}>{itemTitle(it)}</p>
          <p className="mt-0.5 text-sm text-fg-muted">{itemDetail(it)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {it.difficulty && <DifficultyChip difficulty={it.difficulty} />}
            <span className="text-xs tabular-nums text-fg-muted">about {it.minutes} min</span>
          </div>
        </div>
        {status === "done" ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-ok">
            <PixelIcon name="check" className="size-4" /> Done
          </span>
        ) : locked ? (
          alt ? (
            <ButtonLink href={alt.href} size="sm" variant="secondary">
              {alt.label}
            </ButtonLink>
          ) : (
            <span className="text-sm text-fg-muted">Part of Plus</span>
          )
        ) : it.kind === "PROBLEMS" && status === "started" ? null : (
          <Button size="sm" variant={status === "started" ? "secondary" : "primary"} onClick={onStart} disabled={busy}>
            {busy ? "Opening…" : status === "started" ? "Continue" : "Start"}
          </Button>
        )}
      </div>
      {it.kind === "PROBLEMS" && status !== "todo" && it.problems && (
        <ul className="mt-4 flex flex-wrap gap-2 pl-14">
          {it.problems.map((n) => (
            <li key={n}>
              <Button size="sm" variant="secondary" onClick={() => openOne(n)} disabled={opening !== null}>
                {opening === n ? "Opening…" : formatNumber(n)}
              </Button>
            </li>
          ))}
          <li>
            <Link href="/practice/#library" className="inline-flex h-9 items-center px-2 text-sm text-fg-muted hover:text-fg">
              Open the library
            </Link>
          </li>
        </ul>
      )}
    </li>
  );
}

"use client";

import { AdSlot } from "@/components/ads/AdSlot";
import { PremiumUpgradePrompt } from "@/components/billing/PremiumUpgradePrompt";
import { PaperAnalysis } from "./PaperAnalysis";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DemoRequired } from "@/components/app/DemoGate";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { QuestionBody } from "@/components/practice/QuestionBody";
import { DifficultyChip, SourceTag } from "@/components/ui/Badges";
import { SolutionPanel } from "@/components/practice/SolutionPanel";
import { formatClock } from "@/components/practice/useAttemptClock";
import { RichText } from "@/components/content/RichText";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Bar, Card, Eyebrow, PageSkeleton, Ring, Segmented } from "@/components/ui/Primitives";
import { DemoBadge } from "@/components/app/ModeBadge";
import { cn } from "@/lib/cn";
import { catalog } from "@/lib/data/catalog";
import { formatDuration, relativeDay } from "@/lib/demo/dates";
import { keyLabel, responseLabel, scoreAttempt, type Outcome } from "@/lib/demo/scoring";
import { ensureAttempt, startPaper, startPractice, toggleBookmark, useDemo } from "@/lib/demo/store";
import { toast } from "@/components/ui/Toast";
import { DATA_SOURCE } from "@/lib/site";
import type { Attempt } from "@/lib/demo/types";
import { EXAMS } from "@/lib/exams";
import { routes } from "@/lib/routes";
import { chapterSummary, chaptersToWorkOn } from "@/lib/results/chapters";
import { isDiagnosticAttempt } from "@/lib/plans";
import { SUBJECT_STYLE } from "@/lib/subjects";

type Filter = "all" | "incorrect" | "correct" | "unattempted";

const OUTCOME_META: Record<Outcome, { label: string; cls: string; icon: "check" | "x" | "dots" }> = {
  correct: { label: "Correct", cls: "text-ok", icon: "check" },
  partial: { label: "Partial", cls: "text-review", icon: "check" },
  incorrect: { label: "Incorrect", cls: "text-bad", icon: "x" },
  unattempted: { label: "Not attempted", cls: "text-fg-muted", icon: "dots" },
};

const API = DATA_SOURCE === "api";

export function ResultsPage() {
  const id = useSearchParams().get("id");
  const s = useDemo();
  const a = s && id ? s.attempts[id] : null;
  // API mode: results of a finished session load from the server on reload / another device.
  const [loaded, setLoaded] = useState<string | null>(null);
  const hasUser = Boolean(s?.user);
  useEffect(() => {
    if (!API || !id || !hasUser || a) return;
    let live = true;
    void ensureAttempt(id).finally(() => live && setLoaded(id));
    return () => {
      live = false;
    };
  }, [id, hasUser, a]);
  if (s === null) return <PageSkeleton />;
  if (!s.user) return <DemoRequired />;
  if (!a && API && id && loaded !== id) return <PageSkeleton />;
  if (!a) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Result not found</h1>
        <ButtonLink href={routes.home} className="mt-6">
          Back to Home
        </ButtonLink>
      </div>
    );
  }
  if (a.status !== "submitted") {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">This attempt is still in progress</h1>
        <p className="mt-2 text-fg-muted">
          Results appear once it has been submitted. If you already submitted, it may still be saving; your answers are kept either way. Open it again to
          {a.mode === "cbt" ? " continue, or submit it." : " continue, or finish it."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <ButtonLink href={a.mode === "cbt" ? routes.cbt(a.id) : routes.session(a.id)}>Resume</ButtonLink>
          <ButtonLink href={routes.home} variant="ghost">
            Back to Home
          </ButtonLink>
        </div>
      </div>
    );
  }
  return <Results attempt={a} bookmarks={s.bookmarks} allAttempts={Object.values(s.attempts)} />;
}

function Results({ attempt: a, bookmarks, allAttempts }: { attempt: Attempt; bookmarks: Record<string, string>; allAttempts: Attempt[] }) {
  const router = useRouter();
  const r = useMemo(() => scoreAttempt(a), [a]);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const isPractice = a.kind === "practice";
  const pct = r.max ? Math.max(0, r.score) / r.max : 0;
  const prev = a.paperId
    ? allAttempts
        .filter((x) => x.paperId === a.paperId && x.status === "submitted" && x.id !== a.id && (x.submittedAt ?? "") < (a.submittedAt ?? ""))
        .sort((x, y) => (y.submittedAt ?? "").localeCompare(x.submittedAt ?? ""))[0]
    : null;
  const prevScore = prev ? scoreAttempt(prev).score : null;

  const rows = a.questionIds
    .map((qid, i) => ({ qid, i, res: r.perQuestion.get(qid)! }))
    .filter((x) => x.res && (filter === "all" || (filter === "incorrect" ? x.res.outcome === "incorrect" || x.res.outcome === "partial" : x.res.outcome === filter)));

  const track = EXAMS[a.exam].track;
  const back = a.paperId
    ? { href: routes.pyqPaperFromSlug(track, a.paperId), label: "Paper" }
    : a.scope?.source === "mistakes"
      ? { href: routes.mistakes, label: "Notebook" }
      : a.kind === "practice"
        ? { href: routes.practice(track), label: "Practice" }
        : { href: routes.progressTests, label: "Progress" };

  // Free, local, and only about THIS attempt: chapters where the most questions were missed.
  const weak = useMemo(() => {
    const items = a.questionIds.flatMap((qid) => {
      const q = catalog.question(qid);
      const res = r.perQuestion.get(qid);
      return q && res ? [{ subject: q.subject, chapter: q.chapter, outcome: res.outcome }] : [];
    });
    return chaptersToWorkOn(items, 3);
  }, [a.questionIds, r]);
  const weakest = weak[0] ?? null;
  const chapterName = (subject: string, chapter: string) => catalog.chapter(subject as never, chapter)?.name ?? chapter.replace(/-/g, " ");

  // Previous / Next through the (filtered) review list; arrows only when focus is not in a field.
  const step = useCallback(
    (dir: 1 | -1) => {
      if (!open) return;
      const idx = rows.findIndex((x) => x.qid === open);
      const next = rows[idx + dir];
      if (!next) return;
      setOpen(next.qid);
      requestAnimationFrame(() =>
        document.getElementById(`rq-${next.qid}`)?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }),
      );
    },
    [open, rows],
  );
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  const [busy, setBusy] = useState(false);
  const launch = async (p: Promise<string>, base: "practice" | "cbt" = "practice") => {
    setBusy(true);
    try {
      const id = await p;
      router.push(base === "cbt" ? `/cbt/?id=${id}` : `/practice/session/?id=${id}`);
    } catch {
      setBusy(false);
      toast("Couldn't start that session. Please try again.", { icon: "alert", tone: "warn" });
    }
  };
  // A retry is always a NEW attempt. In API mode it is a fresh server session with the same scope
  // (the server picks the questions, including ones already solved).
  const retry = (mode: "cbt" | "test") => {
    if (a.paperId) return launch(startPaper(a.paperId, mode, a.id), mode === "cbt" ? "cbt" : "practice");
    return launch(startPractice({ exam: a.exam, mode: "test", title: `${a.title} · retry`, questionIds: a.questionIds, count: a.questionIds.length, includeSolved: true, scope: a.scope, durationSec: a.durationSec }));
  };
  const practiseMistakes = () => {
    const ids = a.questionIds.filter((q) => ["incorrect", "partial"].includes(r.perQuestion.get(q)?.outcome ?? ""));
    if (!ids.length) return;
    return launch(startPractice({ exam: a.exam, mode: "learning", title: `Mistakes from ${a.title}`, questionIds: ids, count: ids.length, scope: { source: "mistakes" } }));
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-fg-muted">
        <Link href={back.href} className="inline-flex min-h-11 items-center hover:text-fg">
          ← {back.label}
        </Link>
      </nav>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>
            {EXAMS[a.exam].name} · {a.mode === "cbt" ? "CBT" : a.mode === "test" ? "Timed test" : "Learning mode"} · {relativeDay(a.submittedAt!)}
          </Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{a.title}</h1>
          {a.retryOf && <p className="mt-1 text-sm text-fg-muted">Retry attempt — your earlier attempt is kept unchanged.</p>}
          {isDiagnosticAttempt(a.id) && (
            <Link href="/plan/" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm font-medium hover:border-fg hover:bg-surface-2">
              See your diagnostic report and plan →
            </Link>
          )}
        </div>
        <div className="flex items-end gap-5">
          {/* Celebrates finishing, not the score: no shame for a low mark. */}
          {r.accuracy !== null && <TabbyMascot state="success" className="hidden h-14 text-fg sm:block" />}
          <DemoBadge>Demo scoring</DemoBadge>
        </div>
      </div>

      {/* Score hero */}
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <Ring value={pct} size={128} stroke={10} label={`Score ${r.score} out of ${r.max}`}>
            <div className="text-center">
              <p className="font-display text-3xl font-semibold tabular-nums">{r.score}</p>
              <p className="text-xs text-fg-muted">of {r.max}</p>
            </div>
          </Ring>
          <div className="flex-1">
            <p className="text-sm text-fg-muted">{isPractice ? "Session score" : "Your score"}</p>
            <p className="mt-1 font-display text-2xl font-semibold">
              {r.accuracy === null ? "Nothing attempted" : `${Math.round(r.accuracy * 100)}% accuracy`}
            </p>
            {prevScore !== null && (
              <p className={cn("mt-1 text-sm", r.score >= prevScore ? "text-ok" : "text-review")}>
                {r.score >= prevScore ? "▲" : "▼"} {Math.abs(r.score - prevScore)} marks vs your previous attempt
              </p>
            )}
            <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
              {[
                ["Correct", r.correct, "text-ok"],
                ["Incorrect", r.incorrect, "text-bad"],
                ["Partial", r.partial, "text-review"],
                ["Skipped", r.unattempted, "text-fg-muted"],
              ].map(([k, v, c]) => (
                <div key={k as string} className="rounded-lg bg-surface-2 py-2">
                  <dd className={cn("font-display text-xl font-semibold tabular-nums", c as string)}>{v}</dd>
                  <dt className="text-[0.68rem] text-fg-muted">{k}</dt>
                </div>
              ))}
            </dl>
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-sm font-medium">By section</p>
          <ul className="mt-4 space-y-4">
            {r.sections.map((s) => (
              <li key={s.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className={SUBJECT_STYLE[s.subject as keyof typeof SUBJECT_STYLE]?.text}>{s.name}</span>
                  <span className="tabular-nums text-fg-muted">
                    <span className="font-medium text-fg">{s.score}</span>/{s.max}
                  </span>
                </div>
                <Bar value={s.max ? Math.max(0, s.score) / s.max : 0} className="mt-1.5" colorClass={SUBJECT_STYLE[s.subject as keyof typeof SUBJECT_STYLE]?.bg} label={`${s.name} score`} />
                <p className="mt-1 text-xs text-fg-muted">
                  {s.correct} correct · {s.incorrect} incorrect · {s.unattempted} skipped
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-5 flex items-center gap-1.5 border-t border-line pt-4 text-xs text-fg-muted">
            <Icon name="clock" className="size-3.5" /> Time spent {formatDuration(r.timeSec)}
            {a.durationSec ? ` of ${formatDuration(a.durationSec)}` : ""}
          </p>
        </Card>
      </div>

      {/* Chapters to work on: computed here from this attempt's own responses, so free users get it too */}
      {weak.length > 0 && (
        <section aria-labelledby="weak-h" className="mt-4">
          <Card className="p-6">
            <h2 id="weak-h" className="text-sm font-medium">
              Chapters to work on
            </h2>
            <p className="mt-1 text-xs text-fg-muted">Based on this attempt only: wrong and unanswered questions per chapter.</p>
            <ul className="mt-4 divide-y divide-line">
              {weak.map((w) => (
                <li key={`${w.subject}/${w.chapter}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium", SUBJECT_STYLE[w.subject as keyof typeof SUBJECT_STYLE]?.text)}>{chapterName(w.subject, w.chapter)}</p>
                    <p className="text-xs tabular-nums text-fg-muted">{chapterSummary(w)}</p>
                  </div>
                  <Link href={routes.chapterPractise(track, w.subject, w.chapter)} className="inline-flex min-h-11 items-center text-sm font-medium hover:underline">
                    Practise <span className="sr-only">{chapterName(w.subject, w.chapter)}</span> &rarr;
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* Next actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {weakest && (
          <ButtonLink href={routes.chapterPractise(track, weakest.subject, weakest.chapter)}>
            <Icon name="target" className="size-4" /> Practise {chapterName(weakest.subject, weakest.chapter)}
          </ButtonLink>
        )}
        {a.kind === "paper" && a.mode !== "cbt" && (
          <Button pixel disabled={busy} onClick={() => retry("cbt")}>
            <Icon name="monitor" className="size-4" /> Retry in exam-style CBT
          </Button>
        )}
        {a.kind === "paper" && a.mode === "cbt" && (
          <Button pixel disabled={busy} onClick={() => retry("cbt")}>
            <Icon name="rotate" className="size-4" /> Retry this paper
          </Button>
        )}
        {a.kind === "practice" && (
          <Button variant="secondary" disabled={busy} onClick={() => retry("test")}>
            <Icon name="rotate" className="size-4" /> Retry as a timed test
          </Button>
        )}
        {r.incorrect + r.partial > 0 && (
          <Button variant="secondary" disabled={busy} onClick={practiseMistakes}>
            <Icon name="target" className="size-4" /> Practise the {r.incorrect + r.partial} you missed
          </Button>
        )}
        {a.kind === "paper" && (
          <ButtonLink href={routes.pyq(track)} variant="ghost">
            Back to PYQs
          </ButtonLink>
        )}
        <ButtonLink href={routes.home} variant="ghost">
          Home
        </ButtonLink>
        <p className="w-full text-xs text-fg-muted">
          Retrying always creates a new attempt. This result stays in your history.
          {API && " Retries pick fresh questions from the same scope."}
        </p>
      </div>

      {/* Plus: chapter, time and attempt-vs-attempt analysis (API papers only; the server enforces Plus) */}
      {API && a.kind === "paper" && !a.local && <PaperAnalysis sessionId={a.id} />}

      {/* Question review */}
      <section aria-labelledby="review-h" className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="review-h" className="text-xl font-semibold">
            Review every question
          </h2>
          <Segmented
            label="Filter questions"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: `All ${a.questionIds.length}` },
              { id: "incorrect", label: `Wrong ${r.incorrect + r.partial}` },
              { id: "correct", label: `Right ${r.correct}` },
              { id: "unattempted", label: `Skipped ${r.unattempted}` },
            ]}
          />
        </div>
        {rows.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
            <TabbyMascot state="curious" className="h-14 text-fg-subtle" />
            <p className="mt-4 text-sm text-fg-muted">Nothing in this filter.</p>
          </div>
        ) : (
          <ol className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {rows.map(({ qid, i, res }) => {
              const q = catalog.question(qid)!;
              const sol = catalog.solution(qid);
              const meta = OUTCOME_META[res.outcome];
              const isOpen = open === qid;
              return (
                <li key={qid} id={`rq-${qid}`} className="scroll-mt-20">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : qid)}
                    aria-expanded={isOpen}
                    className="flex w-full items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-2 sm:px-5"
                  >
                    <span className="w-8 shrink-0 pt-0.5 font-pixel text-[0.65rem] tabular-nums text-fg-subtle">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm leading-relaxed text-fg-soft">
                        <RichText value={q.stem} inline />
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className={cn("inline-flex items-center gap-1 font-medium", meta.cls)}>
                          <Icon name={meta.icon} className="size-3.5" /> {meta.label}
                        </span>
                        <span className="text-fg-muted">
                          You: <span className="font-mono text-fg-soft">{responseLabel(q, a.responses[qid]?.answer)}</span>
                        </span>
                        <span className="text-fg-muted">
                          Key: <span className="font-mono text-fg-soft">{keyLabel(sol)}</span>
                        </span>
                        <span className="tabular-nums text-fg-muted">{res.marks > 0 ? `+${res.marks}` : res.marks} marks</span>
                        <span className="tabular-nums text-fg-muted">{formatClock(res.timeSec)}</span>
                      </span>
                    </span>
                    <Icon name="chevronDown" className={cn("mt-1 size-4 shrink-0 text-fg-muted transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="rise space-y-5 border-t border-line bg-bg/40 px-4 py-5 sm:px-5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                        <span className="font-pixel text-[0.65rem] tabular-nums text-fg-subtle">Q{i + 1}</span>
                        <span className={SUBJECT_STYLE[q.subject]?.text}>{catalog.subject(q.subject)?.name ?? q.subject}</span>
                        <span aria-hidden>·</span>
                        <span>{chapterName(q.subject, q.chapter)}</span>
                        {q.difficulty && <DifficultyChip difficulty={q.difficulty} />}
                      </div>
                      <SourceTag source={q.source} />
                      <QuestionBody question={q} answer={a.responses[qid]?.answer ?? null} disabled solution={sol} />
                      <SolutionPanel question={q} solution={sol} />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" aria-pressed={Boolean(bookmarks[qid])} onClick={() => void toggleBookmark(qid)}>
                          <Icon name="bookmark" className={cn("size-4", bookmarks[qid] && "fill-current")} /> {bookmarks[qid] ? "Bookmarked" : "Bookmark"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => launch(startPractice({ exam: a.exam, mode: "learning", title: "Single question", questionIds: [qid], scope: { source: "single" } }))}
                        >
                          <Icon name="rotate" className="size-4" /> Try again
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
                        <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-0" disabled={rows[0]?.qid === qid} onClick={() => step(-1)}>
                          &larr; Previous
                        </Button>
                        <p className="text-xs text-fg-muted" aria-live="polite">
                          {rows.findIndex((x) => x.qid === qid) + 1} of {rows.length}
                          <span className="hidden sm:inline"> · left and right arrow keys also work</span>
                        </p>
                        <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-0" disabled={rows[rows.length - 1]?.qid === qid} onClick={() => step(1)}>
                          Next &rarr;
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <div className="mt-10">
        <PremiumUpgradePrompt context="results" />
      </div>
      {/* After the whole review (never between a question and its solution). */}
      <AdSlot placement="results-bottom" />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DemoRequired } from "@/components/app/DemoGate";
import { Kitty } from "@/components/brand/Kitty";
import { QuestionBody } from "@/components/practice/QuestionBody";
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
import { answerLabel, keyLabel, scoreAttempt, type Outcome } from "@/lib/demo/scoring";
import { ensureAttempt, startPaper, startPractice, toggleBookmark, useDemo } from "@/lib/demo/store";
import { toast } from "@/components/ui/Toast";
import { DATA_SOURCE } from "@/lib/site";
import type { Attempt } from "@/lib/demo/types";
import { EXAMS } from "@/lib/exams";
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
        <ButtonLink href="/dashboard/" className="mt-6">
          Back to dashboard
        </ButtonLink>
      </div>
    );
  }
  if (a.status !== "submitted") {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">This attempt is still in progress</h1>
        <p className="mt-2 text-fg-muted">Results appear once it&rsquo;s submitted.</p>
        <ButtonLink href={a.mode === "cbt" ? `/cbt/?id=${a.id}` : `/practice/session/?id=${a.id}`} className="mt-6">
          Resume
        </ButtonLink>
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
        <Link href={a.paperId ? `/tests/${a.paperId}/` : "/practice/"} className="hover:text-fg">
          ← {a.paperId ? "Paper details" : "Practice"}
        </Link>
      </nav>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>
            {EXAMS[a.exam].name} · {a.mode === "cbt" ? "CBT" : a.mode === "test" ? "Test mode" : "Learning mode"} · {relativeDay(a.submittedAt!)}
          </Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{a.title}</h1>
          {a.retryOf && <p className="mt-1 text-sm text-fg-muted">Retry attempt — your earlier attempt is kept unchanged.</p>}
        </div>
        <DemoBadge>Demo scoring</DemoBadge>
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

      {/* Next actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
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
            <Icon name="rotate" className="size-4" /> Retry as a test
          </Button>
        )}
        {r.incorrect + r.partial > 0 && (
          <Button variant="secondary" disabled={busy} onClick={practiseMistakes}>
            <Icon name="target" className="size-4" /> Practise the {r.incorrect + r.partial} you missed
          </Button>
        )}
        <ButtonLink href="/dashboard/" variant="ghost">
          Back to dashboard
        </ButtonLink>
        <p className="w-full text-xs text-fg-muted">
          Retrying always creates a new attempt. This result stays in your history.
          {API && " Retries pick fresh questions from the same scope."}
        </p>
      </div>

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
            <Kitty pose="sleep" className="h-14 w-auto text-fg-subtle" />
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
                <li key={qid}>
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
                          You: <span className="font-mono text-fg-soft">{answerLabel(q, a.responses[qid]?.answer)}</span>
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
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResponseValue } from "@/contracts";
import { RichText } from "@/components/content/RichText";
import { DifficultyChip, SourceTag, SubjectTag, TypeChip, VerificationBadge } from "@/components/ui/Badges";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Dialog, Kbd } from "@/components/ui/Primitives";
import { DemoBadge } from "@/components/app/ModeBadge";
import { LoadingScreen, SESSION_MESSAGES } from "@/components/states/Loading";
import { cn } from "@/lib/cn";
import { catalog } from "@/lib/data/catalog";
import { isAnswered, outcomeFor } from "@/lib/demo/scoring";
import { checkAnswer, ensureAttempt, publicSlugForQuestion, setCurrent, setResponse, singleQuestionId, startSingleBySlug, submitAttempt, toggleBookmark, toggleReview, usePending, useSubmitState, useDemo } from "@/lib/demo/store";
import { DATA_SOURCE } from "@/lib/site";
import type { Attempt, DemoState } from "@/lib/demo/types";
import { SUBJECT_STYLE } from "@/lib/subjects";
import { QuestionBody } from "./QuestionBody";
import { ReportDialog } from "./ReportDialog";
import { SolutionPanel } from "./SolutionPanel";
import { Calculator, Scratchpad } from "./Tools";
import { formatClock, isTypingTarget, useAttemptClock } from "./useAttemptClock";
import { DemoRequired } from "@/components/app/DemoGate";
import { AdSlot } from "@/components/ads/AdSlot";

const API = DATA_SOURCE === "api";

export function PracticeSession() {
  const id = useSearchParams().get("id");
  const s = useDemo();
  const router = useRouter();
  const a = s && id ? s.attempts[id] : null;
  // API mode: a reload, deep link or second device loads the session from the server.
  const [loaded, setLoaded] = useState<string | null>(null);
  const hasUser = Boolean(s?.user);
  const signedOut = s !== null && !s.user;
  const userExam = s?.user?.exam;
  // A single-question session lives only in the browser that started it. Its link (copied, shared, opened elsewhere)
  // still names the question: a visitor gets the free public page, a signed-in student a fresh attempt at it.
  const singleQ = id ? singleQuestionId(id) : null;
  const [shared, setShared] = useState<"members" | "error" | null>(null);
  useEffect(() => {
    if (!API || !singleQ || !signedOut) return;
    let live = true;
    publicSlugForQuestion(singleQ)
      .then((slug) => {
        if (!live) return;
        if (slug) router.replace(`/jee/questions/${slug}/`);
        else setShared("members");
      })
      .catch(() => live && setShared("error"));
    return () => {
      live = false;
    };
  }, [singleQ, signedOut, router]);
  useEffect(() => {
    if (!API || !id || !hasUser || a) return;
    let live = true;
    if (singleQ && userExam) {
      publicSlugForQuestion(singleQ)
        .catch(() => null)
        .then((slug) => startSingleBySlug(slug ?? singleQ, userExam))
        .then((fresh) => live && router.replace(`/practice/session/?id=${fresh}`))
        .catch(() => live && setLoaded(id));
    } else {
      void ensureAttempt(id).finally(() => live && setLoaded(id));
    }
    return () => {
      live = false;
    };
  }, [id, hasUser, a, singleQ, userExam, router]);

  useEffect(() => {
    if (a?.status === "submitted") router.replace(`/results/?id=${a.id}`);
    else if (a?.mode === "cbt") router.replace(`/cbt/?id=${a.id}`);
  }, [a?.status, a?.mode, a?.id, router]);

  if (s === null) return <SessionLoading />;
  if (!s.user) {
    if (!API || !singleQ || shared === "error") return <DemoRequired />;
    return shared === "members" ? <MembersQuestion /> : <LoadingScreen messages={SESSION_MESSAGES} label="Opening the question" />;
  }
  if (!a && API && id && loaded !== id) return <LoadingScreen messages={SESSION_MESSAGES} label="Loading your practice session" />;
  if (!a) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Session not found</h1>
        <p className="mt-2 text-fg-muted">It may have been discarded, or it was started on another device.</p>
        <ButtonLink href="/practice/" className="mt-6">
          Start a new session
        </ButtonLink>
      </div>
    );
  }
  if (a.status === "submitted" || a.mode === "cbt") return <SessionLoading />;
  return <Player key={a.id} attempt={a} state={s} />;
}

/**
 * A shared link to a question that has no free public page: practice questions whose answer is AI-checked rather than
 * matched to an official key are shown to signed-in students only. Say so plainly and offer the free questions.
 */
function MembersQuestion() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const here = `${path}${search ? `?${search}` : ""}`;
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <h1 className="text-3xl font-semibold">This question needs a free account</h1>
      <p className="mt-3 text-fg-muted">
        It&rsquo;s a practice question whose answer was checked by AI, not matched to an official NTA answer key, so we show it to
        signed-in students only. Thousands of previous-year questions with official answers are free to practise without signing up.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/jee/" size="lg" pixel>
          Practise free PYQs
        </ButtonLink>
        <ButtonLink href={`/login/?next=${encodeURIComponent(here)}`} size="lg" variant="secondary">
          Log in
        </ButtonLink>
        <ButtonLink href="/signup/" size="lg" variant="ghost">
          Create free account
        </ButtonLink>
      </div>
    </div>
  );
}

/** The focus shell has no navigation, so the full branded loader fits. */
function SessionLoading() {
  return <LoadingScreen messages={SESSION_MESSAGES} label="Loading your practice session" />;
}

type Panel = null | "calc" | "pad";

function Player({ attempt: a, state: s }: { attempt: Attempt; state: DemoState }) {
  const router = useRouter();
  const qid = a.questionIds[a.current];
  const q = catalog.question(qid);
  const resp = a.responses[qid];
  const learning = a.mode === "learning";
  const [panel, setPanel] = useState<Panel>(null);
  const [hintOpen, setHintOpen] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [report, setReport] = useState(false);
  const [announce, setAnnounce] = useState("");
  const clock = useAttemptClock(a.id, qid, a.status === "in_progress");
  const elapsed = a.elapsedSec + clock.unflushed;
  const remaining = a.durationSec ? a.durationSec - elapsed : null;

  useEffect(() => {
    document.body.dataset.shell = "focus";
    return () => {
      delete document.body.dataset.shell;
    };
  }, []);

  const attemptId = a.id;
  const index = a.current;
  const visited = Boolean(resp?.visited);
  useEffect(() => {
    if (!visited) setCurrent(attemptId, index);
  }, [attemptId, index, visited]);

  const go = useCallback((i: number) => setCurrent(a.id, i), [a.id]);
  const submitState = useSubmitState(a.id);
  const finishing = useRef(false);
  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    const ok = await submitAttempt(a.id);
    finishing.current = false;
    if (ok) router.push(`/results/?id=${a.id}`);
  }, [a.id, router]);

  // Timed test: auto-submit when time runs out. Answers are already saved.
  useEffect(() => {
    if (remaining !== null && remaining <= 0) void finish();
  }, [remaining, finish]);

  const checking = usePending(a.id, qid);
  const outcome = q && learning && resp?.checked ? outcomeFor(a, q, resp).outcome : null;

  const onAnswer = (answer: ResponseValue | null) => {
    setResponse(a.id, qid, { answer });
    if (!learning) setAnnounce("Answer saved");
  };

  const check = async () => {
    if (!q || !isAnswered(resp?.answer) || checking) return;
    await checkAnswer(a.id, qid);
    // The outcome comes from the store (the server in API mode) once the check settles.
    setAnnounce("Answer checked. The result and solution are shown below.");
  };

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (!q) return;
      const k = e.key.toLowerCase();
      const optIdx = "1234".indexOf(k) >= 0 ? Number(k) - 1 : "abcd".indexOf(k);
      if (optIdx >= 0 && q.options[optIdx] && !(learning && resp?.checked)) {
        const id = q.options[optIdx].id;
        const cur = new Set(resp?.answer?.optionIds ?? []);
        if (q.type === "multiple_correct") {
          if (cur.has(id)) cur.delete(id);
          else cur.add(id);
          onAnswer(cur.size ? { optionIds: [...cur].sort() } : null);
        } else onAnswer({ optionIds: [id] });
        e.preventDefault();
      } else if (k === "arrowright" || k === "n") go(a.current + 1);
      else if (k === "arrowleft" || k === "p") go(a.current - 1);
      else if (k === "enter" && learning && !resp?.checked) check();
      else if (k === "b") toggleBookmark(qid);
      else if (k === "r" && !learning) setResponse(a.id, qid, { markedForReview: !resp?.markedForReview });
      else if (k === "h" && learning) setHintOpen((h) => ({ ...h, [qid]: true }));
      else if (k === "?") setShortcuts(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!q) return <SessionLoading />;

  const sol = learning && resp?.checked ? catalog.solution(q.id) : null;
  const hint = learning ? catalog.hint(q.id) : null;
  const chapter = catalog.chapter(q.subject, q.chapter);
  const subject = catalog.subject(q.subject);
  const bookmarked = Boolean(s.bookmarks[qid]);
  const inReview = Boolean(s.review[qid]);
  const answeredCount = a.questionIds.filter((id) => isAnswered(a.responses[id]?.answer)).length;
  const checkedCount = a.questionIds.filter((id) => a.responses[id]?.checked).length;
  const correctCount = learning
    ? a.questionIds.filter((id) => {
        const r = a.responses[id];
        const qq = catalog.question(id);
        return r?.checked && qq && outcomeFor(a, qq, r).outcome === "correct";
      }).length
    : 0;
  const last = a.current === a.questionIds.length - 1;
  const done = learning ? checkedCount === a.questionIds.length : false;

  return (
    <div className="min-h-dvh pb-28">
      {/* Focus bar: no site navigation, nothing that competes with the question. */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/practice/" className="-ml-2 grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Leave session (progress is saved)">
            <Icon name="arrowLeft" className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{a.title}</p>
            <p className="truncate text-xs text-fg-muted">
              {learning ? "Learning mode · instant feedback" : "Test mode · answers revealed after you submit"}
            </p>
          </div>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-sm tabular-nums",
              remaining !== null && remaining < 300 ? "border-review/60 text-review" : "border-line text-fg-soft",
            )}
            aria-label={remaining !== null ? `Time remaining ${formatClock(remaining)}` : `Time elapsed ${formatClock(elapsed)}`}
            role="timer"
          >
            <Icon name="clock" className="size-3.5" />
            {formatClock(remaining ?? elapsed)}
          </div>
          <Button size="sm" variant={done || (!learning && last) ? "primary" : "secondary"} onClick={() => (learning ? void finish() : setConfirm(true))}>
            {learning ? "Finish" : "Submit"}
          </Button>
        </div>
        <div className="h-0.5 bg-surface-3">
          <div className="h-full bg-fg transition-[width] duration-300" style={{ width: `${((learning ? checkedCount : answeredCount) / a.questionIds.length) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <main id="main" className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-pixel text-xs text-fg-muted">
              Q{String(a.current + 1).padStart(2, "0")}
              <span className="text-fg-subtle">/{String(a.questionIds.length).padStart(2, "0")}</span>
            </span>
            {subject && <SubjectTag subject={subject.id} label={subject.name} />}
            <TypeChip type={q.type} />
            {q.difficulty && <DifficultyChip difficulty={q.difficulty} />}
            <SourceTag source={q.source} />
            {!API && <VerificationBadge status={q.verification.status} note={q.verification.note} />}
          </div>
          {chapter && <p className={cn("mt-2 text-sm", SUBJECT_STYLE[q.subject].text)}>{chapter.name}</p>}

          <div className="rise mt-5" key={qid}>
            <QuestionBody question={q} answer={resp?.answer ?? null} onChange={onAnswer} disabled={Boolean(resp?.checked)} solution={sol} numberLabel={`Question ${a.current + 1}`} />
          </div>

          {learning && resp?.checked && outcome && (
            <div
              role="status"
              className={cn(
                "pop mt-6 flex items-center gap-3 rounded-xl border px-4 py-3",
                outcome === "correct" ? "border-ok/50 bg-ok/[0.07]" : outcome === "partial" ? "border-review/50 bg-review/[0.07]" : "border-bad/50 bg-bad/[0.07]",
              )}
            >
              <span className={cn("grid size-8 place-items-center rounded-full text-bg", outcome === "correct" ? "bg-ok" : outcome === "partial" ? "bg-review" : "bg-bad")}>
                <Icon name={outcome === "correct" ? "check" : "x"} className="size-4" />
              </span>
              <div className="text-sm">
                <p className="font-medium">{outcome === "correct" ? "Correct" : outcome === "partial" ? "Partially correct" : "Not quite"}</p>
                <p className="text-fg-muted">
                  {outcome === "correct" ? "+10 XP" : outcome === "partial" ? "Some correct options are missing. +5 XP" : "Added to your mistake notebook. Read the solution, then try a similar one."}
                </p>
              </div>
            </div>
          )}

          {learning && hint && !resp?.checked && hintOpen[qid] && (
            <aside aria-label="Hint" className="rise mt-6 rounded-xl border border-info/40 bg-info/[0.06] p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-info">
                <Icon name="bulb" className="size-4" /> Hint · AI-generated, may be imperfect
              </p>
              <div className="mt-2 text-sm leading-relaxed text-fg-soft">
                <RichText value={hint.body} />
              </div>
            </aside>
          )}

          {sol !== null && (
            <div className="rise mt-6">
              <SolutionPanel question={q} solution={sol} />
            </div>
          )}
          {learning && resp?.checked && !q.hasSolution && <p className="mt-6 text-sm text-fg-muted">A worked solution for this question isn&rsquo;t available yet.</p>}

          <div className="mt-6 flex flex-wrap items-center gap-1.5 border-t border-line pt-4">
            <ToolButton icon="bookmark" label={bookmarked ? "Bookmarked" : "Bookmark"} active={bookmarked} onClick={() => toggleBookmark(qid)} shortcut="B" />
            <ToolButton icon="flag" label={inReview ? "In review list" : "Review later"} active={inReview} onClick={() => toggleReview(qid)} />
            {learning && hint && !resp?.checked && <ToolButton icon="bulb" label="Hint" active={hintOpen[qid]} onClick={() => setHintOpen((h) => ({ ...h, [qid]: !h[qid] }))} shortcut="H" />}
            <ToolButton icon="calculator" label="Calculator" active={panel === "calc"} onClick={() => setPanel((p) => (p === "calc" ? null : "calc"))} />
            <ToolButton icon="pencil" label="Scratchpad" active={panel === "pad"} onClick={() => setPanel((p) => (p === "pad" ? null : "pad"))} />
            <ToolButton icon="alert" label="Report" onClick={() => setReport(true)} />
            <ToolButton icon="keyboard" label="Shortcuts" onClick={() => setShortcuts(true)} shortcut="?" className="ml-auto hidden sm:inline-flex" />
          </div>

          {/* Free plan: one quiet unit below the tools, untimed sessions only. Mounted once per session, so it does
              not reload on every question. Never between options or inside the solution. */}
          {remaining === null && <AdSlot placement="question-bottom" className="mt-10" />}
        </main>

        <aside className="hidden lg:block" aria-label="Session overview">
          <div className="sticky top-20 space-y-4">
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium">Questions</p>
                <p className="text-xs tabular-nums text-fg-muted">
                  {learning ? `${checkedCount}/${a.questionIds.length} checked` : `${answeredCount}/${a.questionIds.length} answered`}
                </p>
              </div>
              <Navigator attempt={a} onGo={go} />
              <Legend learning={learning} />
            </div>
            {learning ? (
              <div className="rounded-xl border border-line bg-surface p-4 text-sm">
                <p className="text-fg-muted">Score so far</p>
                <p className="mt-1 font-display text-3xl font-semibold tabular-nums">
                  {correctCount}
                  <span className="text-lg text-fg-subtle">/{checkedCount}</span>
                </p>
                <p className="mt-1 text-xs text-fg-muted">Correct answers out of those checked so far.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-surface p-4 text-sm text-fg-muted">
                <p>Answers save as you go. Hints and solutions unlock after you submit.</p>
              </div>
            )}
            <p className="flex items-center gap-2 text-xs text-fg-muted">
              {API ? (
                learning ? (
                  "Checked answers are saved to your account"
                ) : (
                  "Unsent answers are saved on this device until you submit"
                )
              ) : (
                <>
                  <DemoBadge /> Progress saved on this device
                </>
              )}
            </p>
          </div>
        </aside>
      </div>

      {/* Sticky action bar: primary action always in the same place. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur-md">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Button variant="secondary" onClick={() => go(a.current - 1)} disabled={a.current === 0} aria-label="Previous question">
            <Icon name="chevronLeft" className="size-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <MobileNavigator attempt={a} onGo={go} />
          {(!learning || !resp?.checked) && isAnswered(resp?.answer) && (
            <Button variant="ghost" onClick={() => setResponse(a.id, qid, { answer: null })} className="hidden sm:inline-flex">
              Clear
            </Button>
          )}
          {!learning && (
            <Button variant="ghost" aria-pressed={Boolean(resp?.markedForReview)} onClick={() => setResponse(a.id, qid, { markedForReview: !resp?.markedForReview })} className={cn(resp?.markedForReview && "text-review")}>
              <Icon name="flag" className="size-4" />
              <span className="hidden sm:inline">{resp?.markedForReview ? "Marked" : "Mark for review"}</span>
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {learning && !resp?.checked ? (
              <Button pixel onClick={check} disabled={!isAnswered(resp?.answer) || checking} className="min-w-36">
                {checking ? "Checking…" : "Check answer"}
              </Button>
            ) : last ? (
              <Button pixel onClick={() => (learning ? void finish() : setConfirm(true))} className="min-w-36">
                {learning ? "Finish session" : "Submit test"}
              </Button>
            ) : (
              <Button pixel onClick={() => go(a.current + 1)} className="min-w-36">
                {learning ? "Next question" : "Save & next"} <Icon name="chevronRight" className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {panel === "calc" && <Calculator onClose={() => setPanel(null)} />}
      {panel === "pad" && <Scratchpad padKey={`${a.id}:${qid}`} onClose={() => setPanel(null)} />}

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Submit this test?">
        <SubmitSummary attempt={a} />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Keep working
          </Button>
          <Button
            onClick={() => {
              setConfirm(false);
              void finish();
            }}
          >
            Submit
          </Button>
        </div>
      </Dialog>
      <Dialog open={Boolean(submitState && submitState.phase !== "done")} onClose={() => undefined} title={submitState?.phase === "paused" ? "Submission paused" : "Submitting your answers"}>
        {submitState && (
          <div className="text-sm" role="status" aria-live="polite">
            <p className="font-medium tabular-nums">
              Submitting {submitState.done}/{submitState.total}
            </p>
            <p className="mt-2 text-fg-muted">{submitState.message ?? "Please keep this tab open."}</p>
            {submitState.phase === "paused" && (
              <div className="mt-5 flex justify-end">
                <Button onClick={() => void finish()}>Retry</Button>
              </div>
            )}
          </div>
        )}
      </Dialog>
      <Dialog open={shortcuts} onClose={() => setShortcuts(false)} title="Keyboard shortcuts">
        <ShortcutList learning={learning} />
      </Dialog>
      <ReportDialog open={report} onClose={() => setReport(false)} questionId={q.id} />
    </div>
  );
}

function ToolButton({ icon, label, active, onClick, shortcut, className }: { icon: IconName; label: string; active?: boolean; onClick: () => void; shortcut?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn("inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors", active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg", className)}
    >
      <Icon name={icon} className={cn("size-4", active && icon === "bookmark" && "fill-current")} />
      {label}
    </button>
  );
}

function statusOf(a: Attempt, id: string) {
  const r = a.responses[id];
  if (a.mode === "learning") {
    if (r?.checked) {
      const q = catalog.question(id)!;
      const o = outcomeFor(a, q, r).outcome;
      return o === "correct" ? "correct" : o === "partial" ? "partial" : "wrong";
    }
    return isAnswered(r?.answer) ? "answered" : r?.visited ? "seen" : "unseen";
  }
  if (r?.markedForReview) return isAnswered(r.answer) ? "answered-marked" : "marked";
  return isAnswered(r?.answer) ? "answered" : r?.visited ? "seen" : "unseen";
}

const STATUS_LABEL: Record<string, string> = {
  correct: "correct",
  partial: "partially correct",
  wrong: "incorrect",
  answered: "answered",
  "answered-marked": "answered, marked for review",
  marked: "marked for review",
  seen: "not answered",
  unseen: "not visited",
};

function Cell({ a, id, i, onGo }: { a: Attempt; id: string; i: number; onGo: (i: number) => void }) {
  const st = statusOf(a, id);
  const current = a.current === i;
  return (
    <button
      type="button"
      onClick={() => onGo(i)}
      aria-label={`Question ${i + 1}, ${STATUS_LABEL[st]}${current ? ", current" : ""}`}
      aria-current={current ? "step" : undefined}
      className={cn(
        "relative grid aspect-square place-items-center rounded-md text-xs font-medium tabular-nums transition-colors",
        st === "correct" && "bg-ok text-bg",
        st === "wrong" && "bg-bad text-bg",
        st === "partial" && "bg-review text-bg",
        st === "answered" && "bg-fg text-bg",
        st === "answered-marked" && "bg-fg text-bg",
        st === "marked" && "border border-review text-review",
        st === "seen" && "border border-line-strong text-fg-soft",
        st === "unseen" && "bg-surface-2 text-fg-muted",
        current && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
      )}
    >
      {i + 1}
      {(st === "answered-marked" || st === "marked") && <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-review" />}
    </button>
  );
}

function Navigator({ attempt: a, onGo }: { attempt: Attempt; onGo: (i: number) => void }) {
  return (
    <div className="mt-3 grid grid-cols-6 gap-1.5">
      {a.questionIds.map((id, i) => (
        <Cell key={id} a={a} id={id} i={i} onGo={onGo} />
      ))}
    </div>
  );
}

function MobileNavigator({ attempt: a, onGo }: { attempt: Attempt; onGo: (i: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} className="lg:hidden" aria-label="All questions">
        <Icon name="grid" className="size-4" />
        <span className="tabular-nums">
          {a.current + 1}/{a.questionIds.length}
        </span>
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Questions">
        <Navigator
          attempt={a}
          onGo={(i) => {
            onGo(i);
            setOpen(false);
          }}
        />
        <Legend learning={a.mode === "learning"} />
      </Dialog>
    </>
  );
}

function Legend({ learning }: { learning: boolean }) {
  const items = learning
    ? [
        ["bg-ok", "Correct"],
        ["bg-bad", "Incorrect"],
        ["bg-fg", "Answered, not checked"],
        ["bg-surface-2", "Not visited"],
      ]
    : [
        ["bg-fg", "Answered"],
        ["border border-review", "Marked for review"],
        ["border border-line-strong", "Not answered"],
        ["bg-surface-2", "Not visited"],
      ];
  return (
    <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[0.7rem] text-fg-muted">
      {items.map(([c, l]) => (
        <li key={l} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-[3px]", c)} />
          {l}
        </li>
      ))}
    </ul>
  );
}

function SubmitSummary({ attempt: a }: { attempt: Attempt }) {
  const answered = a.questionIds.filter((id) => isAnswered(a.responses[id]?.answer)).length;
  const marked = a.questionIds.filter((id) => a.responses[id]?.markedForReview).length;
  return (
    <div className="text-sm">
      <dl className="grid grid-cols-3 gap-3">
        {[
          ["Answered", answered],
          ["Not answered", a.questionIds.length - answered],
          ["Marked", marked],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line p-3">
            <dt className="text-xs text-fg-muted">{k}</dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-fg-muted">After submitting you&rsquo;ll see your score, every solution, and any wrong answers will be added to your mistake notebook.</p>
    </div>
  );
}

function ShortcutList({ learning }: { learning: boolean }) {
  const rows: [string[], string][] = [
    [["1", "2", "3", "4"], "Choose option A–D (or press A–D)"],
    [["←", "→"], "Previous / next question"],
    ...(learning ? ([[["Enter"], "Check answer"], [["H"], "Show hint"]] as [string[], string][]) : ([[["R"], "Mark for review"]] as [string[], string][])),
    [["B"], "Bookmark"],
    [["?"], "Show this list"],
  ];
  return (
    <ul className="space-y-2.5 text-sm">
      {rows.map(([keys, label]) => (
        <li key={label} className="flex items-center justify-between gap-4">
          <span className="text-fg-soft">{label}</span>
          <span className="flex gap-1">
            {keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </span>
        </li>
      ))}
      <li className="pt-2 text-xs text-fg-muted">Shortcuts are disabled while you type in an answer box. Every action also has a button.</li>
    </ul>
  );
}

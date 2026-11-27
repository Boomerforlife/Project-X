"use client";

/**
 * CBT simulation shell (CLAUDE.md §6C). Deliberately separate from the
 * practice player: exam-like chrome, no hints, no solutions, no mascot.
 * Exam rules (sections, marking, duration) come from the attempt's paper
 * configuration, never from this component.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MarkingScheme, Question, ResponseValue } from "@/contracts";
import { QuestionBody } from "@/components/practice/QuestionBody";
import { ReportDialog } from "@/components/practice/ReportDialog";
import { formatClock, useAttemptClock } from "@/components/practice/useAttemptClock";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Dialog } from "@/components/ui/Primitives";
import { cn } from "@/lib/cn";
import { catalog } from "@/lib/data/catalog";
import { isAnswered } from "@/lib/demo/scoring";
import { demoSaveFailed, ensureAttempt, setCurrent, setResponse, submitAttempt, useAuthStatus, useDemo, useSubmitState } from "@/lib/demo/store";
import type { Attempt } from "@/lib/demo/types";
import { EXAMS } from "@/lib/exams";
import { routes } from "@/lib/routes";
import { sourceLabel } from "@/lib/source";
import { QUESTION_TYPE_LABEL } from "@/lib/subjects";

type Status = "not-visited" | "not-answered" | "answered" | "marked" | "answered-marked";

function statusOf(a: Attempt, qid: string): Status {
  const r = a.responses[qid];
  const ans = isAnswered(r?.answer);
  if (r?.markedForReview) return ans ? "answered-marked" : "marked";
  if (ans) return "answered";
  return r?.visited ? "not-answered" : "not-visited";
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  "not-visited": { label: "Not visited", cls: "bg-surface-3 text-fg-soft rounded-[4px]" },
  "not-answered": { label: "Not answered", cls: "bg-bad text-bg [clip-path:polygon(0_0,100%_0,100%_75%,50%_100%,0_75%)] rounded-t-[4px]" },
  answered: { label: "Answered", cls: "bg-ok text-bg [clip-path:polygon(0_25%,50%_0,100%_25%,100%_100%,0_100%)] rounded-b-[4px]" },
  marked: { label: "Marked for review", cls: "bg-biology text-bg rounded-full" },
  "answered-marked": { label: "Answered & marked for review (will be evaluated)", cls: "bg-biology text-bg rounded-full" },
};

/** Where "Not now" / "Leave for now" go: the paper's own page when it has one, else the PYQ hub. */
function paperHref(a: Attempt): string {
  const track = EXAMS[a.exam].track;
  if (!a.paperId) return routes.pyq(track);
  const fixture = catalog.paper(a.paperId);
  return fixture?.year ? routes.pyqPaper(track, fixture.year, fixture.id) : routes.pyqPaperFromSlug(track, a.paperId);
}

/** Demo copy only for sample papers (mock builds / demo flag), never on a real previous-year paper. */
function isDemoAttempt(a: Attempt): boolean {
  return Boolean(a.local) || Boolean(a.paperId && catalog.paper(a.paperId)?.isDemo);
}

export function CbtEntry() {
  const id = useSearchParams().get("id");
  const s = useDemo();
  const { status } = useAuthStatus();
  const router = useRouter();
  const a = s && id ? s.attempts[id] : null;
  const [started, setStarted] = useState(false);
  // A reload or a second tab: the session may not be in memory yet. Load it once before saying it doesn't exist.
  const [lookedUp, setLookedUp] = useState<string | null>(null);
  const lookupStarted = useRef<string | null>(null);
  const signedIn = Boolean(s?.user);

  useEffect(() => {
    if (!id || !signedIn || a || lookupStarted.current === id) return;
    lookupStarted.current = id;
    void ensureAttempt(id).finally(() => setLookedUp(id));
  }, [id, signedIn, a]);

  useEffect(() => {
    if (a?.status === "submitted") router.replace(`/results/?id=${a.id}&from=cbt`);
  }, [a?.status, a?.id, router]);

  if (s === null || status === "loading" || (signedIn && !a && id && lookedUp !== id)) return <Shell><p className="p-10 text-center text-fg-muted">Loading exam…</p></Shell>;
  if (!s.user) {
    const back = id ? `/cbt/?id=${encodeURIComponent(id)}` : routes.pyq();
    return (
      <Shell>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Sign in to open this exam</h1>
          <p className="mt-2 text-fg-muted">Your attempts are kept with your account. Sign in and you&rsquo;ll come straight back here.</p>
          <ButtonLink href={routes.login(back)} className="mt-6">
            Sign in
          </ButtonLink>
        </div>
      </Shell>
    );
  }
  if (!a || a.mode !== "cbt") {
    const track = EXAMS[s.user.exam].track;
    return (
      <Shell>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold">Exam session not found</h1>
          <p className="mt-2 text-fg-muted">It may already be submitted, or it was started in another browser. Open a paper from PYQs to start the exam interface.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <ButtonLink href={routes.pyq(track)}>PYQs</ButtonLink>
            <ButtonLink href={routes.progressTests} variant="secondary">
              Your attempts
            </ButtonLink>
          </div>
        </div>
      </Shell>
    );
  }
  if (a.status === "submitted") return <Shell><p className="p-10 text-center text-fg-muted">Opening results…</p></Shell>;
  const resumed = a.questionIds.some((q) => a.responses[q]?.visited);
  if (!started && !resumed) return <Instructions attempt={a} onStart={() => { setCurrent(a.id, 0); setStarted(true); }} />;
  return <Exam attempt={a} candidate={s.user.name} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}

function markingLine(m: MarkingScheme, type: Question["type"]) {
  const r = m[type];
  if (!r) return "";
  const neg = r.incorrect ? `${r.incorrect}` : "no negative";
  return `+${r.correct} correct · ${neg}${r.partial ? " · partial marks" : ""}`;
}

function Instructions({ attempt: a, onStart }: { attempt: Attempt; onStart: () => void }) {
  const paper = a.paperId ? catalog.paper(a.paperId) : null;
  const demo = isDemoAttempt(a);
  const [ok, setOk] = useState(false);
  return (
    <Shell>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <p className="text-sm font-semibold tracking-tight">Computer-based test</p>
          {demo && <span className="rounded-sm border border-review/40 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-review">Demo</span>}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-sm text-fg-muted">{EXAMS[a.exam].name}</p>
        <h1 className="mt-1 text-3xl font-semibold">{a.title}</h1>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
          <section aria-labelledby="ins-h">
            <h2 id="ins-h" className="text-lg font-semibold">
              Instructions
            </h2>
            <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-fg-soft">
              <li>The timer starts when you press Start and counts down in the top bar. The test submits automatically when it reaches zero.</li>
              <li>Your answers are saved automatically on this device as soon as you choose them, and sent to your account when you submit, so finish the paper on this device and browser. The top bar always shows the save status.</li>
              <li>Use the question palette to jump to any question. Its shapes show each question&rsquo;s status; a legend is always visible.</li>
              <li>&ldquo;Mark for review&rdquo; flags a question to revisit. An answered question that is marked for review is still evaluated.</li>
              <li>There are no hints or solutions during the test. Full solutions open after you submit.</li>
              {a.sections.find((s) => s.countBest) && (
                <li>
                  Each subject has more numerical questions than count: only your best {a.sections.find((s) => s.countBest)!.countBest!.n} numerical answers per subject are added to your score.
                </li>
              )}
              {paper?.instructions.map((t) => <li key={t}>{t}</li>)}
            </ol>
            {demo && (
              <p className="mt-6 rounded-md border border-review/40 bg-review/5 p-3 text-sm text-fg-soft">
                Demo paper: the section pattern follows the real exam, but the questions are original sample items.
              </p>
            )}
            <p className="mt-6 rounded-md border border-line bg-surface p-3 text-sm text-fg-muted lg:hidden">
              The exam interface is most comfortable on a laptop or tablet, like the real CBT. You can still take it here.
            </p>
          </section>
          <aside className="space-y-4">
            <div className="rounded-md border border-line bg-surface p-4 text-sm">
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Duration</dt>
                  <dd className="font-medium tabular-nums">{Math.round((a.durationSec ?? 0) / 60)} min</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Questions</dt>
                  <dd className="font-medium tabular-nums">{a.questionIds.length}</dd>
                </div>
              </dl>
              <table className="mt-4 w-full text-left text-xs">
                <thead className="text-fg-muted">
                  <tr>
                    <th className="pb-1 font-normal">Section</th>
                    <th className="pb-1 text-right font-normal">Qs</th>
                  </tr>
                </thead>
                <tbody>
                  {a.sections.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="py-1.5">{s.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.questionIds.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3 text-sm">
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 size-4 accent-current" />
              I have read the instructions and I&rsquo;m ready to begin.
            </label>
            <Button size="lg" className="w-full" disabled={!ok} onClick={onStart}>
              Start paper
            </Button>
            <Link href={paperHref(a)} className="flex min-h-11 items-center justify-center text-sm text-fg-muted hover:text-fg">
              Not now
            </Link>
          </aside>
        </div>
      </main>
    </Shell>
  );
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

function Exam({ attempt: a, candidate }: { attempt: Attempt; candidate: string }) {
  const router = useRouter();
  const qid = a.questionIds[a.current];
  const q = catalog.question(qid)!;
  const resp = a.responses[qid];
  const section = a.sections.find((s) => s.questionIds.includes(qid)) ?? a.sections[0];
  const clock = useAttemptClock(a.id, qid, true);
  const remaining = (a.durationSec ?? 0) - (a.elapsedSec + clock.unflushed);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [confirm, setConfirm] = useState(false);
  const [palette, setPalette] = useState(false);
  const [report, setReport] = useState(false);
  const [fsNote, setFsNote] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [more, setMore] = useState(false);
  const autoSubmitted = useRef(false);
  const inFlight = useRef(false);
  const submitState = useSubmitState(a.id);
  const saveFailed = demoSaveFailed();
  const demo = isDemoAttempt(a);

  useEffect(() => {
    document.body.dataset.shell = "cbt";
    return () => {
      delete document.body.dataset.shell;
    };
  }, []);

  const go = useCallback((i: number) => setCurrent(a.id, i), [a.id]);
  // Submit waits for the server: every answer is sent, then the session is completed. Only then do Results open, so
  // they never show "still in progress". A paused submission keeps the student here with Retry (answers stay saved).
  const submit = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setConfirm(false);
    setSubmitting(true);
    try {
      const ok = await submitAttempt(a.id);
      if (ok) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        router.replace(`/results/?id=${a.id}&from=cbt`);
      }
    } finally {
      inFlight.current = false;
    }
  }, [a.id, router]);

  useEffect(() => {
    if (a.durationSec && remaining <= 0 && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void submit();
    }
  }, [remaining, a.durationSec, submit]);
  const timeUp = Boolean(a.durationSec && remaining <= 0);

  const answer = (v: ResponseValue | null) => setResponse(a.id, qid, { answer: v });
  const next = () => go(Math.min(a.current + 1, a.questionIds.length - 1));
  const markAndNext = () => {
    setResponse(a.id, qid, { markedForReview: true });
    next();
  };
  const clearResponse = () => setResponse(a.id, qid, { answer: null });
  const unmark = () => setResponse(a.id, qid, { markedForReview: false });
  const idxInSection = section.questionIds.indexOf(qid);
  const lastOverall = a.current === a.questionIds.length - 1;

  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFsNote(null);
    } catch {
      setFsNote("Your browser didn't allow full screen. You can continue normally.");
    }
  };

  const counts = (ids: string[]) => {
    const c: Record<Status, number> = { "not-visited": 0, "not-answered": 0, answered: 0, marked: 0, "answered-marked": 0 };
    ids.forEach((id) => c[statusOf(a, id)]++);
    return c;
  };

  const paletteEl = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <p className="text-xs font-medium">{section.name}</p>
        <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[0.68rem] text-fg-muted">
          {(Object.keys(STATUS_META) as Status[]).map((st) => (
            <li key={st} className={cn("flex items-center gap-1.5", st === "answered-marked" && "col-span-2")}>
              <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center text-[0.6rem] font-semibold tabular-nums", STATUS_META[st].cls)}>
                {counts(section.questionIds)[st]}
              </span>
              {STATUS_META[st].label}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-5 gap-2">
          {section.questionIds.map((id) => {
            const i = a.questionIds.indexOf(id);
            const st = statusOf(a, id);
            const n = section.questionIds.indexOf(id) + 1;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  go(i);
                  setPalette(false);
                }}
                aria-label={`Question ${n}, ${STATUS_META[st].label}`}
                aria-current={i === a.current ? "step" : undefined}
                className={cn(
                  "relative grid h-11 place-items-center text-xs font-semibold tabular-nums lg:h-9",
                  STATUS_META[st].cls,
                  i === a.current && "outline outline-2 outline-offset-2 outline-fg",
                )}
              >
                {n}
                {st === "answered-marked" && <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface bg-ok" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t border-line p-3">
        <Button className="w-full" onClick={() => setConfirm(true)}>
          Submit
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{a.title}</p>
          <p className="truncate text-xs text-fg-muted">
            Candidate: {candidate}
            {demo && (
              <>
                {" "}
                · <span className="text-review">Demo</span>
              </>
            )}
          </p>
        </div>
        <p
          role="status"
          title={saveFailed ? "Couldn't save on this device. Keep this tab open and submit when you can." : online ? "Answers are saved on this device and sent to your account when you submit." : "You're offline. Answers stay saved on this device."}
          className={cn("flex shrink-0 items-center gap-1.5 text-xs", !online || saveFailed ? "text-review" : "text-fg-muted")}
        >
          <Icon name={saveFailed ? "alert" : online ? "check" : "wifiOff"} className="size-4" />
          <span className="sm:hidden">{saveFailed ? "Not saved" : online ? "Saved locally" : "Offline"}</span>
          <span className="hidden sm:inline">{saveFailed ? "Couldn't save — keep this tab open" : online ? "Saved on this device" : "Offline — saved on this device"}</span>
        </p>
        <div
          role="timer"
          aria-label={`Time left ${formatClock(remaining)}`}
          className={cn("rounded-md border px-3 py-1.5 font-mono text-base font-semibold tabular-nums", remaining < 300 ? "border-bad text-bad" : "border-line-strong")}
        >
          <span className="mr-2 hidden font-sans text-xs font-normal text-fg-muted sm:inline">Time left</span>
          {formatClock(remaining)}
        </div>
        <button type="button" onClick={toggleFs} className="hidden size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg sm:grid" aria-label="Toggle full screen" title="Full screen">
          <Icon name="fullscreen" className="size-4" />
        </button>
        <button type="button" onClick={() => setExitOpen(true)} className="grid size-11 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg sm:size-9" aria-label="Exit exam (answers stay saved on this device)" title="Exit">
          <Icon name="logout" className="size-4" />
        </button>
      </header>
      {fsNote && (
        <p role="status" className="border-b border-review/40 bg-review/5 px-4 py-2 text-xs text-fg-soft">
          {fsNote}
        </p>
      )}
      {!online && (
        <p role="alert" className="border-b border-review/40 bg-review/5 px-4 py-2 text-xs text-fg-soft">
          You&rsquo;re offline. Keep going — your answers are stored on this device. Reconnect before you submit so they reach your account.
        </p>
      )}

      {/* Section tabs */}
      <nav aria-label="Sections" className="flex shrink-0 gap-1 overflow-x-auto [scrollbar-width:none] border-b border-line bg-surface px-3 sm:px-4">
        {a.sections.map((s) => {
          const c = counts(s.questionIds);
          const active = s.id === section.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => go(a.questionIds.indexOf(s.questionIds[0]))}
              aria-current={active ? "true" : undefined}
              className={cn("relative flex h-11 shrink-0 items-center gap-2 px-3 text-sm", active ? "text-fg" : "text-fg-muted hover:text-fg")}
            >
              {s.name}
              <span className="rounded-sm bg-surface-3 px-1.5 text-[0.65rem] tabular-nums text-fg-soft">
                {c.answered + c["answered-marked"]}/{s.questionIds.length}
              </span>
              {active && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 bg-fg" />}
            </button>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1">
        <main id="main" className="min-w-0 flex-1 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xs text-fg-muted sm:px-6">
            <p>
              <span className="font-semibold text-fg">Question {idxInSection + 1}</span> · {QUESTION_TYPE_LABEL[q.type]} ·{" "}
              <span>{sourceLabel(q.source)}</span>
            </p>
            <p>Marks: {markingLine(section.marking, q.type)}</p>
          </div>
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6" key={qid}>
            <QuestionBody question={q} answer={resp?.answer ?? null} onChange={answer} variant="cbt" numberLabel={`Question ${idxInSection + 1}`} />
            {q.type === "numerical" && <Keypad value={resp?.answer?.value ?? ""} onChange={(v) => answer(v ? { value: v } : null)} />}
            <button type="button" onClick={() => setReport(true)} className="mt-8 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg">
              <Icon name="alert" className="size-3.5" /> Report an issue with this question
            </button>
          </div>
        </main>
        <aside aria-label="Question palette" className="hidden w-72 shrink-0 border-l border-line bg-surface lg:block">
          {paletteEl}
        </aside>
      </div>

      {/* Exam actions */}
      {/* Phones: one row (Back, palette, more, Save & next). Larger screens: every action visible. */}
      <footer className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:flex-wrap sm:px-4">
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <Button variant="secondary" size="sm" onClick={markAndNext}>
            Mark for review & next
          </Button>
          <Button variant="secondary" size="sm" onClick={clearResponse} disabled={!isAnswered(resp?.answer)}>
            Clear response
          </Button>
          {resp?.markedForReview && (
            <Button variant="ghost" size="sm" onClick={unmark}>
              Unmark
            </Button>
          )}
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setPalette(true)}>
            <Icon name="grid" className="size-4" /> Palette
          </Button>
        </div>
        <Button variant="secondary" size="sm" className="w-11 px-0 max-sm:h-11 sm:hidden" onClick={() => go(a.current - 1)} disabled={a.current === 0} aria-label="Previous question">
          <Icon name="chevronLeft" className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" className="w-11 px-0 max-sm:h-11 sm:hidden" onClick={() => setPalette(true)} aria-label="Question palette">
          <Icon name="grid" className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" className="relative w-11 px-0 max-sm:h-11 sm:hidden" onClick={() => setMore(true)} aria-label={resp?.markedForReview ? "More actions (marked for review)" : "More actions"}>
          <Icon name="dots" className="size-4" />
          {resp?.markedForReview && <span aria-hidden className="absolute right-2 top-2 size-2 rounded-full bg-biology" />}
        </Button>
        <div className="ml-auto flex flex-1 gap-2 sm:flex-none">
          <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={() => go(a.current - 1)} disabled={a.current === 0}>
            <Icon name="chevronLeft" className="size-4" /> Back
          </Button>
          <Button size="sm" onClick={() => (lastOverall ? setConfirm(true) : next())} className="flex-1 max-sm:h-11 sm:min-w-28 sm:flex-none">
            {lastOverall ? "Submit" : "Save & next"}
          </Button>
        </div>
      </footer>

      <Dialog open={more} onClose={() => setMore(false)} title={`Question ${idxInSection + 1}`}>
        <div className="grid gap-2">
          <Button variant="secondary" onClick={() => { markAndNext(); setMore(false); }}>
            Mark for review & next
          </Button>
          {resp?.markedForReview && (
            <Button variant="secondary" onClick={() => { unmark(); setMore(false); }}>
              Unmark
            </Button>
          )}
          <Button variant="secondary" onClick={() => { clearResponse(); setMore(false); }} disabled={!isAnswered(resp?.answer)}>
            Clear response
          </Button>
          <Button variant="ghost" onClick={() => { setMore(false); setConfirm(true); }}>
            Submit paper
          </Button>
        </div>
      </Dialog>

      <Dialog open={palette} onClose={() => setPalette(false)} title="Question palette">
        <div className="-mx-5 -mb-5 h-[60vh] sm:-mx-6 sm:-mb-6">{paletteEl}</div>
      </Dialog>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Submit this paper?" wide>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="text-xs text-fg-muted">
              <tr>
                <th className="pb-2 font-normal">Section</th>
                <th className="pb-2 text-right font-normal">Answered</th>
                <th className="pb-2 text-right font-normal">Not answered</th>
                <th className="pb-2 text-right font-normal">Marked</th>
                <th className="pb-2 text-right font-normal">Not visited</th>
              </tr>
            </thead>
            <tbody>
              {a.sections.map((s) => {
                const c = counts(s.questionIds);
                return (
                  <tr key={s.id} className="border-t border-line tabular-nums">
                    <td className="py-2">{s.name}</td>
                    <td className="py-2 text-right">{c.answered + c["answered-marked"]}</td>
                    <td className="py-2 text-right">{c["not-answered"]}</td>
                    <td className="py-2 text-right">{c.marked + c["answered-marked"]}</td>
                    <td className="py-2 text-right">{c["not-visited"]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-fg-muted">
          Time left: <span className="font-mono tabular-nums text-fg">{formatClock(remaining)}</span>. Once submitted, you can&rsquo;t change answers. You can always retry
          the paper later as a new attempt; this one stays in your history.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Back to test
          </Button>
          <Button onClick={() => void submit()}>Submit</Button>
        </div>
      </Dialog>

      <Dialog open={exitOpen} onClose={() => setExitOpen(false)} title="Leave the exam?">
        <p className="text-sm text-fg-soft">
          Your answers stay saved on this device and the timer pauses while you&rsquo;re away. Resume from Home or Progress on this device and browser; your answers reach your account when you submit.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setExitOpen(false)}>
            Stay
          </Button>
          <ButtonLink href={paperHref(a)}>Leave for now</ButtonLink>
        </div>
      </Dialog>
      <Dialog
        open={submitting && submitState?.phase !== "done"}
        onClose={() => {
          if (submitState?.phase === "paused" && !timeUp) setSubmitting(false);
        }}
        title={submitState?.phase === "paused" ? "Submission paused" : timeUp ? "Time's up — submitting" : "Submitting your answers"}
      >
        <div className="text-sm" role="status" aria-live="polite">
          {submitState ? (
            <>
              <p className="font-medium tabular-nums">
                {submitState.done} of {submitState.total} answers sent
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <div className="h-full bg-fg transition-[width] motion-reduce:transition-none" style={{ width: `${submitState.total ? Math.round((submitState.done / submitState.total) * 100) : 100}%` }} />
              </div>
              <p className="mt-3 text-fg-muted">{submitState.message ?? "Please keep this tab open. Results open as soon as everything is saved."}</p>
            </>
          ) : (
            <p className="text-fg-muted">Saving your answers…</p>
          )}
          {submitState?.phase === "paused" && (
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {!timeUp && (
                <Button variant="secondary" onClick={() => setSubmitting(false)}>
                  Back to paper
                </Button>
              )}
              <Button onClick={() => void submit()}>Retry</Button>
            </div>
          )}
        </div>
      </Dialog>
      <ReportDialog open={report} onClose={() => setReport(false)} />
    </div>
  );
}

/** On-screen keypad for numerical answers, as in the real CBT. */
function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "-"];
  return (
    <div className="mt-4 w-56">
      <p className="mb-2 text-xs text-fg-muted">On-screen keypad</p>
      <div className="grid grid-cols-3 gap-1.5">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              if (k === "-") onChange(value.startsWith("-") ? value.slice(1) : `-${value}`);
              else if (k === "." && value.includes(".")) return;
              else onChange((value + k).slice(0, 12));
            }}
            className="h-11 rounded-md border border-line bg-surface-2 font-mono text-sm hover:bg-surface-3 sm:h-9"
          >
            {k}
          </button>
        ))}
        <button type="button" onClick={() => onChange(value.slice(0, -1))} className="col-span-2 h-11 rounded-md border border-line bg-surface-2 text-sm hover:bg-surface-3 sm:h-9">
          Backspace
        </button>
        <button type="button" onClick={() => onChange("")} className="h-11 rounded-md border border-line bg-surface-2 text-sm hover:bg-surface-3 sm:h-9">
          Clear
        </button>
      </div>
    </div>
  );
}

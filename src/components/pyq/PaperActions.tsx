"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ExamId } from "@/contracts";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { QuotaExceededError } from "@/lib/billing/quota";
import { cn } from "@/lib/cn";
import { relativeDay } from "@/lib/demo/dates";
import { scoreAttempt } from "@/lib/demo/scoring";
import { demoLogin, rememberPapers, startPaper, useDemo } from "@/lib/demo/store";
import type { Attempt, DemoState } from "@/lib/demo/types";
import { routes } from "@/lib/routes";
import { DATA_SOURCE } from "@/lib/site";

/** What a client island needs to start a paper (the API store remembers it before creating the session). */
export type PaperRef = { slug: string; title: string; exam: ExamId; durationMin: number };

type Mode = "cbt" | "test" | "learning";

const MODES: { mode: Mode; icon: IconName; title: string; body: string }[] = [
  { mode: "cbt", icon: "monitor", title: "Attempt in CBT", body: "The real exam experience: timer, sections, question palette. Recommended." },
  { mode: "test", icon: "clock", title: "Timed test", body: "Timed, in the regular practice view. Answers and solutions after you submit." },
  { mode: "learning", icon: "book", title: "Solve untimed", body: "No timer. Check each answer as you go and see the solution straight away." },
];

export function attemptsFor(s: DemoState | null, slug: string): Attempt[] {
  if (!s) return [];
  return Object.values(s.attempts)
    .filter((a) => a.paperId === slug)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

const resumeHref = (a: Attempt) => (a.mode === "cbt" ? routes.cbt(a.id) : routes.session(a.id));

/** Start (or resume) a paper. Signed-out visitors go to sign-in and come back to this page; a used-up Free allowance goes to the limit screen. */
function useStartPaper(paper: PaperRef) {
  const router = useRouter();
  const pathname = usePathname() ?? routes.pyq();
  const s = useDemo();
  const [busy, setBusy] = useState<Mode | null>(null);
  const start = async (mode: Mode, retryOf?: string) => {
    if (!s?.user) {
      if (DATA_SOURCE === "api") router.push(routes.login(pathname));
      else {
        demoLogin();
        router.push(`/onboarding/?next=${encodeURIComponent(pathname)}`);
      }
      return;
    }
    setBusy(mode);
    try {
      rememberPapers([{ slug: paper.slug, title: paper.title, exam: paper.exam, durationMin: paper.durationMin }]);
      const id = await startPaper(paper.slug, mode, retryOf);
      router.push(mode === "cbt" ? routes.cbt(id) : routes.session(id));
    } catch (e) {
      setBusy(null);
      if (e instanceof QuotaExceededError) {
        const q = new URLSearchParams({ used: String(e.details.used), limit: String(e.details.limit), resets: e.details.resets_on });
        router.push(`/tests/limit/?${q.toString()}`);
        return;
      }
      toast("Couldn't start that paper. Please try again.", { icon: "alert", tone: "warn" });
    }
  };
  return { start, busy, signedIn: Boolean(s?.user), ready: s !== null };
}

/** The three ways to attempt a paper, shown on the paper page. */
export function PaperActions({ paper }: { paper: PaperRef }) {
  const s = useDemo();
  const { start, busy, signedIn, ready } = useStartPaper(paper);
  const atts = attemptsFor(s, paper.slug);
  const open = atts.find((a) => a.status === "in_progress");
  const latest = atts.find((a) => a.status === "submitted");
  return (
    <section aria-labelledby="attempt-h">
      <h2 id="attempt-h" className="sr-only">
        Attempt this paper
      </h2>
      {open && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fg/30 bg-surface-2 p-4">
          <p className="text-sm">
            You have an attempt in progress <span className="text-fg-muted">({open.mode === "cbt" ? "CBT" : open.mode === "test" ? "timed test" : "untimed"}, started {relativeDay(open.startedAt)})</span>.
          </p>
          <Link href={resumeHref(open)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-fg px-4 text-sm font-medium text-bg hover:bg-fg-soft">
            <Icon name="play" className="size-4" /> Resume
          </Link>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map((m, i) => (
          <button
            key={m.mode}
            type="button"
            disabled={Boolean(open) || busy !== null}
            onClick={() => void start(m.mode, latest?.id)}
            className={cn(
              "flex flex-col items-start rounded-xl border p-4 text-left transition-colors disabled:opacity-50",
              i === 0 ? "border-fg bg-surface-2 hover:bg-surface-3" : "border-line hover:border-fg",
            )}
          >
            <Icon name={m.icon} className="size-5" />
            <span className="mt-3 font-medium">
              {busy === m.mode ? "Starting…" : latest && m.mode === "cbt" ? "Retry in CBT" : m.title}
            </span>
            <span className="mt-1 text-sm text-fg-muted">{m.body}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-fg-muted">
        {ready && !signedIn
          ? "A free account saves your attempt and score. Free accounts have a monthly full-paper limit; Plus is unlimited."
          : "Free accounts have a monthly full-paper limit; Plus is unlimited. Retrying never overwrites an earlier attempt or its score."}
        {open ? " Finish or resume your current attempt first." : ""}
      </p>
    </section>
  );
}

/** Status line + Resume on a paper tile (lists). Server and signed-out render: the neutral line only. */
export function PaperTileStatus({ slug }: { slug: string }) {
  const s = useDemo();
  const atts = attemptsFor(s, slug);
  const open = atts.find((a) => a.status === "in_progress");
  const done = atts.filter((a) => a.status === "submitted");
  if (!s?.user) return <p className="mt-3 min-h-5 text-xs text-fg-muted">Official NTA answer key</p>;
  return (
    <div className="mt-3 flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
      <span>{open ? "Attempt in progress" : done.length ? `${done.length} attempt${done.length === 1 ? "" : "s"} submitted` : "Not attempted yet"}</span>
      {open && (
        <Link href={resumeHref(open)} className="relative z-10 inline-flex min-h-9 items-center rounded-md border border-line-strong px-2.5 text-xs text-fg hover:border-fg">
          Resume
        </Link>
      )}
    </div>
  );
}

/** Compact start buttons for papers that have no page of their own (demo mock tests). */
export function PaperQuickStart({ paper }: { paper: PaperRef }) {
  const s = useDemo();
  const { start, busy } = useStartPaper(paper);
  const atts = attemptsFor(s, paper.slug);
  const open = atts.find((a) => a.status === "in_progress");
  const latest = atts.find((a) => a.status === "submitted");
  return open ? (
    <Link href={resumeHref(open)} className="inline-flex h-9 items-center rounded-md bg-fg px-3 text-sm font-medium text-bg hover:bg-fg-soft max-sm:h-11">
      Resume
    </Link>
  ) : (
    <Button size="sm" pixel disabled={busy !== null} onClick={() => void start("cbt", latest?.id)} className="max-sm:h-11">
      <Icon name="monitor" className="size-4" /> {latest ? "Retry in CBT" : "Start in CBT"}
    </Button>
  );
}

/** Every attempt at this paper, newest first, with its score or a Resume button. */
export function PaperAttempts({ slug }: { slug: string }) {
  const s = useDemo();
  if (s === null) return <div className="skeleton mt-4 h-24" />;
  if (!s.user) return <p className="mt-3 text-sm text-fg-muted">Sign in to see your attempts. Each time you start this paper, a new attempt is saved.</p>;
  const atts = attemptsFor(s, slug);
  if (atts.length === 0) return <p className="mt-3 text-sm text-fg-muted">No attempts yet. Each time you start this paper, a new attempt is saved here.</p>;
  return (
    <ol className="mt-3 divide-y divide-line">
      {atts.map((a, i) => {
        const r = a.status === "submitted" ? scoreAttempt(a) : null;
        return (
          <li key={a.id} className="flex items-center gap-3 py-3 text-sm">
            <span className="w-6 font-pixel text-[0.65rem] text-fg-subtle">#{atts.length - i}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {a.mode === "cbt" ? "CBT" : a.mode === "test" ? "Timed test" : "Untimed"}
                {a.retryOf && <span className="ml-2 text-xs font-normal text-fg-muted">retry</span>}
              </p>
              <p className="text-xs text-fg-muted">{relativeDay(a.startedAt)}</p>
            </div>
            {r ? (
              <Link href={routes.results(a.id)} className="inline-flex min-h-11 items-center text-right hover:underline">
                <span className="font-display font-semibold tabular-nums">
                  {r.score}
                  <span className="text-fg-subtle">/{r.max}</span>
                </span>
              </Link>
            ) : (
              <Link href={resumeHref(a)} className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-3 text-sm hover:border-fg">
                Resume
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ExamId, SubjectId } from "@/contracts";
import { Button, buttonClass } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Dialog, Segmented } from "@/components/ui/Primitives";
import { cn } from "@/lib/cn";
import { quickPractice } from "@/lib/demo/launch";
import { demoLogin, useDemo } from "@/lib/demo/store";
import { routes } from "@/lib/routes";
import { DATA_SOURCE } from "@/lib/site";
import { useQueryState } from "./useQueryState";
import { useWhenLoaded } from "@/lib/useWhenLoaded";

type Mode = "learning" | "test";
type Diff = "any" | "easy" | "medium" | "hard";
const API = DATA_SOURCE === "api";

/**
 * "Practise" on the chapter page (replaces /practice/new/): choose Learn or Timed test, how many, difficulty and year, then
 * start. The list's active year and difficulty filters carry over. Opens by itself on ?practise=1 (&mode=timed), which
 * is how Home, Results and the library link to chapter practice. Visitors see what needs an account before they click.
 */
export function PractiseSheet({
  exam,
  subject,
  chapter,
  chapterName,
  total,
  years,
  firstPublicHref,
}: {
  exam: ExamId;
  subject: SubjectId;
  chapter: string;
  chapterName: string;
  total: number;
  years: number[];
  firstPublicHref: string | null;
}) {
  const s = useDemo();
  const router = useRouter();
  const [q, setQ] = useQueryState();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("learning");
  const [count, setCount] = useState("10");
  const [difficulty, setDifficulty] = useState<Diff>("any");
  const [year, setYear] = useState<string>("any");
  const [includeSolved, setIncludeSolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signedIn = Boolean(s?.user);
  const maxCount = API && mode === "test" ? 20 : 30; // timed answers are posted one by one at submit (rate limit)
  const counts = ["5", "10", "20", "30"].filter((n) => Number(n) <= Math.min(maxCount, Math.max(5, total)));

  const openWith = (m: Mode) => {
    setMode(m);
    const qy = q.get("year");
    const qd = q.get("difficulty");
    setYear(qy && years.map(String).includes(qy) ? qy : "any");
    setDifficulty(qd === "easy" || qd === "medium" || qd === "hard" ? qd : "any");
    setError("");
    setOpen(true);
  };

  // Deep links (?practise=1&mode=timed) open the sheet once.
  const autoOpened = useRef(false);
  const wantsSheet = q.get("practise") === "1";
  const wantsTimed = q.get("mode") === "timed" || q.get("mode") === "test";
  useEffect(() => {
    if (!wantsSheet || autoOpened.current) return;
    autoOpened.current = true;
    const t = window.setTimeout(() => openWith(wantsTimed ? "test" : "learning"), 0);
    return () => window.clearTimeout(t);
    // openWith reads the latest query itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsSheet, wantsTimed]);

  const close = () => {
    setOpen(false);
    if (wantsSheet) setQ({ practise: null, mode: null });
  };

  const here = () => `${window.location.pathname}${window.location.search}`;
  const signInHref = (m: Mode) => {
    const back = `${window.location.pathname}?practise=1${m === "test" ? "&mode=timed" : ""}`;
    return routes.login(back);
  };

  const start = async () => {
    if (!signedIn) {
      if (API) router.push(signInHref(mode));
      else {
        demoLogin();
        router.push(`/onboarding/?next=${encodeURIComponent(here())}`);
      }
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = await quickPractice(exam, {
        subject,
        chapter,
        count: Math.min(Number(count), maxCount),
        mode,
        difficulty: difficulty === "any" ? undefined : difficulty,
        includeSolved,
        ...(year !== "any" ? { year: Number(year) } : {}),
        title: year !== "any" ? `${chapterName} · ${year}` : chapterName,
      });
      if (id) {
        setOpen(false);
        router.push(`${routes.session(id)}&from=${encodeURIComponent(window.location.pathname)}`);
      }
      else {
        setBusy(false);
        setError(API && !includeSolved ? "You've solved every question that matches. Tick “Include questions I've already solved” to practise them again." : "No questions match that yet. Try fewer filters.");
      }
    } catch {
      setBusy(false);
      setError("Couldn't start the session. Check your connection and try again.");
    }
  };

  // A click while the account is still loading waits for it instead of being sent to sign-in.
  const startWhenLoaded = useWhenLoaded(s !== null, start);

  const timeLimit = Math.max(5, Math.min(Number(count), total) * 2);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button pixel onClick={() => openWith("learning")}>
          <Icon name="play" className="size-3.5" /> Practise this chapter
        </Button>
        <Button variant="secondary" onClick={() => openWith("test")}>
          <Icon name="clock" className="size-4" /> Timed test{s !== null && !signedIn ? <span className="text-fg-muted"> · free account</span> : null}
        </Button>
        {total > 0 && (
          <span className="text-sm tabular-nums text-fg-muted">
            {total} question{total === 1 ? "" : "s"}
            {firstPublicHref ? " · free to start, no sign-up needed" : ""}
          </span>
        )}
      </div>

      <Dialog open={open} onClose={close} title={`Practise ${chapterName}`} wide>
        {s !== null && !signedIn ? (
          <div className="space-y-4 text-sm">
            <p className="text-fg-soft">
              {firstPublicHref ? "You can start right now without an account: questions open one by one, with answers and solutions. " : ""}
              A free account saves your answers, builds your mistake notebook and unlocks timed tests.
            </p>
            <div className="flex flex-wrap gap-2">
              {firstPublicHref && (
                <Link href={firstPublicHref} className={buttonClass({ pixel: true })}>
                  <Icon name="play" className="size-3.5" /> Start free, no account
                </Link>
              )}
              <Link href={signInHref(mode)} className={buttonClass({ variant: "secondary" })}>
                {mode === "test" ? "Sign in for a timed test" : "Sign in to save progress"}
              </Link>
              <Link href={routes.signup(`${window.location.pathname}?practise=1${mode === "test" ? "&mode=timed" : ""}`)} className={buttonClass({ variant: "ghost" })}>
                Create a free account
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <fieldset>
              <legend className="text-sm font-medium">Mode</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["learning", "Learn", "Check each answer, use hints, read solutions as you go."],
                    ["test", "Timed test", "Timed. Answers and solutions appear after you submit."],
                  ] as const
                ).map(([id, l, d]) => (
                  <label key={id} className={cn("cursor-pointer rounded-lg border p-4 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2", mode === id ? "border-fg bg-surface-2" : "border-line hover:border-line-strong")}>
                    <input type="radio" name="mode" className="sr-only" checked={mode === id} onChange={() => setMode(id)} />
                    <span className="font-medium">{l}</span>
                    <span className="mt-1 block text-sm text-fg-muted">{d}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-x-8 gap-y-5">
              <div>
                <p className="text-sm font-medium">Questions</p>
                <Segmented className="mt-3" label="Number of questions" value={counts.includes(count) ? count : (counts[counts.length - 1] ?? "5")} onChange={setCount} options={counts.map((n) => ({ id: n, label: n }))} />
              </div>
              <div>
                <p className="text-sm font-medium">Difficulty</p>
                <Segmented
                  className="mt-3"
                  label="Difficulty"
                  value={difficulty}
                  onChange={setDifficulty}
                  options={[
                    { id: "any", label: "Any" },
                    { id: "easy", label: "Easy" },
                    { id: "medium", label: "Medium" },
                    { id: "hard", label: "Hard" },
                  ]}
                />
              </div>
              {API && years.length > 1 && (
                <label className="block">
                  <span className="text-sm font-medium">Year</span>
                  <select value={year} onChange={(e) => setYear(e.target.value)} className="mt-3 block h-11 rounded-md border border-line-strong bg-bg px-3 text-sm">
                    <option value="any">Any year</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {API && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" checked={includeSolved} onChange={(e) => setIncludeSolved(e.target.checked)} className="size-4 accent-current" />
                Include questions I&rsquo;ve already solved
              </label>
            )}
            {mode === "test" && <p className="text-sm text-fg-muted">Time limit: {timeLimit} minutes (about 2 minutes per question).</p>}
            {error && (
              <p role="alert" className="rounded-lg border border-review/40 bg-review/5 p-3 text-sm">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button pixel onClick={() => startWhenLoaded()} disabled={busy}>
                <Icon name="play" className="size-4" /> {busy ? "Starting…" : mode === "learning" ? "Start practising" : "Start the timed test"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { AnswerKey } from "@/contracts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useDemo } from "@/lib/demo/store";
import { acceptedOptionIds, answerLabel, isCorrect } from "@/lib/practice/check";

/**
 * Try a public question without an account: pick an option (or type a number), check it, see the answer, move on to
 * the next question of the chapter. The answer is already public on this page (collapsed solution), so checking in the
 * browser reveals nothing new and needs no login.
 *
 * Signed-out visitors are invited to create an account after a few answered questions (then every few more). The
 * count lives in this browser only: it decides when to show a dismissible prompt, nothing else (it is not progress and
 * never authoritative, CLAUDE.md §13). The prompt never shows on the page a visitor lands on.
 */

/** Answered questions (signed out) before the first sign-up prompt, and between prompts after that. */
export const PROMPT_EVERY = 5;
const ANSWERED_KEY = "tp.try.answered";
const PROMPTED_AT_KEY = "tp.try.promptedAt";
const MAX_REMEMBERED = 300;

type OptionView = { id: string; node: ReactNode };

export function PublicTry({
  slug,
  type,
  options,
  answer,
  nextHref,
  solutionId,
}: {
  slug: string;
  type: "single_correct" | "multiple_correct" | "numerical";
  options: OptionView[];
  /** Null when the page has no answer to check against: the options are then shown read-only. */
  answer: AnswerKey | null;
  nextHref: string | null;
  /** id of the collapsed solution <details>, opened by "See the solution". */
  solutionId: string;
}) {
  const s = useDemo();
  const signedOut = s !== null && !s.user;
  const [picked, setPicked] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [prompt, setPrompt] = useState<number | null>(null);
  const inputId = useId();

  const canCheck = answer !== null && (type === "numerical" ? value.trim() !== "" && Number.isFinite(Number(value)) : picked.length > 0);

  function toggle(id: string) {
    if (result) return;
    setPicked((p) => (type === "multiple_correct" ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));
  }

  function check() {
    if (!answer || !canCheck) return;
    const ok = isCorrect(answer, picked, value);
    setResult(ok ? "correct" : "wrong");
    if (!signedOut) return;
    const n = rememberAnswered(slug);
    const last = readNumber(PROMPTED_AT_KEY);
    if (n >= PROMPT_EVERY && n - last >= PROMPT_EVERY) {
      writeNumber(PROMPTED_AT_KEY, n);
      setPrompt(n);
    }
  }

  function reset() {
    setPicked([]);
    setValue("");
    setResult(null);
  }

  function openSolution() {
    const d = document.getElementById(solutionId);
    if (d instanceof HTMLDetailsElement) {
      d.open = true;
      d.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const correctIds = acceptedOptionIds(answer);

  return (
    <div className="mt-3">
      {options.length > 0 && (
        <fieldset>
          <legend className="sr-only">{type === "multiple_correct" ? "Choose all correct options" : "Choose one option"}</legend>
          <ol className="space-y-3" aria-label="Options">
            {options.map((o) => {
              const on = picked.includes(o.id);
              const isKey = result !== null && correctIds.includes(o.id);
              const wrongPick = result !== null && on && !correctIds.includes(o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => toggle(o.id)}
                    disabled={answer === null}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full items-start gap-4 rounded-md border px-4 py-3 text-left transition-colors",
                      answer !== null && !result && "hover:border-line-strong hover:bg-surface-2",
                      on && !result ? "border-fg bg-surface-2" : "border-line",
                      isKey && "border-ok bg-ok/5",
                      wrongPick && "border-bad bg-bad/5",
                      answer === null && "cursor-default",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-sm text-sm font-semibold",
                        on && !result ? "bg-fg text-bg" : "bg-surface-3",
                      )}
                    >
                      {o.id}
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5">{o.node}</span>
                    {isKey && <span className="shrink-0 pt-1 text-xs font-semibold text-ok">✓ Answer</span>}
                    {wrongPick && <span className="shrink-0 pt-1 text-xs font-semibold text-bad">✗ Your pick</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </fieldset>
      )}

      {type === "numerical" && answer !== null && (
        <div className="mt-6 max-w-xs">
          <label htmlFor={inputId} className="text-sm font-medium">
            Your answer
          </label>
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            disabled={result !== null}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") check();
            }}
            className="mt-1.5 h-11 w-full rounded-md border border-line bg-surface px-3 tabular-nums focus:border-fg focus:outline-none"
            placeholder="Enter a number"
          />
        </div>
      )}

      {answer !== null && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {result === null ? (
            <Button onClick={check} disabled={!canCheck}>
              Check answer
            </Button>
          ) : (
            <>
              {nextHref && (
                <ButtonLink href={nextHref} pixel>
                  Next question →
                </ButtonLink>
              )}
              <Button variant="secondary" onClick={openSolution}>
                See the answer and solution
              </Button>
              <Button variant="ghost" onClick={reset}>
                Try again
              </Button>
            </>
          )}
        </div>
      )}

      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm">
        {result === "correct" && <span className="font-semibold text-ok">Correct. Nice work.</span>}
        {result === "wrong" && (
          <span className="font-semibold text-bad">
            Not quite. The answer is {answerText(answer)}.
          </span>
        )}
      </p>

      {prompt !== null && <SignupPrompt count={prompt} onClose={() => setPrompt(null)} />}
    </div>
  );
}

function SignupPrompt({ count, onClose }: { count: number; onClose: () => void }) {
  const path = usePathname();
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => {
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-bg/70 p-4 backdrop-blur-sm sm:place-items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">
          You&rsquo;ve practised {count} questions
        </h2>
        <p className="mt-2 text-fg-soft">
          Create a free account to save your answers, collect the ones you got wrong in a mistake notebook, and pick up where
          you left off on any device.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/signup/" pixel>
            Create free account
          </ButtonLink>
          <ButtonLink href={`/login/?next=${encodeURIComponent(path)}`} variant="secondary">
            Log in
          </ButtonLink>
          <Button variant="ghost" onClick={onClose}>
            Maybe later
          </Button>
        </div>
      </div>
    </div>
  );
}

function answerText(a: AnswerKey | null): string {
  if (!a) return "";
  return answerLabel(a);
}

/** Adds this question to the answered set (signed out) and returns how many distinct questions are in it. */
function rememberAnswered(slug: string): number {
  try {
    const raw = window.localStorage.getItem(ANSWERED_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(slug)) list.push(slug);
    const kept = list.slice(-MAX_REMEMBERED);
    window.localStorage.setItem(ANSWERED_KEY, JSON.stringify(kept));
    return list.length;
  } catch {
    return 0; // storage blocked (private mode): never prompt rather than guess
  }
}

function readNumber(key: string): number {
  try {
    return Number(window.localStorage.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, n: number) {
  try {
    window.localStorage.setItem(key, String(n));
  } catch {
    /* storage blocked: the prompt may show again later, which is harmless */
  }
}

/** Signed-out visitors go to a public question; signed-in students to the practice launcher. */
export function PracticeLink({
  signedInHref,
  publicHref,
  children,
  ...rest
}: { signedInHref: string; publicHref: string | null; children: ReactNode } & Omit<Parameters<typeof ButtonLink>[0], "href" | "children">) {
  const s = useDemo();
  const signedOut = s !== null && !s.user;
  // No public destination: the link is for signed-in students only (a visitor would just hit the login page).
  if (signedOut && !publicHref) return null;
  const href = signedOut && publicHref ? publicHref : signedInHref;
  return (
    <ButtonLink href={href} {...rest}>
      {children}
    </ButtonLink>
  );
}


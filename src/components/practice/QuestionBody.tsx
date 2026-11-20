"use client";

import type { Question, ResponseValue, Solution } from "@/contracts";
import { Blocks } from "@/components/content/Blocks";
import { figuresNotInBlocks } from "@/lib/api/adapters/blocks";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * The shared question renderer used by Learning mode, Test mode, the CBT
 * shell and result review. It never decides what may be revealed: callers
 * pass `solution` only when the mode allows it.
 */
export function QuestionBody({
  question: q,
  answer,
  onChange,
  disabled = false,
  solution = null,
  variant = "practice",
  numberLabel,
}: {
  question: Question;
  answer: ResponseValue | null;
  onChange?: (a: ResponseValue | null) => void;
  disabled?: boolean;
  /** When provided, correct / incorrect states are shown on the options. */
  solution?: Solution | null;
  variant?: "practice" | "cbt";
  numberLabel?: string;
}) {
  const chosen = new Set(answer?.optionIds ?? []);
  const key = solution?.answer;
  const correctIds = new Set(key?.type === "single_correct" ? [key.optionId] : key?.type === "multiple_correct" ? key.optionIds : []);
  const multi = q.type === "multiple_correct";

  const toggle = (id: string) => {
    if (disabled || !onChange) return;
    if (multi) {
      const next = new Set(chosen);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange(next.size ? { optionIds: [...next].sort() } : null);
    } else {
      onChange(chosen.has(id) ? null : { optionIds: [id] });
    }
  };

  return (
    <div>
      <div className={cn("leading-relaxed", variant === "cbt" ? "text-[1.02rem]" : "text-[1.075rem]")}>
        {numberLabel && <span className="sr-only">{numberLabel}. </span>}
        <Blocks blocks={q.blocks} fallback={q.stem} />
      </div>

      {figuresNotInBlocks(q.assets, q.blocks).map((a) => (
        // eslint-disable-next-line @next/next/no-img-element -- figure URLs come from the content API
        <img key={a.id} src={a.url} alt={a.alt} width={a.width} height={a.height} className="mt-5 h-auto max-w-full rounded-md border border-line bg-white" />
      ))}

      {q.type === "numerical" ? (
        <NumericalInput q={q} answer={answer} onChange={onChange} disabled={disabled} solution={solution} />
      ) : (
        <fieldset className="mt-6" disabled={disabled}>
          <legend className="mb-3 text-xs text-fg-muted">
            {multi ? "Select all correct options" : "Select one option"}
          </legend>
          <div className="space-y-2.5" role={multi ? "group" : "radiogroup"}>
            {q.options.map((o, i) => {
              const isChosen = chosen.has(o.id);
              const isRight = correctIds.has(o.id);
              const revealed = Boolean(solution);
              const state = revealed ? (isRight ? "right" : isChosen ? "wrong" : "idle") : isChosen ? "chosen" : "idle";
              return (
                <button
                  key={o.id}
                  type="button"
                  role={multi ? "checkbox" : "radio"}
                  aria-checked={isChosen}
                  aria-keyshortcuts={String(i + 1)}
                  onClick={() => toggle(o.id)}
                  className={cn(
                    "group flex w-full items-start gap-3.5 rounded-lg border px-4 py-3.5 text-left transition-[border-color,background-color,transform] duration-150",
                    !disabled && "active:scale-[0.995]",
                    state === "idle" && "border-line hover:border-line-strong hover:bg-surface-2",
                    state === "chosen" && "border-fg bg-surface-2",
                    state === "right" && "border-ok/70 bg-ok/[0.07]",
                    state === "wrong" && "border-bad/70 bg-bad/[0.07]",
                    disabled && state === "idle" && "opacity-75",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center text-sm font-semibold transition-colors",
                      multi ? "rounded-[5px]" : "rounded-full",
                      state === "idle" && "bg-surface-3 text-fg-soft",
                      state === "chosen" && "bg-fg text-bg",
                      state === "right" && "bg-ok text-bg",
                      state === "wrong" && "bg-bad text-bg",
                    )}
                  >
                    {state === "right" ? <Icon name="check" className="size-4" /> : state === "wrong" ? <Icon name="x" className="size-4" /> : o.id}
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">
                    <Blocks blocks={o.blocks} fallback={o.body} />
                    {revealed && (isRight || isChosen) && (
                      <span className={cn("mt-1 block text-xs font-medium", isRight ? "text-ok" : "text-bad")}>
                        {isRight && isChosen ? "Your answer · correct" : isRight ? "Correct answer" : "Your answer"}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}

function NumericalInput({
  q,
  answer,
  onChange,
  disabled,
  solution,
}: {
  q: Question;
  answer: ResponseValue | null;
  onChange?: (a: ResponseValue | null) => void;
  disabled: boolean;
  solution: Solution | null;
}) {
  const value = answer?.value ?? "";
  const key = solution?.answer.type === "numerical" ? solution.answer : null;
  const invalid = value !== "" && !/^-?\d*\.?\d*$/.test(value);
  const id = `num-${q.id}`;
  return (
    <div className="mt-6">
      <label htmlFor={id} className="mb-2 block text-xs text-fg-muted">
        Enter a numerical value
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={value}
          aria-invalid={invalid}
          aria-describedby={`${id}-help`}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.\-]/g, "").slice(0, 12);
            onChange?.(v ? { value: v } : null);
          }}
          placeholder="e.g. 12.5"
          className={cn(
            "no-spin h-12 w-48 rounded-lg border bg-surface px-4 font-mono text-lg tabular-nums outline-none transition-colors placeholder:text-fg-subtle focus:border-fg",
            invalid ? "border-bad" : "border-line-strong",
            key && "opacity-90",
          )}
        />
        {key && (
          <span className="text-sm">
            Correct answer: <span className="font-mono font-semibold text-ok">{key.display ?? key.value}</span>
            {key.tolerance ? <span className="text-fg-muted"> (±{key.tolerance})</span> : null}
          </span>
        )}
      </div>
      <p id={`${id}-help`} className={cn("mt-2 text-xs", invalid ? "text-bad" : "text-fg-muted")}>
        {invalid ? "Use digits, one decimal point and an optional minus sign." : "Digits, decimal point and minus sign only."}
      </p>
    </div>
  );
}

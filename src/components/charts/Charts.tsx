"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { dayKey, daysAgo } from "@/lib/demo/dates";
import type { DayActivity } from "@/lib/demo/types";

/**
 * Activity heatmap — sequential, single hue (the foreground ink at stepped
 * opacity), so it reads in both themes without a rainbow. Hover / focus shows
 * the exact numbers; a hidden table carries the same data for screen readers.
 */
export function Heatmap({ activity, weeks = 18, goal }: { activity: Record<string, DayActivity>; weeks?: number; goal: number }) {
  const [hover, setHover] = useState<{ k: string; d?: DayActivity } | null>(null);
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // Monday = 0
  const total = weeks * 7;
  const cells = Array.from({ length: total }, (_, i) => {
    const back = total - 1 - i - (6 - dow);
    if (back < 0) return null; // future days in the current week
    const d = daysAgo(back, today);
    const k = dayKey(d);
    return { k, d, a: activity[k] };
  });
  const level = (n: number) => (n === 0 ? 0 : n < 5 ? 1 : n < goal / 2 ? 2 : n < goal ? 3 : 4);
  const fill = ["bg-surface-3", "bg-fg/20", "bg-fg/40", "bg-fg/65", "bg-fg"];
  const months: { col: number; label: string }[] = [];
  for (let c = 0; c < weeks; c++) {
    const cell = cells[c * 7];
    if (cell && cell.d.getDate() <= 7) months.push({ col: c, label: cell.d.toLocaleDateString("en-IN", { month: "short" }) });
  }
  const active = cells.filter((c) => c?.a && c.a.answered > 0);

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-block">
          <div className="relative mb-1 ml-7 h-4 text-[0.65rem] text-fg-muted">
            {months.map((m) => (
              <span key={m.col} className="absolute" style={{ left: m.col * 15 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            <div className="mr-1 grid w-6 grid-rows-7 gap-[3px] text-[0.6rem] text-fg-subtle">
              {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
                <span key={i} className="leading-3">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label={`Practice activity over the last ${weeks} weeks: ${active.length} active days.`}>
              {cells.map((c, i) =>
                c ? (
                  <span
                    key={c.k}
                    tabIndex={-1}
                    onMouseEnter={() => setHover({ k: c.k, d: c.a })}
                    onMouseLeave={() => setHover(null)}
                    className={cn("size-3 rounded-[3px] transition-transform hover:scale-125", fill[level(c.a?.answered ?? 0)], c.k === dayKey(today) && "ring-1 ring-fg-muted ring-offset-1 ring-offset-surface")}
                  />
                ) : (
                  <span key={`f${i}`} className="size-3" />
                ),
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-fg-muted">
        <p aria-live="polite" className="min-h-4 tabular-nums">
          {hover
            ? `${new Date(hover.k + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · ${hover.d?.answered ?? 0} questions${hover.d?.answered ? ` · ${Math.round((hover.d.correct / hover.d.answered) * 100)}% correct` : ""}`
            : "Hover a day for details"}
        </p>
        <span className="flex items-center gap-1.5">
          Less
          {fill.map((f) => (
            <span key={f} className={cn("size-2.5 rounded-[2px]", f)} />
          ))}
          More
        </span>
      </div>
      <div className="sr-only">
      <table>
        <caption>Questions answered per day</caption>
        <tbody>
          {active.map((c) => (
            <tr key={c!.k}>
              <th scope="row">{c!.k}</th>
              <td>{c!.a!.answered}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/**
 * Weekly accuracy — one series, so no legend box; the title names it.
 * Bars sit on a shared baseline with a 2px surface gap; hover shows values.
 */
export function TrendBars({ data, className }: { data: { label: string; answered: number; accuracy: number | null }[]; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? data.length - 1;
  const cur = data[shown];
  return (
    <div className={className}>
      <p className="text-xs tabular-nums text-fg-muted" aria-live="polite">
        Week of {cur.label}: <span className="text-fg">{cur.accuracy === null ? "no practice" : `${Math.round(cur.accuracy * 100)}% accuracy`}</span>
        {cur.answered ? ` · ${cur.answered} questions` : ""}
      </p>
      <div className="relative mt-3 h-32">
        {[0.25, 0.5, 0.75].map((g) => (
          <div key={g} aria-hidden className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${g * 100}%` }} />
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]" role="img" aria-label={`Weekly accuracy for the last ${data.length} weeks`}>
          {data.map((d, i) => (
            <button
              key={d.label}
              type="button"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`Week of ${d.label}: ${d.accuracy === null ? "no practice" : `${Math.round(d.accuracy * 100)}% accuracy, ${d.answered} questions`}`}
              className="group flex h-full flex-1 items-end"
            >
              <span
                className={cn("w-full rounded-t-[4px] transition-colors", i === shown ? "bg-fg" : "bg-fg/30 group-hover:bg-fg/60", d.accuracy === null && "bg-surface-3")}
                style={{ height: `${Math.max(3, (d.accuracy ?? 0) * 100)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[0.65rem] text-fg-subtle">
        <span>{data[0].label}</span>
        <span>This week</span>
      </div>
    </div>
  );
}

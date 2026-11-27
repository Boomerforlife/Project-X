import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { sittingLabel, type PyqPaper } from "@/lib/data/pyq";
import type { Track } from "@/lib/exams";
import { routes } from "@/lib/routes";
import { SUBJECT_STYLE } from "@/lib/subjects";
import { PaperTileStatus } from "./PaperActions";

/** Server-rendered paper card for the PYQ hub and year pages; the student's own status is a small client island. */
export function PaperTile({ paper: p, track, headingLevel = 3 }: { paper: PyqPaper; track: Track; headingLevel?: 3 | 4 }) {
  const H = `h${headingLevel}` as const;
  const label = sittingLabel(p) || p.title;
  return (
    <li className="relative flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <H className="font-semibold leading-snug">
          {/* The whole card is the link (stretched); the status island sits above it. */}
          <Link href={routes.pyqPaper(track, p.year, p.slug)} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-fg">
            {label}
          </Link>
        </H>
        {p.isDemo && <span className="rounded-sm border border-review/40 px-1.5 font-pixel text-[0.55rem] uppercase tracking-widest text-review">Demo</span>}
      </div>
      <p className="mt-1 text-sm tabular-nums text-fg-muted">
        {p.questionCount} questions · {p.durationMin} min
      </p>
      {p.sections.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {p.sections.map((sec) => (
            <span key={sec.name} className={cn("text-xs tabular-nums", sec.subject ? SUBJECT_STYLE[sec.subject].text : "text-fg-muted")}>
              {sec.name} {sec.questionCount}
            </span>
          ))}
        </div>
      )}
      {p.numericalCounted ? <p className="mt-2 text-xs text-fg-muted">Numericals: best {p.numericalCounted} per subject count</p> : null}
      <div className="mt-auto">
        <PaperTileStatus slug={p.slug} />
        <span aria-hidden className="mt-3 inline-flex items-center gap-1.5 text-sm text-fg-soft">
          CBT, timed or untimed <Icon name="arrowRight" className="size-3.5" />
        </span>
      </div>
    </li>
  );
}

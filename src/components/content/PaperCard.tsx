import Link from "next/link";
import type { PaperSummary } from "@/contracts";
import { Icon } from "@/components/ui/Icon";
import { EXAMS } from "@/lib/exams";

/** Server-rendered paper card for public PYQ listings. Attempt history lives in the app. */
export function PaperCard({ paper }: { paper: PaperSummary }) {
  return (
    <li>
      <Link
        href={`/tests/${paper.id}/`}
        className="group flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-colors hover:border-line-strong"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-pixel text-[0.62rem] uppercase tracking-[0.16em] text-fg-muted">{EXAMS[paper.exam].name}</p>
          {paper.isDemo && <span className="rounded-sm border border-review/40 px-1.5 font-pixel text-[0.55rem] uppercase tracking-widest text-review">Demo</span>}
        </div>
        <h3 className="mt-2 text-lg font-semibold leading-snug">{paper.title.replace(`${EXAMS[paper.exam].name} `, "")}</h3>
        <p className="mt-1 text-sm tabular-nums text-fg-muted">
          {paper.questionCount ?? "—"} questions · {paper.durationMinutes} min
        </p>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-fg-soft group-hover:text-fg">
          Attempt in CBT or practice <Icon name="arrowRight" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </li>
  );
}

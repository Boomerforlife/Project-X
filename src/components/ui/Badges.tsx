import type { Difficulty, QuestionType, Source, SubjectId, VerificationStatus } from "@/contracts";
import { cn } from "@/lib/cn";
import { sourceLabel } from "@/lib/source";
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, SUBJECT_STYLE } from "@/lib/subjects";

export function Chip({ className, children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm border border-line px-2 text-xs font-medium text-fg-soft",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SubjectTag({ subject, label }: { subject: SubjectId; label: string }) {
  const s = SUBJECT_STYLE[subject];
  return (
    <Chip>
      <span aria-hidden className={cn("size-1.5", s.bg)} />
      <span className={s.text}>{label}</span>
    </Chip>
  );
}

export function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
  const bars = { easy: 1, medium: 2, hard: 3 }[difficulty];
  // Exam bodies publish no difficulty: every rating we show is an estimate (rubric-based, later student results).
  return (
    <Chip title="Estimated difficulty, not an official rating">
      <span className="sr-only">Estimated difficulty: </span>
      <span aria-hidden className="flex items-end gap-px">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("w-[3px]", n <= bars ? "bg-fg-soft" : "bg-line-strong")} style={{ height: 3 + n * 2 }} />
        ))}
      </span>
      {DIFFICULTY_LABEL[difficulty]}
    </Chip>
  );
}

export function TypeChip({ type }: { type: QuestionType }) {
  return <Chip>{QUESTION_TYPE_LABEL[type]}</Chip>;
}

/** Where the question comes from ("JEE Advanced 2025 Paper 1"), shown with every question while attempting it. */
export function SourceTag({ source }: { source: Source }) {
  const label = sourceLabel(source);
  return (
    <Chip className="max-w-full">
      <span className="sr-only">Source: </span>
      <span className="truncate" title={label}>
        {label}
      </span>
    </Chip>
  );
}

/**
 * Verification copy. PROPOSED wording — the meaning of each status must be
 * agreed with Person 2 (CLAUDE.md §12). Nothing here says "verified" unless a
 * human or an official key was involved.
 */
export const VERIFICATION_COPY: Record<VerificationStatus, { label: string; help: string; tone: "neutral" | "good" | "warn" }> = {
  extracted: { label: "Unreviewed", help: "Imported from the source and not yet checked.", tone: "neutral" },
  processed: { label: "Unreviewed", help: "Formatted and classified, but the answer has not been checked yet.", tone: "neutral" },
  ai_checked: { label: "AI-checked", help: "An automated check agreed with this answer. It has not been reviewed by a person and may still contain errors.", tone: "neutral" },
  official_key_checked: { label: "Matches official key", help: "The answer matches the officially published answer key.", tone: "good" },
  human_reviewed: { label: "Reviewed", help: "A subject reviewer checked this question and its answer.", tone: "good" },
  disputed: { label: "Under review", help: "Someone has raised a concern about this answer. Treat it with caution until it is resolved.", tone: "warn" },
};

export function VerificationBadge({ status, note }: { status: VerificationStatus; note?: string }) {
  const c = VERIFICATION_COPY[status];
  const icon = c.tone === "good" ? "✓" : c.tone === "warn" ? "!" : "·";
  return (
    <span className="group relative inline-flex">
      <Chip
        className={cn(
          c.tone === "good" && "border-ok/40 text-ok",
          c.tone === "warn" && "border-review/50 text-review",
        )}
      >
        <span aria-hidden className="font-mono">{icon}</span>
        {c.label}
      </Chip>
      <span className="sr-only">: {note ?? c.help}</span>
    </span>
  );
}

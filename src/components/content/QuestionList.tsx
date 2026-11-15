import Link from "next/link";
import type { Question, QuestionCard } from "@/contracts";
import { DifficultyChip, TypeChip, VerificationBadge } from "@/components/ui/Badges";
import { RichText } from "./RichText";

/** Server-rendered question previews — crawlable links into public question pages. */
export function QuestionList({ questions, chapterNames, track = "jee" }: { questions: (QuestionCard & { verification?: Question["verification"] })[]; chapterNames?: Map<string, string>; track?: string }) {
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface/40">
      {questions.map((q, i) => {
        const body = (
          <>
            <span className="font-pixel text-[0.65rem] tabular-nums text-fg-subtle">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="line-clamp-3 leading-relaxed text-fg-soft group-hover:text-fg">
                <RichText value={q.stem} inline />
              </p>
              <div className="flex flex-wrap gap-2">
                {chapterNames && <span className="text-xs text-fg-muted">{chapterNames.get(q.chapter)}</span>}
                <TypeChip type={q.type} />
                {q.difficulty && <DifficultyChip difficulty={q.difficulty} />}
                {q.verification && <VerificationBadge status={q.verification.status} />}
              </div>
            </div>
          </>
        );
        return (
          <li key={q.id}>
            {q.publicPage ? (
              <Link href={`/${track}/questions/${q.slug}/`} className="group flex gap-4 p-5 transition-colors hover:bg-surface">
                {body}
              </Link>
            ) : (
              // Not eligible for a public page: previewed here, practised inside the app.
              <Link href={`/practice/new/?q=${q.id}`} className="group flex gap-4 p-5 transition-colors hover:bg-surface">
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

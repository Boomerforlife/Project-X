import Link from "next/link";
import type { Question, QuestionCard } from "@/contracts";
import { DifficultyChip, TypeChip, VerificationBadge } from "@/components/ui/Badges";
import { DATA_SOURCE } from "@/lib/site";
import { RichText } from "./RichText";

/**
 * Practice link for a question without a public page. API mode identifies it by slug plus its exam/subject/chapter so
 * the launcher can find it in the practice list (AI-checked questions are not served by the public question endpoint).
 * Mock mode keeps the fixture id.
 */
function practiceHref(q: QuestionCard): string {
  if (DATA_SOURCE !== "api") return `/practice/new/?q=${encodeURIComponent(q.id)}`;
  const p = new URLSearchParams({ slug: q.slug, subject: q.subject, chapter: q.chapter });
  if (q.exams[0]) p.set("exam", q.exams[0]);
  return `/practice/new/?${p.toString()}`;
}

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
                {/* Only previous-year questions carry a year. */}
                {q.year ? <span className="rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-fg-muted">PYQ {q.year}</span> : null}
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
              <Link href={practiceHref(q)} className="group flex gap-4 p-5 transition-colors hover:bg-surface">
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

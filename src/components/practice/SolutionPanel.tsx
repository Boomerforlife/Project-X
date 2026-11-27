import type { Question, Solution } from "@/contracts";
import { Blocks } from "@/components/content/Blocks";
import { RichText } from "@/components/content/RichText";
import { VerificationBadge } from "@/components/ui/Badges";
import { keyLabel } from "@/lib/demo/scoring";
import { DATA_SOURCE } from "@/lib/site";

export const PROVENANCE: Record<Solution["answerProvenance"], string> = {
  official_key: "Answer from the official key",
  derived: "Answer worked out by our solvers, not from an official key",
  unknown: "Answer source not recorded",
};

export const AUTHOR: Record<Solution["generatedBy"], string> = {
  human: "Written by a subject expert",
  ai: "AI-generated explanation",
  ai_human_edited: "AI-assisted, edited by a person",
  official: "From the official source",
};

/** Final answer kept separate from the reasoning (CLAUDE.md §7). */
export function SolutionPanel({ question, solution }: { question: Question; solution: Solution | null }) {
  if (!solution) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-5 text-sm text-fg-muted">
        A worked solution for this question isn&rsquo;t available yet.
      </div>
    );
  }
  return (
    <section aria-label="Solution" className="overflow-hidden rounded-xl border border-line bg-surface">
      <DisputedNote solution={solution} className="border-b border-review/40 px-5 py-3" />
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <p className="font-pixel text-[0.65rem] uppercase tracking-[0.2em] text-fg-muted">Answer</p>
          <p className="mt-1.5 text-2xl font-semibold">
            {question.type === "numerical" ? "" : question.type === "multiple_correct" ? "Options " : "Option "}
            {keyLabel(solution)}
          </p>
        </div>
        <p className="max-w-xs text-right text-xs text-fg-muted">{PROVENANCE[solution.answerProvenance]}</p>
      </div>
      <div className="px-5 py-5">
        <p className="font-pixel text-[0.65rem] uppercase tracking-[0.2em] text-fg-muted">Solution</p>
        <SolutionSteps solution={solution} />
      </div>
      <p className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 text-xs text-fg-muted">
        <span>{AUTHOR[solution.generatedBy]}</span>
        {/* API practice responses carry no verification status, so no badge is claimed. */}
        {DATA_SOURCE !== "api" && (
          <>
            <span aria-hidden>·</span>
            <VerificationBadge status={solution.verification.status} note={solution.verification.note} />
          </>
        )}
      </p>
    </section>
  );
}

/** "This answer is under review": shown wherever a disputed solution appears (player, results, public page). */
export function DisputedNote({ solution, className }: { solution: Solution; className?: string }) {
  if (solution.verification.status !== "disputed") return null;
  return (
    <div role="note" className={"bg-review/5 text-sm " + (className ?? "")}>
      <span className="font-medium text-review">This answer is under review.</span>{" "}
      <span className="text-fg-soft">{solution.verification.note ?? "Treat it with caution until it is resolved."}</span>
    </div>
  );
}

/** The worked solution: summary, then numbered steps. One renderer for the player, results and public pages. */
export function SolutionSteps({ solution }: { solution: Solution }) {
  return (
    <>
      {solution.extras?.summary && (
        <p className="mt-3 leading-relaxed text-fg-soft">
          <RichText value={solution.extras.summary} />
        </p>
      )}
      {solution.steps.length === 0 && !solution.extras?.summary && (
        <p className="mt-3 text-sm text-fg-muted">
          A worked solution for this question isn&rsquo;t written yet.
          {solution.answerProvenance === "official_key" ? <> The answer above is the exam body&rsquo;s official final answer key.</> : null}
        </p>
      )}
      {solution.steps.length > 0 && (
        <ol className="mt-3 space-y-4">
          {solution.steps.map((st, i) => (
            <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-2">
              <span className="pt-0.5 font-pixel text-xs text-fg-subtle">{i + 1}.</span>
              <div className="min-w-0 leading-relaxed">
                {st.title && <p className="mb-1 font-medium">{st.title}</p>}
                <div className="text-fg-soft">
                  <Blocks blocks={st.blocks} fallback={st.body} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

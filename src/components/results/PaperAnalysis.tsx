"use client";
/**
 * Paper analysis on the results page (Tabby Plus; owner decision 2026-11-20). The API decides: Plus gets the analysis,
 * Free gets 403 PREMIUM_REQUIRED and sees a short locked card instead. Free users keep the score, subject totals and the
 * full question review above this section.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusBadge } from "@/components/billing/PlusBadge";
import { Bar, Card } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { sessionAnalysis } from "@/lib/api/student";
import { isApiError } from "@/lib/api/errors";
import type { PaperAnalysis as Analysis } from "@/lib/api/schemas";
import { subjectFromApi } from "@/lib/api/adapters/ids";
import { SUBJECT_STYLE } from "@/lib/subjects";
import { useAds } from "@/components/ads/AdsProvider";

type State = { status: "loading" } | { status: "locked" } | { status: "error" } | { status: "ok"; data: Analysis };

const secs = (ms: number | null) => (ms == null ? "–" : ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${Math.round(ms / 1000)}s`);
const num = (d: string) => Number(d);
const subjectText = (segment: string, name: string) => {
  const s = subjectFromApi(segment, name)?.subject;
  return s ? SUBJECT_STYLE[s].text : "text-fg";
};

export function PaperAnalysis({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<{ id: string; value: State } | null>(null);
  const { entitlements } = useAds();
  useEffect(() => {
    let live = true;
    sessionAnalysis(sessionId).then(
      (data) => live && setState({ id: sessionId, value: { status: "ok", data } }),
      (e: unknown) => {
        const locked = isApiError(e) && e.status === 403 && (e.details as { reason?: string } | undefined)?.reason === "PREMIUM_REQUIRED";
        if (live) setState({ id: sessionId, value: locked ? { status: "locked" } : { status: "error" } });
      },
    );
    return () => {
      live = false;
    };
  }, [sessionId]);
  const s: State = state?.id === sessionId ? state.value : { status: "loading" };

  return (
    <section aria-labelledby="analysis-h" className="mt-12">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="analysis-h" className="text-xl font-semibold">
          Paper analysis
        </h2>
        <PlusBadge />
      </div>
      {s.status === "loading" && <p className="mt-4 text-sm text-fg-muted">Loading analysis…</p>}
      {s.status === "error" && <p className="mt-4 text-sm text-fg-muted">The analysis couldn&rsquo;t load. Reload the page to try again.</p>}
      {s.status === "locked" && (
        <Card className="mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">See where the marks went</p>
            <ul className="mt-2 space-y-1 text-sm text-fg-soft">
              <li>Chapter-by-chapter marks and accuracy for this paper</li>
              <li>Time per question, on right vs wrong answers, and your slowest questions</li>
              <li>Each subject compared with your previous attempt</li>
            </ul>
          </div>
          {entitlements?.payments_enabled !== false && (
            <Link href="/pricing/" className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-fg px-4 text-sm font-medium text-bg hover:bg-fg-soft">
              Get Plus
            </Link>
          )}
        </Card>
      )}
      {s.status === "ok" && <AnalysisBody a={s.data} />}
    </section>
  );
}

function AnalysisBody({ a }: { a: Analysis }) {
  const attemptedChapters = a.chapters.filter((c) => c.attempted > 0);
  const weakest = [...attemptedChapters]
    .filter((c) => num(c.max) > 0)
    .sort((x, y) => num(x.score) / num(x.max) - num(y.score) / num(y.max))
    .slice(0, 3)
    .map((c) => c.chapter.slug);
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-5">
        <p className="text-sm font-medium">By chapter</p>
        <p className="mt-1 text-xs text-fg-muted">Per-question marks; a paper&rsquo;s &ldquo;best N numericals&rdquo; rule applies to the total only.</p>
        <ul className="mt-4 space-y-3">
          {a.chapters.map((c) => {
            const pct = num(c.max) ? Math.max(0, num(c.score)) / num(c.max) : 0;
            const focus = weakest.includes(c.chapter.slug);
            return (
              <li key={c.chapter.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className={subjectText(c.subject.segment, c.subject.name)}>{c.chapter.name}</span>
                    {focus && <span className="ml-2 rounded border border-review/50 px-1 text-[0.65rem] uppercase tracking-wider text-review">Focus</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-fg-muted">
                    <span className="font-medium text-fg">{num(c.score)}</span>/{num(c.max)}
                  </span>
                </div>
                <Bar value={pct} className="mt-1" label={`${c.chapter.name} score`} />
                <p className="mt-0.5 text-xs text-fg-muted">
                  {c.correct} correct · {c.incorrect} incorrect · {c.questions - c.attempted} skipped
                </p>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="grid content-start gap-4">
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Icon name="clock" className="size-4" /> Time
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["Per answer", a.time.avg_ms],
              ["Right", a.time.correct_avg_ms],
              ["Wrong", a.time.incorrect_avg_ms],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-surface-2 py-2">
                <dd className="font-display text-lg font-semibold tabular-nums">{secs(v as number | null)}</dd>
                <dt className="text-[0.68rem] text-fg-muted">{k}</dt>
              </div>
            ))}
          </dl>
          {a.time.slowest.length > 0 && (
            <>
              <p className="mt-4 text-xs text-fg-muted">Slowest questions</p>
              <ul className="mt-1 space-y-1 text-sm">
                {a.time.slowest.map((q) => (
                  <li key={q.question_id} className="flex justify-between tabular-nums">
                    <span>
                      Q{q.number ?? "?"} <span className={cn("text-xs", q.is_correct ? "text-ok" : "text-bad")}>{q.is_correct ? "right" : "wrong"}</span>
                    </span>
                    <span className="text-fg-muted">{secs(q.time_ms)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-sm font-medium">{a.previous ? "Compared with your previous attempt" : "By subject"}</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {a.sections.map((s) => {
              const delta = s.previous_score == null ? null : num(s.score) - num(s.previous_score);
              return (
                <li key={s.subject.id} className="flex justify-between tabular-nums">
                  <span className={subjectText(s.subject.segment, s.subject.name)}>{s.subject.name}</span>
                  <span>
                    {num(s.score)}
                    {delta != null && (
                      <span className={cn("ml-2 text-xs", delta >= 0 ? "text-ok" : "text-review")}>
                        {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {!a.previous && <p className="mt-3 text-xs text-fg-muted">Retry this paper to see subject-by-subject progress.</p>}
        </Card>
      </div>
    </div>
  );
}

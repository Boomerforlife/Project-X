"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import type { Difficulty, ExamId, QuestionType, SubjectId } from "@/contracts";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { startList, useDemo } from "@/lib/demo/store";
import type { Track } from "@/lib/exams";
import { routes } from "@/lib/routes";
import { QUESTION_TYPE_LABEL } from "@/lib/subjects";
import { applyFilters, filterOptions, type ChapterRow } from "@/lib/chapter-filter";
import { useQueryState } from "./useQueryState";
import { useWhenLoaded } from "@/lib/useWhenLoaded";

export type { ChapterRow } from "@/lib/chapter-filter";

const PAGE = 25;
const DIFF_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/**
 * The chapter's question list for everyone (UX audit P1.2): filter by year, type, difficulty and topic (when topics are
 * tagged), plus the student's own mistakes and bookmarks when signed in; "Practise these" walks the filtered list in the
 * player with Previous/Next. Row bodies are rendered on the server (maths included) and passed in, so the HTML stays
 * complete for crawlers and this island ships no KaTeX.
 */
export function ChapterQuestions({
  rows,
  bodies,
  track,
  exam,
  subject,
  chapter,
  chapterName,
  topicNames,
}: {
  rows: ChapterRow[];
  bodies: Record<string, ReactNode>;
  track: Track;
  exam: ExamId;
  subject: SubjectId;
  chapter: string;
  chapterName: string;
  topicNames: Record<string, string>;
}) {
  const s = useDemo();
  const router = useRouter();
  const [q, setQ] = useQueryState();
  const opts = useMemo(() => filterOptions(rows), [rows]);
  const year = opts.years.map(String).includes(q.get("year") ?? "") ? q.get("year") : null;
  const type = opts.types.includes(q.get("type") as QuestionType) ? q.get("type") : null;
  const difficulty = opts.diffs.includes(q.get("difficulty") as Difficulty) ? q.get("difficulty") : null;
  const topic = opts.topics.includes(q.get("topic") ?? "") ? q.get("topic") : null;
  const signedIn = Boolean(s?.user);
  const mineParam = signedIn ? q.get("mine") : null;
  const mine = mineParam === "mistakes" || mineParam === "bookmarks" ? mineParam : null;
  const isMistake = (id: string) => s?.mistakes[id]?.status === "open";
  const isBookmark = (id: string) => Boolean(s?.bookmarks[id]);
  const filtered = applyFilters(rows, { year, type, difficulty, topic }, mine === "mistakes" ? isMistake : mine === "bookmarks" ? isBookmark : undefined);
  const key = [year, type, difficulty, topic, mine].join("|");
  const [limit, setLimit] = useState<{ key: string; n: number }>({ key, n: PAGE });
  const shown = limit.key === key ? limit.n : PAGE;
  const [busy, setBusy] = useState(false);
  const any = Boolean(year || type || difficulty || topic || mine);

  const here = () => `${window.location.pathname}${window.location.search}`;
  const practise = async (startIndex: number) => {
    if (!signedIn) {
      router.push(routes.login(here()));
      return;
    }
    setBusy(true);
    try {
      const label = [year, type ? QUESTION_TYPE_LABEL[type as QuestionType] : null, difficulty ? DIFF_LABEL[difficulty as Difficulty] : null].filter(Boolean).join(" · ");
      const id = await startList({
        exam,
        title: label ? `${chapterName} · ${label}` : chapterName,
        items: filtered.map((r) => ({ questionId: r.id })),
        startIndex,
        scope: { source: "chapter", subject, chapter },
      });
      router.push(`${routes.session(id)}&from=${encodeURIComponent(here())}`);
    } catch {
      setBusy(false);
      toast("Couldn't start that practice. Please try again.", { icon: "alert", tone: "warn" });
    }
  };
  // A click while the account is still loading waits for it instead of being sent to sign-in.
  const practiseWhenLoaded = useWhenLoaded(s !== null, practise);
  const firstPublic = filtered.find((r) => r.publicPage);

  return (
    <div>
      {/* One horizontally scrolling row of filter chips on phones (audit section I). */}
      <div role="group" aria-label="Filter questions" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:flex-wrap sm:px-0">
        <ChipSelect label="Year" value={year} onChange={(v) => setQ({ year: v })} options={opts.years.map((y) => ({ id: String(y), label: String(y) }))} />
        {opts.types.length > 1 && <ChipSelect label="Type" value={type} onChange={(v) => setQ({ type: v })} options={opts.types.map((t) => ({ id: t, label: QUESTION_TYPE_LABEL[t] }))} />}
        {opts.diffs.length > 1 && <ChipSelect label="Difficulty" value={difficulty} onChange={(v) => setQ({ difficulty: v })} options={opts.diffs.map((d) => ({ id: d, label: DIFF_LABEL[d] }))} />}
        {opts.topics.length > 1 && <ChipSelect label="Topic" value={topic} onChange={(v) => setQ({ topic: v })} options={opts.topics.map((t) => ({ id: t, label: topicNames[t] ?? t.replace(/-/g, " ") }))} />}
        {signedIn && (
          <ChipSelect
            label="Mine"
            value={mine}
            onChange={(v) => setQ({ mine: v })}
            options={[
              { id: "mistakes", label: "My mistakes" },
              { id: "bookmarks", label: "Bookmarked" },
            ]}
          />
        )}
        {any && (
          <button type="button" onClick={() => setQ({ year: null, type: null, difficulty: null, topic: null, mine: null })} className="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted" aria-live="polite">
          {any ? `${filtered.length} of ${rows.length} questions` : `${rows.length} questions`}
          {year ? ` from ${year}` : ""}
        </p>
        {filtered.length > 0 &&
          (signedIn || !firstPublic ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => practiseWhenLoaded(0)} className="max-sm:min-h-11">
              <Icon name="play" className="size-3.5" /> {busy ? "Starting…" : `Practise ${any ? "these" : "all"} ${filtered.length}`}
            </Button>
          ) : (
            <Link href={routes.question(track, firstPublic.slug)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm hover:border-fg sm:min-h-9">
              <Icon name="play" className="size-3.5" /> Start with the first one · free
            </Link>
          ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
          No questions match these filters.{" "}
          <button type="button" className="underline underline-offset-4 hover:text-fg" onClick={() => setQ({ year: null, type: null, difficulty: null, topic: null, mine: null })}>
            Clear filters
          </button>
        </div>
      ) : (
        <ol className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface/40">
          {filtered.slice(0, shown).map((r, i) => {
            const badges = (
              <>
                {signedIn && isMistake(r.id) && <span className="rounded-sm border border-bad/50 px-1.5 py-0.5 text-[11px] text-bad">Wrong earlier</span>}
                {signedIn && isBookmark(r.id) && <span className="rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-fg-muted">Bookmarked</span>}
              </>
            );
            const inner = (
              <>
                <span className="w-6 shrink-0 font-pixel text-[0.65rem] tabular-nums text-fg-subtle">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  {bodies[r.id]}
                  <div className="mt-2 flex flex-wrap gap-2">{badges}</div>
                </div>
              </>
            );
            return (
              <li key={r.id}>
                {r.publicPage ? (
                  <Link href={routes.question(track, r.slug)} className="group flex gap-4 p-4 transition-colors hover:bg-surface sm:p-5">
                    {inner}
                  </Link>
                ) : (
                  // No free public page (answer AI-checked, not official): practised inside the app, inside this list.
                  <button type="button" disabled={busy} onClick={() => practiseWhenLoaded(i)} className="group flex w-full gap-4 p-4 text-left transition-colors hover:bg-surface sm:p-5">
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {filtered.length > shown && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" size="sm" className="max-sm:min-h-11" onClick={() => setLimit({ key, n: shown + PAGE })}>
            Show {Math.min(PAGE, filtered.length - shown)} more
          </Button>
        </div>
      )}
    </div>
  );
}

function ChipSelect({ label, value, onChange, options }: { label: string; value: string | null; onChange: (v: string | null) => void; options: { id: string; label: string }[] }) {
  if (options.length === 0) return null;
  return (
    <label className={cn("relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border pl-3 pr-8 text-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 sm:min-h-9", value ? "border-fg bg-surface-2 text-fg" : "border-line text-fg-soft hover:border-line-strong")}>
      <span className="text-fg-muted">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="appearance-none bg-transparent font-medium outline-none [&>option]:bg-surface">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" className="pointer-events-none absolute right-2.5 size-3.5 text-fg-muted" />
    </label>
  );
}

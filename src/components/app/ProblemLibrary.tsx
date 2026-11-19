"use client";

import { PlusBadge } from "@/components/billing/PlusBadge";

/**
 * Problem library: the browsable problem set. Syllabus-first (grouped by chapter, in syllabus order) rather than one long
 * numbered table, so it reads as a study tool, not a coding-interview list. Filters live in the URL.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Difficulty, ExamId, SubjectId } from "@/contracts";
import { AdSlot, useInfeedPositions } from "@/components/ads/AdSlot";
import { RichText } from "@/components/content/RichText";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { DifficultyChip, TypeChip } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { Segmented, Skeleton } from "@/components/ui/Primitives";
import { toast } from "@/components/ui/Toast";
import { isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { catalog } from "@/lib/data/catalog";
import type { DemoState } from "@/lib/demo/types";
import { EXAMS } from "@/lib/exams";
import {
  formatNumber,
  listProblems,
  openProblem,
  problemSummary,
  todaysProblem,
  type LibFilters,
  type LibProblem,
  type LibSummary,
} from "@/lib/problems";
import { SUBJECT_STYLE } from "@/lib/subjects";

type View = "chapters" | "all";
type StatusFilter = "any" | "todo" | "attempted" | "solved";
const DIFFS: Difficulty[] = ["easy", "medium", "hard"];
const DIFF_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

function useFilters(exam: ExamId) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const subjects = EXAMS[exam].subjects;
  const rawSubject = params.get("subject") as SubjectId | null;
  const subject: SubjectId | "all" = rawSubject && subjects.includes(rawSubject) ? rawSubject : "all";
  const difficulty = (params.get("difficulty") ?? "").split(",").filter((d): d is Difficulty => DIFFS.includes(d as Difficulty));
  const status = (["todo", "attempted", "solved"].includes(params.get("status") ?? "") ? params.get("status") : "any") as StatusFilter;
  const view: View = params.get("view") === "all" ? "all" : "chapters";
  const q = params.get("q") ?? "";
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const u = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || v === "any" || v === "all" || (k === "view" && v === "chapters")) u.delete(k);
        else u.set(k, v);
      }
      const s = u.toString();
      router.replace(`${path}${s ? `?${s}` : ""}#library`, { scroll: false });
    },
    [params, router, path],
  );
  return { subject, difficulty, status, view, q, set };
}

export function ProblemLibrary({ s }: { s: DemoState & { user: NonNullable<DemoState["user"]> } }) {
  const exam = s.user.exam;
  const f = useFilters(exam);
  const router = useRouter();
  const [summary, setSummary] = useState<LibSummary | null>(null);
  const [daily, setDaily] = useState<{ date: string; problem: LibProblem } | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [search, setSearch] = useState(f.q);

  // Status changes after every attempt, so re-read when the local state object changes.
  useEffect(() => {
    let live = true;
    problemSummary(exam, s).then((x) => live && setSummary(x), () => live && setSummary(null));
    todaysProblem(exam, s).then((x) => live && setDaily(x), () => undefined);
    return () => {
      live = false;
    };
  }, [exam, s]);

  // Debounce search into the URL.
  useEffect(() => {
    if (search === f.q) return;
    const t = setTimeout(() => f.set({ q: search.trim().length >= 2 ? search.trim() : null }), 300);
    return () => clearTimeout(t);
  }, [search, f]);

  const base: Omit<LibFilters, "offset" | "limit"> = useMemo(
    () => ({
      exam,
      ...(f.subject !== "all" ? { subject: f.subject } : {}),
      ...(f.difficulty.length ? { difficulty: f.difficulty } : {}),
      ...(f.status !== "any" ? { status: f.status } : {}),
      ...(f.q ? { q: f.q } : {}),
    }),
    [exam, f.subject, f.difficulty, f.status, f.q],
  );

  const open = async (p: LibProblem) => {
    if (p.locked) {
      router.push("/pricing/");
      return;
    }
    setOpening(p.number);
    try {
      const id = await openProblem(p.number, exam, s);
      router.push(`/practice/session/?id=${id}`);
    } catch (e) {
      setOpening(null);
      if (isApiError(e) && (e.details as { reason?: string } | undefined)?.reason === "PREMIUM_REQUIRED") router.push("/pricing/");
      else toast("Couldn't open that problem. Please try again.", { icon: "alert", tone: "warn" });
    }
  };

  const pickOne = async () => {
    try {
      const page = await listProblems({ ...base, status: "todo", offset: 0, limit: 50 }, s);
      const pool = page.items.filter((p) => !p.locked);
      if (!pool.length) {
        toast("Nothing new matches these filters", { icon: "info", tone: "warn" });
        return;
      }
      await open(pool[Math.floor(Math.random() * pool.length)]!);
    } catch {
      toast("Couldn't pick a problem. Please try again.", { icon: "alert", tone: "warn" });
    }
  };

  const filtered = f.difficulty.length > 0 || f.status !== "any" || f.q !== "";

  return (
    <section id="library" aria-labelledby="library-h" className="mt-14 scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h2 id="library-h" className="text-2xl font-semibold">
            Problem library
          </h2>
          <p className="mt-1 max-w-xl text-fg-muted">Every problem in syllabus order. A problem can have several versions: same idea, different numbers.</p>
        </div>
        <SolvedStrip summary={summary} />
      </div>

      {daily && <TodayCard daily={daily} busy={opening === daily.problem.number} onOpen={() => open(daily.problem)} />}

      {/* Controls */}
      <div className="mt-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Subject"
            value={f.subject}
            onChange={(v) => f.set({ subject: v })}
            options={[{ id: "all" as const, label: "All subjects" }, ...EXAMS[exam].subjects.map((id) => ({ id, label: <span className={cn(f.subject === id && SUBJECT_STYLE[id].text)}>{catalog.subject(id)?.name ?? id}</span> }))]}
          />
          <Segmented
            label="View"
            value={f.view}
            onChange={(v) => f.set({ view: v })}
            options={[
              { id: "chapters" as const, label: "By chapter" },
              { id: "all" as const, label: "All problems" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Difficulty" className="flex flex-wrap gap-2">
            {DIFFS.map((d) => {
              const on = f.difficulty.includes(d);
              const n = summary?.problems[d];
              const empty = n === 0;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  disabled={empty}
                  title={empty ? `${DIFF_LABEL[d]} problems are being added` : undefined}
                  onClick={() => f.set({ difficulty: (on ? f.difficulty.filter((x) => x !== d) : [...f.difficulty, d]).join(",") || null })}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
                    on ? "border-fg bg-surface-2 text-fg" : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
                    empty && "cursor-not-allowed opacity-50 hover:border-line hover:text-fg-muted",
                  )}
                >
                  <DiffBars d={d} />
                  {DIFF_LABEL[d]}
                  {n !== undefined && <span className="tabular-nums text-fg-subtle">{n}</span>}
                </button>
              );
            })}
          </div>
          <label className="sr-only" htmlFor="lib-status">
            Status
          </label>
          <select
            id="lib-status"
            value={f.status}
            onChange={(e) => f.set({ status: e.target.value })}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-fg"
          >
            <option value="any">Any status</option>
            <option value="todo">Not started</option>
            <option value="attempted">Tried, not solved</option>
            <option value="solved">Solved</option>
          </select>
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Search problems</span>
            <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search problem text"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-fg-subtle focus:border-fg"
            />
          </label>
          <Button variant="secondary" size="sm" onClick={pickOne} className="h-9">
            <Icon name="shuffle" className="size-4" /> Pick one for me
          </Button>
        </div>
        {summary && summary.problems.hard === 0 && <p className="text-sm text-fg-muted">Hard problems are being added. Easy and Medium are ready now.</p>}
      </div>

      {f.view === "all" ? (
        <FlatList key={JSON.stringify(base)} filters={base} s={s} opening={opening} onOpen={open} filtered={filtered} onClear={() => f.set({ difficulty: null, status: null, q: null })} />
      ) : (
        <ChapterGroups key={JSON.stringify(base)} exam={exam} filters={base} s={s} opening={opening} onOpen={open} filtered={filtered} onClear={() => f.set({ difficulty: null, status: null, q: null })} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ header */

function SolvedStrip({ summary }: { summary: LibSummary | null }) {
  if (!summary) return <Skeleton className="h-14 w-72 rounded-xl" />;
  return (
    <dl className="flex gap-5 rounded-xl border border-line px-4 py-2.5" aria-label="Problems solved by difficulty">
      {DIFFS.map((d) => {
        const total = summary.problems[d];
        const done = summary.solved?.[d] ?? 0;
        return (
          <div key={d} className="min-w-16">
            <dt className="flex items-center gap-1.5 text-xs text-fg-muted">
              <DiffBars d={d} /> {DIFF_LABEL[d]}
            </dt>
            <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums">
              {done}
              <span className="text-sm font-normal text-fg-subtle">/{total}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function TodayCard({ daily, busy, onOpen }: { daily: { date: string; problem: LibProblem }; busy: boolean; onOpen: () => void }) {
  const p = daily.problem;
  const style = SUBJECT_STYLE[p.subject];
  return (
    <div className="surface-flat relative mt-6 flex flex-wrap items-center gap-4 overflow-hidden p-4 sm:flex-nowrap">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", style.bg)} />
      <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-soft">
        <PixelIcon name="star" className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">Today&rsquo;s problem · same for everyone</p>
        <p className="mt-0.5 truncate">
          <span className="font-mono text-sm text-fg-muted">{formatNumber(p.number)}</span> <span className={cn("text-sm", style.text)}>{p.chapterName}</span>
          {p.title ? (
            <>
              {" · "}
              <RichText value={p.title} inline className="text-fg" />
            </>
          ) : null}
        </p>
      </div>
      {p.status === "solved" ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-ok">
          <PixelIcon name="check" className="size-4" /> Solved
        </span>
      ) : (
        <Button size="sm" onClick={onOpen} disabled={busy}>
          {busy ? "Opening…" : "Solve it"}
        </Button>
      )}
    </div>
  );
}

function DiffBars({ d }: { d: Difficulty }) {
  const n = { easy: 1, medium: 2, hard: 3 }[d];
  return (
    <span aria-hidden className="flex items-end gap-px">
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("w-[3px]", i <= n ? "bg-current" : "bg-line-strong")} style={{ height: 3 + i * 2 }} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------- lists */

type ListProps = { filters: Omit<LibFilters, "offset" | "limit">; s: DemoState; opening: number | null; onOpen: (p: LibProblem) => void };

/** First page on mount / filter change / state change (status is fresh after every answer); more pages on demand. */
/** Upper bound for "load everything" (chapter view): 30 pages of 100. */
const MAX_ALL_PAGES = 30;

function usePaged(filters: Omit<LibFilters, "offset" | "limit">, s: DemoState, limit = 50, all = false) {
  const key = JSON.stringify(filters);
  const [page, setPage] = useState<{ items: LibProblem[] | null; total: number; error: boolean }>({ items: null, total: 0, error: false });
  const [more, setMore] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      const f = JSON.parse(key) as LibFilters;
      let r = await listProblems({ ...f, offset: 0, limit }, s);
      const items = [...r.items];
      // Chapter view groups the whole set, so keep reading pages until every problem is in.
      for (let i = 1; all && items.length < r.total && i < MAX_ALL_PAGES && r.items.length > 0; i++) {
        r = await listProblems({ ...f, offset: items.length, limit }, s);
        items.push(...r.items);
      }
      return { items, total: r.total };
    })().then(
      (r) => live && setPage({ items: r.items, total: r.total, error: false }),
      () => live && setPage((p) => ({ ...p, error: true })),
    );
    return () => {
      live = false;
    };
  }, [key, s, limit, all, nonce]);
  const loadMore = () => {
    const offset = page.items?.length ?? 0;
    setMore(true);
    listProblems({ ...(JSON.parse(key) as LibFilters), offset, limit }, s)
      .then(
        (r) => setPage((p) => ({ items: [...(p.items ?? []), ...r.items], total: r.total, error: false })),
        () => setPage((p) => ({ ...p, error: true })),
      )
      .finally(() => setMore(false));
  };
  const retry = () => {
    setPage((p) => ({ ...p, error: false }));
    setNonce((n) => n + 1);
  };
  return { items: page.items, total: page.total, error: page.error, more, loadMore, retry };
}

function FlatList({ filters, s, opening, onOpen, filtered, onClear }: ListProps & { filtered: boolean; onClear: () => void }) {
  const { items, total, error, more, loadMore, retry } = usePaged(filters, s);
  // In-feed ad units go BETWEEN rows (never inside one), so the list is split into chunks only when a unit will render.
  const cuts = useInfeedPositions(items?.length ?? 0, "library-infeed");
  if (error && !items) return <ListError onRetry={retry} />;
  if (!items) return <RowsSkeleton />;
  if (items.length === 0) return <Empty filtered={filtered} onClear={onClear} />;
  return (
    <div className="mt-6">
      <p className="mb-2 text-sm text-fg-muted" aria-live="polite">
        {total} problem{total === 1 ? "" : "s"}
      </p>
      {chunks(items, cuts).map((chunk, ci) => (
        <div key={ci}>
          {ci > 0 && <AdSlot placement="library-infeed" />}
          <ul className="surface divide-y divide-line overflow-hidden p-0">
            {chunk.map((p) => (
              <ProblemRow key={p.number} p={p} showChapter opening={opening === p.number} onOpen={() => onOpen(p)} />
            ))}
          </ul>
        </div>
      ))}
      {items.length < total && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={more}>
            {more ? "Loading…" : `Show more (${total - items.length} left)`}
          </Button>
        </div>
      )}
      {error && <ListError onRetry={loadMore} />}
    </div>
  );
}

/**
 * The whole filtered set, read 100 at a time in sequence and grouped here by chapter in syllabus order. Sequential pages keep
 * calls well under the API's rate limit; per-chapter totals from the server (contract item C4) can replace this later.
 */
function ChapterGroups({ exam, filters, s, opening, onOpen, filtered, onClear }: ListProps & { exam: ExamId; filtered: boolean; onClear: () => void }) {
  const { items, total, error, more, loadMore, retry } = usePaged(filters, s, 100, true);
  const groups = useMemo(() => {
    if (!items) return [];
    const subjects = filters.subject ? [filters.subject] : EXAMS[exam].subjects;
    return subjects
      .map((sub) => {
        const chapters = catalog.chapters({ exam, subject: sub });
        const known = new Set(chapters.map((c) => c.slug));
        const mine = items.filter((p) => p.subject === sub);
        const list = chapters.map((c) => ({ slug: c.slug, name: c.name, problems: mine.filter((p) => p.chapter === c.slug) }));
        // Problems whose chapter the taxonomy doesn't know (shouldn't happen) still show, at the end.
        const stray = mine.filter((p) => !known.has(p.chapter));
        if (stray.length) list.push({ slug: "_other", name: "Other", problems: stray });
        return { sub, chapters: list.filter((c) => c.problems.length > 0) };
      })
      .filter((g) => g.chapters.length > 0);
  }, [items, exam, filters.subject]);

  // One in-feed unit between subject sections at most (never inside a chapter's list).
  const cuts = useInfeedPositions(groups.length, "library-infeed", { every: 1, max: 1 });

  if (error && !items) return <ListError onRetry={retry} />;
  if (!items) return <RowsSkeleton />;
  if (items.length === 0) return <Empty filtered={filtered} onClear={onClear} />;
  return (
    <div className="mt-6 space-y-10">
      {groups.map((g, gi) => (
        <div key={g.sub}>
          {cuts.includes(gi - 1) && <AdSlot placement="library-infeed" className="mt-0" />}
          {!filters.subject && <h3 className={cn("mb-3 font-display text-lg font-semibold", SUBJECT_STYLE[g.sub].text)}>{catalog.subject(g.sub)?.name ?? g.sub}</h3>}
          <ul className="surface divide-y divide-line overflow-hidden p-0">
            {g.chapters.map((c, i) => (
              <ChapterGroup key={c.slug} subject={g.sub} chapter={c.slug} name={c.name} problems={c.problems} defaultOpen={i === 0 || filtered} opening={opening} onOpen={onOpen} />
            ))}
          </ul>
        </div>
      ))}
      {items.length < total && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-fg-muted">Showing {items.length} of {total}. Chapter counts cover the problems loaded so far.</p>
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={more}>
            {more ? "Loading…" : "Load more problems"}
          </Button>
        </div>
      )}
      {error && <ListError onRetry={loadMore} />}
    </div>
  );
}

function ChapterGroup({
  subject,
  chapter,
  name,
  problems,
  defaultOpen,
  opening,
  onOpen,
}: {
  subject: SubjectId;
  chapter: string;
  name: string;
  problems: LibProblem[];
  defaultOpen: boolean;
  opening: number | null;
  onOpen: (p: LibProblem) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = `ch-${subject}-${chapter}`;
  const solved = problems.filter((p) => p.status === "solved").length;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 sm:px-5"
      >
        <Icon name="chevronRight" className={cn("size-4 shrink-0 text-fg-muted transition-transform motion-reduce:transition-none", open && "rotate-90")} />
        <span aria-hidden className={cn("size-2 shrink-0", SUBJECT_STYLE[subject].bg)} />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="flex items-center gap-3 text-sm tabular-nums text-fg-muted">
          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
            <span className={cn("block h-full", SUBJECT_STYLE[subject].bg)} style={{ width: `${(solved / problems.length) * 100}%` }} />
          </span>
          {solved}/{problems.length}
          <span className="sr-only"> solved</span>
        </span>
      </button>
      {open && (
        <ul id={id} className="divide-y divide-line border-t border-line bg-bg/40">
          {problems.map((p) => (
            <ProblemRow key={p.number} p={p} opening={opening === p.number} onOpen={() => onOpen(p)} />
          ))}
        </ul>
      )}
    </li>
  );
}

/* --------------------------------------------------------------------- row */

function StatusMark({ status }: { status: LibProblem["status"] }) {
  if (status === "solved")
    return (
      <span className="grid size-6 place-items-center text-ok" title="Solved">
        <PixelIcon name="check" className="size-4" />
        <span className="sr-only">Solved</span>
      </span>
    );
  if (status === "attempted")
    return (
      <span className="grid size-6 place-items-center" title="Tried, not solved yet">
        <span aria-hidden className="size-3 border-2 border-review [background:linear-gradient(135deg,var(--review)_50%,transparent_50%)]" />
        <span className="sr-only">Tried, not solved yet</span>
      </span>
    );
  return (
    <span className="grid size-6 place-items-center" title="Not started">
      <span aria-hidden className="size-3 border border-line-strong" />
      <span className="sr-only">Not started</span>
    </span>
  );
}

function ProblemRow({ p, showChapter, opening, onOpen }: { p: LibProblem; showChapter?: boolean; opening: boolean; onOpen: () => void }) {
  const style = SUBJECT_STYLE[p.subject];
  return (
    <li className="group relative grid grid-cols-[1.5rem_1fr_auto] items-start gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[1.5rem_3.75rem_1fr_auto] sm:items-center sm:px-5">
      <StatusMark status={p.status} />
      <span className="hidden font-mono text-sm text-fg-muted sm:block">{formatNumber(p.number)}</span>
      <div className="min-w-0">
        <button type="button" onClick={onOpen} disabled={opening} className="block w-full text-left after:absolute after:inset-0 focus-visible:outline-none">
          <span className="block font-mono text-xs text-fg-muted sm:hidden">{formatNumber(p.number)}</span>
          {p.title ? (
            <RichText value={p.title} inline className="line-clamp-2 leading-snug" />
          ) : (
            <span className="italic text-fg-muted">Contains maths that needs the full view · open to read</span>
          )}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
          <Meta p={p} showChapter={showChapter} />
        </div>
      </div>
      <div className="hidden items-center gap-1.5 sm:flex">
        <Meta p={p} showChapter={showChapter} />
      </div>
      <div className="col-start-3 row-start-1 flex items-center gap-2 sm:hidden">{p.locked && <Lock />}</div>
      {showChapter && <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 w-[2px] opacity-60", style.bg)} />}
      {opening && <span className="sr-only" role="status">Opening problem {p.number}</span>}
    </li>
  );
}

function Meta({ p, showChapter }: { p: LibProblem; showChapter?: boolean }) {
  return (
    <>
      {showChapter && <span className={cn("mr-1 max-w-48 truncate text-xs", SUBJECT_STYLE[p.subject].text)}>{p.chapterName}</span>}
      {p.difficulty && <DifficultyChip difficulty={p.difficulty} />}
      {p.type && <TypeChip type={p.type} />}
      {p.versions > 1 && (
        <span className="text-xs tabular-nums text-fg-muted" title="Same idea, different numbers">
          {p.versions} versions
        </span>
      )}
      {p.solveRate !== null && <span className="text-xs tabular-nums text-fg-muted">{Math.round(p.solveRate * 100)}% solve rate</span>}
      <span className="hidden sm:inline">{p.locked && <Lock />}</span>
    </>
  );
}

function Lock() {
  return (
    <Link href="/pricing/" className="relative z-10 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg" title="Part of Tabby Plus" aria-label="Locked: part of Tabby Plus">
      <PixelIcon name="lock" className="size-3.5" /> <PlusBadge />
    </Link>
  );
}

/* ------------------------------------------------------------------ states */

function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mt-2 space-y-2 p-3" aria-busy="true" aria-label="Loading problems">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 rounded-lg" />
      ))}
    </div>
  );
}

function ListError({ onRetry, compact }: { onRetry: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={cn("flex items-center justify-between gap-4 rounded-xl border border-review/40 bg-review/5 text-sm", compact ? "m-3 p-3" : "mt-6 p-4")}>
      <span>Couldn&rsquo;t load problems. Nothing you did was lost.</span>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function Empty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <TabbyMascot state="curious" className="h-14 text-fg-subtle" />
      <p className="mt-4 font-medium">{filtered ? "No problems match" : "No problems here yet"}</p>
      <p className="mt-1 text-sm text-fg-muted">{filtered ? "Try fewer filters." : "This part of the syllabus is still being added."}</p>
      {filtered && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

/** Split rows after the given indexes (in-feed ad positions). */
function chunks<T>(rows: T[], cuts: number[]): T[][] {
  if (cuts.length === 0) return [rows];
  const out: T[][] = [];
  let start = 0;
  for (const c of cuts) {
    out.push(rows.slice(start, c + 1));
    start = c + 1;
  }
  out.push(rows.slice(start));
  return out.filter((c) => c.length > 0);
}

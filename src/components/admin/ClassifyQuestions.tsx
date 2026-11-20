"use client";
/**
 * Admin question classification (reviewers and admins). Works on the live question bank through the API:
 * GET /admin/classify/questions, POST /admin/classify/bulk, GET /admin/classify/questions/{id}/preview.
 * Never assigns a difficulty itself: every change is the reviewer's choice, saved server-side and audit-logged.
 *
 * Keyboard (preview open, focus not in a field): 1 / 2 / 3 = Easy / Medium / Hard, 0 = Unclassified, J / K = next / previous.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClassifyItem, ClassifyList, ClassifyPreview, DifficultyFilter, TaxonomyTree } from "@projectx/contracts";
import { Blocks } from "@/components/content/Blocks";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { toast } from "@/components/ui/Toast";
import { apiEnabled } from "@/lib/api/env";
import { isApiError } from "@/lib/api/errors";
import { classifyBulk, classifyList, classifyPreview } from "@/lib/api/monetization";
import { taxonomyExams, taxonomyTree } from "@/lib/api/public";
import { me } from "@/lib/api/student";
import { cn } from "@/lib/cn";
import { useAuthStatus } from "@/lib/session/store";

const DIFFS: { id: DifficultyFilter; label: string; key: string }[] = [
  { id: "UNCLASSIFIED", label: "Unclassified", key: "0" },
  { id: "EASY", label: "Easy", key: "1" },
  { id: "MEDIUM", label: "Medium", key: "2" },
  { id: "HARD", label: "Hard", key: "3" },
];
const SOURCE_LABEL: Record<string, string> = {
  ADMIN: "set by a reviewer",
  AI: "AI-assigned",
  IMPORT: "from import",
};
const PAGE = 50;

type Access = "checking" | "ok" | "denied" | "signedOut" | "mock";

function useAccess(): Access {
  const { status } = useAuthStatus();
  const [roleCheck, setRoleCheck] = useState<"ok" | "denied" | null>(null);
  const ready = apiEnabled() && status === "ready";
  useEffect(() => {
    if (!ready) return;
    let live = true;
    me()
      .then((u) => live && setRoleCheck(u.roles.includes("ADMIN") || u.roles.includes("REVIEWER") ? "ok" : "denied"))
      .catch(() => live && setRoleCheck("denied"));
    return () => {
      live = false;
    };
  }, [ready]);
  if (!apiEnabled()) return "mock";
  if (status === "loading") return "checking";
  if (status !== "ready") return "signedOut";
  return roleCheck ?? "checking";
}

function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname() ?? "/admin/questions/";
  const f = {
    exam: sp.get("exam") ?? "jee-main",
    subject: sp.get("subject") ?? "",
    chapter: sp.get("chapter") ?? "",
    difficulty: (sp.get("difficulty") ?? "UNCLASSIFIED").split(",").filter(Boolean) as DifficultyFilter[],
    year: sp.get("year") ?? "",
    question_type: sp.get("type") ?? "",
    publication_status: sp.get("status") ?? "",
    q: sp.get("q") ?? "",
    offset: Number(sp.get("offset") ?? 0) || 0,
  };
  const set = useCallback(
    (patch: Partial<Record<"exam" | "subject" | "chapter" | "difficulty" | "year" | "type" | "status" | "q" | "offset", string>>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("offset" in patch)) next.delete("offset");
      router.replace(`${path}?${next.toString()}`, { scroll: false });
    },
    [sp, router, path],
  );
  return { f, set };
}

export function ClassifyQuestions() {
  const access = useAccess();
  if (access === "checking") return <p className="py-16 text-center text-fg-muted">Checking access…</p>;
  if (access === "mock")
    return <Notice title="Needs the live API">Question classification edits the real database, so it is not available on mock data.</Notice>;
  if (access === "signedOut")
    return (
      <Notice title="Sign in to continue">
        <Link className="underline" href="/login/?next=%2Fadmin%2Fquestions%2F">
          Log in
        </Link>{" "}
        with a reviewer or admin account.
      </Notice>
    );
  if (access === "denied") return <Notice title="No access">This page is for reviewers and admins. The server enforces this too.</Notice>;
  return <Classifier />;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mx-auto mt-16 max-w-lg p-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-fg-muted">{children}</p>
    </Card>
  );
}

function Classifier() {
  const { f, set } = useFilters();
  const [exams, setExams] = useState<{ slug: string; name: string }[]>([]);
  const [treeState, setTreeState] = useState<{
    exam: string;
    data: TaxonomyTree;
  } | null>(null);
  const tree = treeState?.exam === f.exam ? treeState.data : null;
  // Results are keyed by the request (filters + a reload counter): "loading" is derived, never set inside an effect.
  const [reloads, setReloads] = useState(0);
  const [res, setRes] = useState<{
    key: string;
    data: ClassifyList | null;
    error: string | null;
  } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkChapter, setBulkChapter] = useState("");
  const [search, setSearch] = useState(f.q);

  useEffect(() => {
    taxonomyExams()
      .then((r) => setExams(r.data.map((e) => ({ slug: e.slug, name: e.name }))))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    let live = true;
    taxonomyTree(f.exam)
      .then((r) => live && setTreeState({ exam: f.exam, data: r.data }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [f.exam]);

  const key = `${JSON.stringify(f)}#${reloads}`;
  const load = useCallback(() => setReloads((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    classifyList({
      exam: f.exam,
      subject: f.subject || undefined,
      chapter: f.chapter || undefined,
      difficulty: f.difficulty.length ? f.difficulty : undefined,
      year: f.year ? Number(f.year) : undefined,
      question_type: (f.question_type || undefined) as never,
      publication_status: (f.publication_status || undefined) as never,
      q: f.q || undefined,
      offset: f.offset,
      limit: PAGE,
    })
      .then((r) => {
        if (!live) return;
        setRes({ key, data: r, error: null });
        setSelected(new Set());
      })
      .catch(
        (e: unknown) =>
          live &&
          setRes((prev) => ({
            key,
            data: prev?.data ?? null,
            error: isApiError(e) ? e.message : "Couldn't load questions.",
          })),
      );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const data = res?.data ?? null;
  const error = res?.key === key ? res.error : null;
  const loading = res?.key !== key;

  // Debounced search box -> URL.
  useEffect(() => {
    if (search === f.q) return;
    const t = setTimeout(() => set({ q: search.trim() }), 400);
    return () => clearTimeout(t);
  }, [search, f.q, set]);

  const subjects = useMemo(() => tree?.subjects ?? [], [tree]);
  const subject = subjects.find((s) => s.slug === f.subject) ?? null;
  const chaptersForBulk = useMemo(() => {
    // Bulk chapter: the subject filter's chapters, or the selected rows' (single) subject.
    if (subject) return subject.chapters;
    const subs = new Set((data?.items ?? []).filter((i) => selected.has(i.id)).map((i) => i.subject?.slug));
    if (subs.size === 1) return subjects.find((s) => s.slug === [...subs][0])?.chapters ?? [];
    return [];
  }, [subject, subjects, data, selected]);

  const items = data?.items ?? [];

  const apply = useCallback(
    async (ids: string[], patch: { difficulty?: DifficultyFilter; chapter?: string }) => {
      if (!ids.length) return;
      setSaving(true);
      try {
        const r = await classifyBulk({ ids, ...patch });
        const skipped = r.skipped.length ? ` · ${r.skipped.length} skipped (${[...new Set(r.skipped.map((s) => s.reason))].join("; ")})` : "";
        toast(`Saved ${r.updated} question${r.updated === 1 ? "" : "s"}${skipped}`, {
          icon: r.skipped.length ? "alert" : "check",
          tone: r.skipped.length ? "warn" : undefined,
        });
        // Optimistic local update for the rows that saved; the list is reloaded right after.
        setRes((cur) =>
          cur?.data
            ? {
                ...cur,
                data: {
                  ...cur.data,
                  items: cur.data.items.map((it) =>
                    ids.includes(it.id) && !r.skipped.some((s) => s.id === it.id)
                      ? {
                          ...it,
                          ...(patch.difficulty
                            ? {
                                difficulty: patch.difficulty === "UNCLASSIFIED" ? null : patch.difficulty,
                                difficulty_source: patch.difficulty === "UNCLASSIFIED" ? null : ("ADMIN" as const),
                              }
                            : {}),
                        }
                      : it,
                  ),
                },
              }
            : cur,
        );
        setSelected(new Set());
        if (previewIdx === null) load();
      } catch (e) {
        toast(isApiError(e) ? e.message : "Couldn't save. Nothing was changed.", { icon: "alert", tone: "warn" });
      } finally {
        setSaving(false);
      }
    },
    [load, previewIdx],
  );

  const allOnPage = items.length > 0 && items.every((i) => selected.has(i.id));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(items.map((i) => i.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const counts = data?.counts;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold">Question classification</h1>
      <p className="mt-2 max-w-3xl text-fg-muted">
        Set difficulty, chapter and topic on the live question bank. Difficulty is never guessed: unclassified questions stay unclassified until you choose.
        Published questions keep a difficulty; their chapter is changed in the question editor.
      </p>

      {/* Difficulty tabs with real counts for the current filters */}
      <div role="group" aria-label="Difficulty filter" className="mt-6 flex flex-wrap gap-2">
        {DIFFS.map((d) => {
          const on = f.difficulty.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = on ? f.difficulty.filter((x) => x !== d.id) : [...f.difficulty, d.id];
                set({ difficulty: next.join(",") });
              }}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm",
                on ? "border-fg bg-surface-2 text-fg" : "border-line text-fg-muted hover:text-fg",
              )}
            >
              {on ? "✓ " : ""}
              {d.label}
              <span className="tabular-nums text-fg-muted">{counts ? counts[d.id] : "–"}</span>
            </button>
          );
        })}
        {f.difficulty.length > 0 && (
          <button type="button" className="h-9 px-2 text-sm text-fg-muted underline-offset-2 hover:underline" onClick={() => set({ difficulty: "" })}>
            Any difficulty
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        <Select
          label="Exam"
          value={f.exam}
          onChange={(v) => set({ exam: v, subject: "", chapter: "" })}
          options={exams.length ? exams.map((e) => ({ v: e.slug, l: e.name })) : [{ v: f.exam, l: f.exam }]}
        />
        <Select
          label="Subject"
          value={f.subject}
          onChange={(v) => set({ subject: v, chapter: "" })}
          options={[{ v: "", l: "All subjects" }, ...subjects.map((s) => ({ v: s.slug, l: s.name }))]}
        />
        <Select
          label="Chapter"
          value={f.chapter}
          onChange={(v) => set({ chapter: v })}
          options={[
            { v: "", l: "All chapters" },
            { v: "none", l: "No chapter yet" },
            // Hidden chapter (migration 0028): published for full papers only until someone sets the real chapter.
            ...(subject ? [{ v: `${subject.slug}-not-yet-tagged`, l: "Not yet tagged (papers only)" }] : []),
            ...(subject?.chapters ?? []).map((c) => ({ v: c.slug, l: c.name })),
          ]}
        />
        <label className="text-sm">
          <span className="text-fg-muted">Year</span>
          <input
            inputMode="numeric"
            value={f.year}
            onChange={(e) => set({ year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            placeholder="Any"
            className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3"
          />
        </label>
        <Select
          label="Type"
          value={f.question_type}
          onChange={(v) => set({ type: v })}
          options={[
            { v: "", l: "Any type" },
            { v: "SINGLE_MCQ", l: "Single correct" },
            { v: "MULTI_MCQ", l: "Multiple correct" },
            { v: "NUMERICAL", l: "Numerical" },
          ]}
        />
        <Select
          label="Status"
          value={f.publication_status}
          onChange={(v) => set({ status: v })}
          options={[
            { v: "", l: "Any status" },
            { v: "DRAFT", l: "Draft" },
            { v: "PUBLISHED", l: "Published" },
            { v: "ARCHIVED", l: "Archived" },
          ]}
        />
        <label className="text-sm">
          <span className="text-fg-muted">Search (id, slug or words)</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. ellipse"
            className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3"
          />
        </label>
      </div>

      {/* Bulk bar */}
      <div
        className={cn(
          "sticky top-14 z-30 mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg/95 p-3 backdrop-blur",
          selected.size === 0 && "opacity-70",
        )}
      >
        <span className="mr-2 text-sm font-medium tabular-nums">{selected.size} selected</span>
        <span className="text-sm text-fg-muted">Set difficulty:</span>
        {DIFFS.filter((d) => d.id !== "UNCLASSIFIED").map((d) => (
          <Button key={d.id} size="sm" variant="secondary" disabled={!selected.size || saving} onClick={() => void apply([...selected], { difficulty: d.id })}>
            {d.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" disabled={!selected.size || saving} onClick={() => void apply([...selected], { difficulty: "UNCLASSIFIED" })}>
          Unclassify
        </Button>
        <span className="ml-2 text-sm text-fg-muted">Chapter:</span>
        <select
          aria-label="Chapter for selected questions"
          value={bulkChapter}
          onChange={(e) => setBulkChapter(e.target.value)}
          disabled={!chaptersForBulk.length}
          className="h-9 max-w-56 rounded-md border border-line bg-surface px-2 text-sm"
        >
          <option value="">{chaptersForBulk.length ? "Choose a chapter" : "Pick one subject first"}</option>
          {chaptersForBulk.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          disabled={!selected.size || !bulkChapter || saving}
          onClick={() => void apply([...selected], { chapter: bulkChapter })}
        >
          Apply chapter
        </Button>
        {selected.size > 0 && (
          <button type="button" className="ml-auto text-sm text-fg-muted underline-offset-2 hover:underline" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        )}
      </div>

      {/* List */}
      {error ? (
        <Card className="mt-6 p-6">
          <p>{error}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={load}>
            Retry
          </Button>
        </Card>
      ) : !data ? (
        <p className="mt-10 text-center text-fg-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-10 text-center text-fg-muted">No questions match these filters.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line" aria-busy={loading}>
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-fg-muted">
              <tr>
                <th className="w-10 p-3">
                  <input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={toggleAll} />
                </th>
                <th className="p-3">Source</th>
                <th className="p-3">Question</th>
                <th className="p-3">Chapter</th>
                <th className="p-3">Difficulty</th>
                <th className="p-3">Answer</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((it, i) => (
                <Row
                  key={it.id}
                  it={it}
                  checked={selected.has(it.id)}
                  onToggle={() => toggle(it.id)}
                  onPreview={() => setPreviewIdx(i)}
                  onSet={(d) => void apply([it.id], { difficulty: d })}
                  saving={saving}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-fg-muted tabular-nums">
            {f.offset + 1}–{Math.min(f.offset + PAGE, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={f.offset === 0} onClick={() => set({ offset: String(Math.max(0, f.offset - PAGE)) })}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={f.offset + PAGE >= data.total} onClick={() => set({ offset: String(f.offset + PAGE) })}>
              Next
            </Button>
          </div>
        </div>
      )}

      {previewIdx !== null && items[previewIdx] && (
        <PreviewDrawer
          it={items[previewIdx]!}
          index={previewIdx}
          count={items.length}
          chapters={subjects.find((s) => s.slug === items[previewIdx]!.subject?.slug)?.chapters ?? []}
          saving={saving}
          onClose={() => {
            setPreviewIdx(null);
            load();
          }}
          onMove={(d) => setPreviewIdx((p) => (p === null ? p : Math.min(items.length - 1, Math.max(0, p + d))))}
          onSet={(patch) => void apply([items[previewIdx]!.id], patch)}
        />
      )}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <label className="text-sm">
      <span className="text-fg-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-2">
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}

function DiffLabel({ it }: { it: ClassifyItem }) {
  if (!it.difficulty) return <span className="text-fg-muted">Unclassified</span>;
  const src = it.difficulty_source ? SOURCE_LABEL[it.difficulty_source] : it.difficulty_set_at ? "source not recorded" : "set before tracking";
  return (
    <span>
      <span className="font-medium">{it.difficulty[0] + it.difficulty.slice(1).toLowerCase()}</span>
      <span className="block text-xs text-fg-muted">{src}</span>
    </span>
  );
}

function answerLabel(it: ClassifyItem): string {
  if (!it.has_answer_key) return "None yet";
  return it.answer_key_source === "OFFICIAL"
    ? "Official key"
    : it.answer_key_source === "AI_CONSENSUS"
      ? "AI consensus"
      : (it.answer_key_source ?? "Key").toLowerCase();
}

function Row({
  it,
  checked,
  onToggle,
  onPreview,
  onSet,
  saving,
}: {
  it: ClassifyItem;
  checked: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onSet: (d: DifficultyFilter) => void;
  saving: boolean;
}) {
  return (
    <tr className={cn("align-top", checked && "bg-surface-2/60")}>
      <td className="p-3">
        <input type="checkbox" aria-label={`Select question ${it.question_number ?? it.slug}`} checked={checked} onChange={onToggle} />
      </td>
      <td className="p-3 text-xs text-fg-muted">
        <div className="font-medium text-fg">{it.exam.name}</div>
        {it.year ?? "—"}
        {it.shift ? ` · S${it.shift}` : ""}
        {it.question_number ? ` · Q${it.question_number}` : ""}
        <div className="mt-1 max-w-44 truncate" title={it.paper ?? undefined}>
          {it.paper ?? it.origin.replace("_", " ").toLowerCase()}
        </div>
        <div className="mt-1">{it.publication_status.toLowerCase()}</div>
      </td>
      <td className="max-w-md p-3">
        <button type="button" onClick={onPreview} className="text-left hover:underline">
          {it.excerpt || <span className="text-fg-muted">(image only, open to read)</span>}
        </button>
        <div className="mt-1 text-xs text-fg-muted">{it.question_type.replace("_", " ").toLowerCase()}</div>
      </td>
      <td className="p-3 text-xs">
        <div>{it.subject?.name ?? "—"}</div>
        <div className="text-fg-muted">{it.chapter?.name ?? "No chapter"}</div>
      </td>
      <td className="p-3 text-xs">
        <DiffLabel it={it} />
        <div className="mt-2 flex gap-1" role="group" aria-label="Set difficulty">
          {(["EASY", "MEDIUM", "HARD"] as const).map((d) => (
            <button
              key={d}
              type="button"
              disabled={saving}
              aria-pressed={it.difficulty === d}
              title={`Set ${d.toLowerCase()}`}
              onClick={() => onSet(d)}
              className={cn("h-7 w-7 rounded border text-xs", it.difficulty === d ? "border-fg bg-fg text-bg" : "border-line hover:border-fg")}
            >
              {d[0]}
            </button>
          ))}
        </div>
      </td>
      <td className="p-3 text-xs">{answerLabel(it)}</td>
      <td className="p-3">
        <Button size="sm" variant="ghost" onClick={onPreview}>
          Preview
        </Button>
      </td>
    </tr>
  );
}

function PreviewDrawer({
  it,
  index,
  count,
  chapters,
  saving,
  onClose,
  onMove,
  onSet,
}: {
  it: ClassifyItem;
  index: number;
  count: number;
  chapters: TaxonomyTree["subjects"][number]["chapters"];
  saving: boolean;
  onClose: () => void;
  onMove: (d: number) => void;
  onSet: (patch: { difficulty?: DifficultyFilter; chapter?: string }) => void;
}) {
  const [res, setRes] = useState<{
    id: string;
    p: ClassifyPreview | null;
    err: boolean;
  } | null>(null);
  const p = res?.id === it.id ? res.p : null;
  const err = res?.id === it.id ? res.err : false;
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    classifyPreview(it.id)
      .then((r) => live && setRes({ id: it.id, p: r, err: false }))
      .catch(() => live && setRes({ id: it.id, p: null, err: true }));
    return () => {
      live = false;
    };
  }, [it.id]);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "j" || e.key === "J") onMove(1);
      else if (e.key === "k" || e.key === "K") onMove(-1);
      else {
        const d = DIFFS.find((x) => x.key === e.key);
        if (d && !saving && (d.id !== "UNCLASSIFIED" || it.publication_status !== "PUBLISHED")) onSet({ difficulty: d.id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onMove, onSet, saving, it.publication_status]);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/50" onClick={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Question preview"
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-line bg-bg p-6 outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm text-fg-muted">
            {it.exam.name} {it.year ?? ""} {it.shift ? `· Shift ${it.shift}` : ""} {it.question_number ? `· Q${it.question_number}` : ""}
            <div className="mt-1 text-xs">{it.paper}</div>
            <div className="mt-1 text-xs">
              {index + 1} of {count} on this page · id <code className="select-all">{it.id}</code>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close preview">
            Close
          </Button>
        </div>

        <div className="mt-5">
          {err ? (
            <p className="text-fg-muted">Couldn&apos;t load the preview.</p>
          ) : !p ? (
            <p className="text-fg-muted">Loading…</p>
          ) : (
            <>
              <Blocks blocks={p.content} fallback={it.excerpt} className="space-y-3" />
              {p.options.length > 0 && (
                <ol className="mt-5 space-y-2">
                  {p.options.map((o) => {
                    const right = p.correct_labels.includes(o.label);
                    return (
                      <li key={o.label} className={cn("flex gap-3 rounded-lg border p-3", right ? "border-ok" : "border-line")}>
                        <span className="font-semibold">{o.label}</span>
                        <div className="min-w-0 flex-1">
                          <Blocks blocks={o.content} fallback="" />
                        </div>
                        {right && <span className="text-xs font-semibold text-ok">✓ Key</span>}
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="mt-4 text-sm text-fg-muted">
                Answer key: {p.answer_key ? `${p.answer_key_source === "OFFICIAL" ? "official" : (p.answer_key_source ?? "").toLowerCase()}` : "none yet"}
                {p.answer_key?.type === "NUMERICAL" ? ` · ${p.answer_key.display_value}` : ""} · solutions: {p.solution_versions}
              </p>
            </>
          )}
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <p className="text-sm font-medium">Difficulty</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DIFFS.map((d) => (
              <Button
                key={d.id}
                size="sm"
                variant={(it.difficulty ?? "UNCLASSIFIED") === d.id ? "primary" : "secondary"}
                disabled={saving || (d.id === "UNCLASSIFIED" && it.publication_status === "PUBLISHED")}
                onClick={() => onSet({ difficulty: d.id })}
              >
                {d.label} <kbd className="ml-1 text-xs opacity-60">{d.key}</kbd>
              </Button>
            ))}
          </div>
          <label className="mt-4 block text-sm">
            <span className="font-medium">Chapter</span>
            <select
              className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-2"
              value={it.chapter?.slug ?? ""}
              disabled={saving || it.publication_status === "PUBLISHED" || !chapters.length}
              onChange={(e) => e.target.value && onSet({ chapter: e.target.value })}
            >
              <option value="">{chapters.length ? "No chapter yet" : "Subject unknown"}</option>
              {chapters.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-5 flex justify-between">
            <Button size="sm" variant="secondary" disabled={index === 0} onClick={() => onMove(-1)}>
              ← Previous (K)
            </Button>
            <Button size="sm" variant="secondary" disabled={index >= count - 1} onClick={() => onMove(1)}>
              Next (J) →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

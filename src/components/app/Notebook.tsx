"use client";

import { AdSlot } from "@/components/ads/AdSlot";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SubjectId } from "@/contracts";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { RichText } from "@/components/content/RichText";
import { SubjectTag } from "@/components/ui/Badges";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Segmented } from "@/components/ui/Primitives";
import { DemoBadge } from "@/components/app/ModeBadge";
import { cn } from "@/lib/cn";
import { catalog } from "@/lib/data/catalog";
import { relativeDay } from "@/lib/demo/dates";
import { removeMistake, setMistakeCategory, startPractice, startSingleBySlug, toggleBookmark, toggleReview } from "@/lib/demo/store";
import { dismissToast, toast } from "@/components/ui/Toast";
import { DATA_SOURCE } from "@/lib/site";
import { MISTAKE_CATEGORIES, type DemoState, type MistakeCategory } from "@/lib/demo/types";
import { DemoGate } from "./DemoGate";

type Kind = "mistakes" | "bookmarks" | "review";

/** Most questions one session from the notebook can hold: the learning-session cap in startPractice. Label and request both use it. */
const SESSION_CAP = 50;
/** How long "Mark cleared" can be undone before the mistake is actually removed. */
const UNDO_MS = 5000;

const TABS: { id: Kind; href: string; label: string; blurb: string }[] = [
  { id: "mistakes", href: "/mistakes/", label: "Mistakes", blurb: "Questions you answered incorrectly, captured automatically. Answer one correctly again and it's cleared." },
  { id: "bookmarks", href: "/bookmarks/", label: "Bookmarks", blurb: "Questions you chose to save — good examples, tricky ideas, things to show a teacher." },
  { id: "review", href: "/review/", label: "Review list", blurb: "Questions you flagged to come back to later." },
];

export function NotebookPage({ kind }: { kind: Kind }) {
  return <DemoGate>{(s) => <Notebook kind={kind} s={s} />}</DemoGate>;
}

function Notebook({ kind, s }: { kind: Kind; s: DemoState & { user: NonNullable<DemoState["user"]> } }) {
  const router = useRouter();
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const [subject, setSubject] = useState<SubjectId | "all">("all");
  const tab = TABS.find((t) => t.id === kind)!;

  // "Mark cleared" hides the row at once and removes the mistake after UNDO_MS unless undone. removeMistake hits the API
  // immediately, so the delay lives here; anything still pending is flushed when the page closes or the tab changes.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const pending = useRef(new Map<string, { timer: number; toastId: number }>());
  const commit = useCallback((qid: string) => {
    const p = pending.current.get(qid);
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current.delete(qid);
    dismissToast(p.toastId);
    void removeMistake(qid);
  }, []);
  useEffect(() => {
    const map = pending.current;
    const flush = () => [...map.keys()].forEach(commit);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [commit]);
  const markCleared = (qid: string, message: string) => {
    if (pending.current.has(qid)) return;
    setHidden((h) => new Set(h).add(qid));
    const timer = window.setTimeout(() => commit(qid), UNDO_MS);
    const toastId = toast(message, {
      icon: "check",
      tone: "good",
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const p = pending.current.get(qid);
          if (!p) return;
          window.clearTimeout(p.timer);
          pending.current.delete(qid);
          setHidden((h) => {
            const n = new Set(h);
            n.delete(qid);
            return n;
          });
        },
      },
    });
    pending.current.set(qid, { timer, toastId });
  };

  const counts = {
    mistakes: Object.values(s.mistakes).filter((m) => m.status === "open" && !hidden.has(m.questionId)).length,
    bookmarks: Object.keys(s.bookmarks).length,
    review: Object.keys(s.review).length,
  };

  const entries: { qid: string; at: string }[] =
    kind === "mistakes"
      ? Object.values(s.mistakes)
          .filter((m) => !hidden.has(m.questionId) && (status === "all" || m.status === status))
          .map((m) => ({ qid: m.questionId, at: m.at }))
      : Object.entries(kind === "bookmarks" ? s.bookmarks : s.review).map(([qid, at]) => ({ qid, at }));
  const items = entries
    .map((e) => ({ ...e, q: catalog.question(e.qid) }))
    .filter((e) => e.q && (subject === "all" || e.q.subject === subject))
    .sort((a, b) => b.at.localeCompare(a.at));
  const subjects = [...new Set(entries.map((e) => catalog.question(e.qid)?.subject).filter(Boolean))] as SubjectId[];

  const [busy, setBusy] = useState(false);
  const practise = async (ids: string[], title: string) => {
    if (!ids.length || busy) return;
    const first = catalog.question(ids[0]!)!;
    const exam = first.exams.includes(s.user.exam) ? s.user.exam : first.exams[0];
    setBusy(true);
    try {
      let id: string;
      if (DATA_SOURCE === "api") {
        // The server picks sessions from your mistakes / bookmarks; a single question is opened by its slug.
        id =
          ids.length === 1
            ? await startSingleBySlug(first.slug, exam, { subject: first.subject, chapter: first.chapter })
            : await startPractice({ exam, mode: "learning", title, questionIds: [], count: Math.min(SESSION_CAP, ids.length), scope: { source: kind === "bookmarks" ? "bookmarks" : "mistakes", ...(subject !== "all" ? { subject } : {}) } });
      } else {
        id = await startPractice({ exam, mode: "learning", title, questionIds: ids.slice(0, SESSION_CAP), scope: { source: kind === "review" ? "review" : kind, ...(subject !== "all" ? { subject } : {}) } });
      }
      router.push(`/practice/session/?id=${id}`);
    } catch {
      setBusy(false);
      toast("Couldn't start that session. Please try again.", { icon: "alert", tone: "warn" });
    }
  };
  const subjectName = subject !== "all" ? catalog.subject(subject)?.name : undefined;
  const sessionTitle = (base: string) => (subjectName ? `${base} · ${subjectName}` : base);
  const openIds = items.filter((i) => kind !== "mistakes" || s.mistakes[i.qid]?.status === "open").map((i) => i.qid);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Eyebrow className="flex items-center gap-2">
        Notebook <DemoBadge />
      </Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{tab.label}</h1>
      <p className="mt-2 max-w-2xl text-fg-muted">{tab.blurb}</p>
      {DATA_SOURCE === "api" && kind === "review" && <p className="mt-2 text-sm text-fg-muted">Saved on this device only for now, so it won&rsquo;t appear on your other devices.</p>}
      {DATA_SOURCE === "api" && kind === "mistakes" && <p className="mt-2 text-sm text-fg-muted">The reasons you tag are saved on this device only for now.</p>}

      <nav aria-label="Notebook" className="mt-8 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link key={t.id} href={t.href} aria-current={t.id === kind ? "page" : undefined} className={cn("relative flex h-11 items-center gap-2 px-3 text-sm", t.id === kind ? "text-fg" : "text-fg-muted hover:text-fg")}>
            {t.label}
            <span className="rounded-sm bg-surface-2 px-1.5 text-xs tabular-nums">{counts[t.id]}</span>
            {t.id === kind && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 bg-fg" />}
          </Link>
        ))}
      </nav>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {kind === "mistakes" && (
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { id: "open", label: "To revise" },
              { id: "resolved", label: "Cleared" },
              { id: "all", label: "All" },
            ]}
          />
        )}
        {subjects.length > 1 && (
          <Segmented label="Subject" value={subject} onChange={setSubject} options={[{ id: "all" as const, label: "All subjects" }, ...subjects.map((id) => ({ id, label: catalog.subject(id)!.name }))]} />
        )}
        {openIds.length > 0 && !(DATA_SOURCE === "api" && kind === "review") && (
          <Button pixel size="sm" className="ml-auto" disabled={busy} onClick={() => practise(openIds, sessionTitle(kind === "mistakes" ? "Mistake revision" : kind === "bookmarks" ? "Bookmarked questions" : "Review list"))}>
            <Icon name="play" className="size-3.5" /> {kind === "mistakes" ? `Reattempt ${Math.min(openIds.length, SESSION_CAP)}` : `Practise ${Math.min(openIds.length, SESSION_CAP)}`}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-16 text-center">
          <TabbyMascot state={kind === "mistakes" && status === "open" ? "idle" : "curious"} className="h-16 text-fg-subtle" />
          <p className="mt-5 font-medium">
            {kind === "mistakes" ? (status === "open" ? "Nothing to revise" : "Nothing here yet") : kind === "bookmarks" ? "No bookmarks yet" : "Your review list is empty"}
          </p>
          <p className="mt-1 max-w-sm text-sm text-fg-muted">
            {kind === "mistakes"
              ? "Wrong answers from practice and tests land here automatically."
              : kind === "bookmarks"
                ? "Use the bookmark button (or press B) on any question to save it here."
                : "Use “Review later” on any question to add it here."}
          </p>
          <ButtonLink href="/practice/" variant="secondary" size="sm" className="mt-5">
            Go to practice
          </ButtonLink>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map(({ qid, at, q }) => {
            const m = s.mistakes[qid];
            const chapter = catalog.chapter(q!.subject, q!.chapter);
            return (
              <li key={qid} className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <SubjectTag subject={q!.subject} label={catalog.subject(q!.subject)!.name} />
                  <span className="text-fg-muted">{chapter?.name}</span>
                  <span className="text-fg-subtle">·</span>
                  <span className="text-fg-muted">{relativeDay(at)}</span>
                  {kind === "mistakes" && m?.status === "resolved" && (
                    <span className="inline-flex items-center gap-1 text-ok">
                      <Icon name="check" className="size-3.5" /> Cleared
                    </span>
                  )}
                  {kind === "mistakes" && m && m.reattempts > 0 && m.status === "open" && <span className="text-review">Missed {m.reattempts + 1}×</span>}
                </div>
                <p className="mt-3 line-clamp-3 leading-relaxed text-fg-soft">
                  <RichText value={q!.stem} inline />
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => practise([qid], "Single question")}>
                    <Icon name="rotate" className="size-4" /> {kind === "mistakes" ? "Reattempt" : "Practise"}
                  </Button>
                  {kind === "mistakes" && m && (
                    <label className="flex items-center gap-2 text-sm text-fg-muted">
                      <span className="sr-only">Why did you get this wrong?</span>
                      {DATA_SOURCE === "api" && <span className="text-xs text-fg-subtle">Saved on this device</span>}
                      <select
                        value={m.category ?? ""}
                        onChange={(e) => setMistakeCategory(qid, (e.target.value || null) as MistakeCategory | null)}
                        className="h-9 rounded-md border border-line-strong bg-bg px-2 text-sm text-fg"
                      >
                        <option value="">Tag the reason…</option>
                        {MISTAKE_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => (kind === "mistakes" ? markCleared(qid, m?.status === "open" ? "Marked as cleared" : "Removed from your notebook") : void (kind === "bookmarks" ? toggleBookmark(qid) : toggleReview(qid)))}
                    className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg sm:min-h-9"
                  >
                    <Icon name={kind === "mistakes" && m?.status === "open" ? "check" : "trash"} className="size-4" /> {kind === "mistakes" && m?.status === "open" ? "Mark cleared" : "Remove"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AdSlot placement="notebook-bottom" />
    </div>
  );
}

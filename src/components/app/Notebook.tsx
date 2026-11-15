"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SubjectId } from "@/contracts";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { RichText } from "@/components/content/RichText";
import { SubjectTag } from "@/components/ui/Badges";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { DemoBadge, Eyebrow, Segmented } from "@/components/ui/Primitives";
import { cn } from "@/lib/cn";
import { catalog } from "@/lib/data/catalog";
import { relativeDay } from "@/lib/demo/dates";
import { removeMistake, setMistakeCategory, startPractice, toggleBookmark, toggleReview } from "@/lib/demo/store";
import { MISTAKE_CATEGORIES, type DemoState, type MistakeCategory } from "@/lib/demo/types";
import { DemoGate } from "./DemoGate";

type Kind = "mistakes" | "bookmarks" | "review";

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
  const counts = {
    mistakes: Object.values(s.mistakes).filter((m) => m.status === "open").length,
    bookmarks: Object.keys(s.bookmarks).length,
    review: Object.keys(s.review).length,
  };

  const entries: { qid: string; at: string }[] =
    kind === "mistakes"
      ? Object.values(s.mistakes)
          .filter((m) => status === "all" || m.status === status)
          .map((m) => ({ qid: m.questionId, at: m.at }))
      : Object.entries(kind === "bookmarks" ? s.bookmarks : s.review).map(([qid, at]) => ({ qid, at }));
  const items = entries
    .map((e) => ({ ...e, q: catalog.question(e.qid) }))
    .filter((e) => e.q && (subject === "all" || e.q.subject === subject))
    .sort((a, b) => b.at.localeCompare(a.at));
  const subjects = [...new Set(entries.map((e) => catalog.question(e.qid)?.subject).filter(Boolean))] as SubjectId[];

  const practise = (ids: string[], title: string) => {
    if (!ids.length) return;
    const exam = catalog.question(ids[0])!.exams.includes(s.user.exam) ? s.user.exam : catalog.question(ids[0])!.exams[0];
    const id = startPractice({ exam, mode: "learning", title, questionIds: ids.slice(0, 25), scope: { source: kind === "review" ? "review" : kind } });
    router.push(`/practice/session/?id=${id}`);
  };
  const openIds = items.filter((i) => kind !== "mistakes" || s.mistakes[i.qid]?.status === "open").map((i) => i.qid);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Eyebrow className="flex items-center gap-2">
        Notebook <DemoBadge />
      </Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{tab.label}</h1>
      <p className="mt-2 max-w-2xl text-fg-muted">{tab.blurb}</p>

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
        {openIds.length > 0 && (
          <Button pixel size="sm" className="ml-auto" onClick={() => practise(openIds, kind === "mistakes" ? "Mistake revision" : kind === "bookmarks" ? "Bookmarked questions" : "Review list")}>
            <Icon name="play" className="size-3.5" /> {kind === "mistakes" ? `Reattempt ${Math.min(openIds.length, 25)}` : `Practise ${Math.min(openIds.length, 25)}`}
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
                  <Button size="sm" variant="secondary" onClick={() => practise([qid], "Single question")}>
                    <Icon name="rotate" className="size-4" /> {kind === "mistakes" ? "Reattempt" : "Practise"}
                  </Button>
                  {kind === "mistakes" && m && (
                    <label className="flex items-center gap-2 text-sm text-fg-muted">
                      <span className="sr-only">Why did you get this wrong?</span>
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
                    onClick={() => (kind === "mistakes" ? removeMistake(qid) : kind === "bookmarks" ? toggleBookmark(qid) : toggleReview(qid))}
                    className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <Icon name="trash" className="size-4" /> Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

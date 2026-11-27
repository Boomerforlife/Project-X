"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ExamId, SubjectId } from "@/contracts";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { Card, Eyebrow, ListSkeleton, PageSkeleton, Ring, Segmented, Skeleton } from "@/components/ui/Primitives";
import { ProblemLibrary } from "./ProblemLibrary";
import { DemoBadge } from "@/components/app/ModeBadge";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { catalog } from "@/lib/data/catalog";
import { relativeDay } from "@/lib/demo/dates";
import { quickPractice } from "@/lib/demo/launch";
import { chapterStats, recommendation } from "@/lib/demo/progress";
import { isAnswered } from "@/lib/demo/scoring";
import { discardAttempt, inProgress, startPractice, startSingleBySlug, updateUser } from "@/lib/demo/store";
import { availableExams } from "@/lib/session/exams";
import { DATA_SOURCE } from "@/lib/site";
import type { DemoState } from "@/lib/demo/types";
import { EXAMS } from "@/lib/exams";
import { SUBJECT_STYLE } from "@/lib/subjects";
import { DemoGate } from "./DemoGate";

type S = DemoState & { user: NonNullable<DemoState["user"]> };

function HubSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading practice">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-11 w-[28rem] max-w-full" />
      <Skeleton className="mt-8 h-40 rounded-2xl" />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
      <ListSkeleton rows={6} className="mt-10" />
    </div>
  );
}

export function PracticeHubPage() {
  return <DemoGate fallback={<HubSkeleton />}>{(s) => <Hub s={s} />}</DemoGate>;
}

export function switchExam(id: ExamId) {
  updateUser({ exam: id });
  toast(`Now preparing for ${EXAMS[id].name}`, { icon: "check", tone: "good" });
}

function Hub({ s }: { s: S }) {
  const router = useRouter();
  const exam = s.user.exam;
  const cfg = EXAMS[exam];
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"learning" | "test">("learning");
  const [count, setCount] = useState("10");
  const [quickSubject, setQuickSubject] = useState<SubjectId | "mixed">("mixed");
  const [lastExam, setLastExam] = useState(exam);
  if (lastExam !== exam) {
    setLastExam(exam);
    setQuickSubject("mixed");
  }

  const counts = useMemo(() => catalog.chapterCounts(exam), [exam]);

  const resumable = inProgress(s);
  const openMistakes = Object.values(s.mistakes).filter((m) => m.status === "open").map((m) => m.questionId);
  const bookmarks = Object.keys(s.bookmarks);

  const go = async (pending: Promise<string | null> | string | null) => {
    setBusy(true);
    try {
      const id = await pending;
      if (!id) {
        setBusy(false);
        toast(
          DATA_SOURCE === "api" ? "You've solved everything here. Open the chapter to include solved questions." : "No questions match that yet — try another chapter",
          { icon: "info", tone: "warn" },
        );
        return;
      }
      router.push(`/practice/session/?id=${id}`);
    } catch {
      setBusy(false);
      toast("Couldn't start the session. Please try again.", { icon: "alert", tone: "warn" });
    }
  };
  const fromList = (ids: string[], title: string, source: "mistakes" | "bookmarks") =>
    go(ids.length ? startPractice({ exam, mode: "learning", title, questionIds: ids.slice(0, 20), count: Math.min(20, ids.length), scope: { source } }) : null);

  // Recommendations: the weakest chapter, an untouched one, and a strong one to keep warm.
  const rec = recommendation(s);
  const picks = useMemo(() => {
    const list: { subject: SubjectId; chapter: string; why: string; icon: IconName }[] = [];
    if (rec?.kind === "weak") list.push({ subject: rec.subject, chapter: rec.chapter, why: `${Math.round((rec.accuracy ?? 0) * 100)}% on your last ${rec.answered} — worth another pass`, icon: "target" });
    const touched = new Set(chapterStats(s).map((c) => `${c.subject}/${c.chapter}`));
    const fresh = catalog.chapters({ exam }).filter((c) => !touched.has(`${c.subject}/${c.slug}`) && (counts.get(`${c.subject}/${c.slug}`) ?? 0) >= 6);
    const f = fresh.find((c) => !list.some((x) => x.subject === c.subject)) ?? fresh[0];
    if (f) list.push({ subject: f.subject, chapter: f.slug, why: "You haven't started this one yet", icon: "plus" });
    const strong = chapterStats(s)
      .filter((c) => c.answered >= 3 && c.correct / c.answered >= 0.7 && catalog.chapter(c.subject, c.chapter)?.exams.includes(exam))
      .sort((a, b) => b.answered - a.answered)[0];
    if (strong) list.push({ subject: strong.subject, chapter: strong.chapter, why: `${Math.round((strong.correct / strong.answered) * 100)}% so far — keep it sharp`, icon: "rotate" });
    for (const c of fresh) {
      if (list.length >= 3) break;
      if (!list.some((x) => x.chapter === c.slug)) list.push({ subject: c.subject, chapter: c.slug, why: "New chapter to explore", icon: "plus" });
    }
    return list.slice(0, 3);
  }, [s, exam, rec, counts]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14">
      {/* Intro + exam switch */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow className="flex items-center gap-2">
            Practice <DemoBadge />
          </Eyebrow>
          <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">All questions</h1>
          <p className="mt-3 max-w-xl text-lg text-fg-muted">
            Every problem across your chapters, with filters. Start a quick mixed session, or practise one chapter at a time from{" "}
            <Link href={routes.practice(cfg.track)} className="text-fg underline underline-offset-4">
              its page
            </Link>
            .
          </p>
        </div>
        <Segmented label="Exam" value={exam} onChange={switchExam} options={availableExams().map((e) => ({ id: e.id, label: e.name }))} />
      </div>

      {/* One-click start */}
      <section aria-labelledby="quick-h" className="surface relative mt-10 overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_100%_0%,black,transparent_55%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0">
            <h2 id="quick-h" className="text-2xl font-semibold">
              Quick practice
            </h2>
            <p className="mt-1 text-fg-muted">
              {mode === "learning" ? "Instant feedback, hints and full solutions after every answer." : `Timed — ${Number(count) * 2} minutes. Answers and solutions after you submit.`}
            </p>
            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-5">
              <div>
                <p className="mb-2 text-sm text-fg-muted">Mode</p>
                <Segmented
                  label="Mode"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { id: "learning", label: "Learn" },
                    { id: "test", label: "Timed test" },
                  ]}
                />
              </div>
              <div>
                <p className="mb-2 text-sm text-fg-muted">Questions</p>
                <Segmented label="Number of questions" value={count} onChange={setCount} options={["5", "10", "20"].map((n) => ({ id: n, label: n }))} />
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-sm text-fg-muted">Subject</p>
                <Segmented
                  label="Subject"
                  value={quickSubject}
                  onChange={setQuickSubject}
                  options={[{ id: "mixed" as const, label: "Mixed" }, ...cfg.subjects.map((id) => ({ id, label: catalog.subject(id)!.name }))]}
                />
              </div>
            </div>
          </div>
          <Button
            size="lg"
            pixel
            disabled={busy}
            onClick={() => go(quickPractice(exam, { count: Number(count), mode, subject: quickSubject === "mixed" ? undefined : quickSubject }))}
            className="h-14 px-8 text-base max-sm:w-full"
          >
            {busy ? "Starting…" : "Start"} <Icon name="arrowRight" className="size-4" />
          </Button>
        </div>
      </section>

      {/* Shortcuts that only appear when they're useful */}
      {(resumable.length > 0 || openMistakes.length > 0 || bookmarks.length > 0) && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {resumable.slice(0, 1).map((a) => {
            const done = a.questionIds.filter((x) => (a.mode === "learning" ? a.responses[x]?.checked : isAnswered(a.responses[x]?.answer))).length;
            return (
              <div key={a.id} className="surface-flat flex min-w-0 items-center gap-3 p-4">
                <Ring value={done / a.questionIds.length} size={40} stroke={4} label={`${done} of ${a.questionIds.length}`}>
                  <Icon name="play" className="size-3.5" />
                </Ring>
                <button type="button" onClick={() => router.push(a.mode === "cbt" ? `/cbt/?id=${a.id}` : `/practice/session/?id=${a.id}`)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium hover:underline">Continue {a.title}</span>
                  <span className="block text-sm text-fg-muted">
                    {done}/{a.questionIds.length} · {relativeDay(a.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await discardAttempt(a.id);
                    toast("Session discarded", { icon: "trash" });
                  }}
                  className="grid size-11 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg sm:size-9"
                  aria-label={`Discard ${a.title}`}
                  title="Discard"
                >
                  <Icon name="x" className="size-4" />
                </button>
              </div>
            );
          })}
          {openMistakes.length > 0 && (
            <ShortcutTile icon="target" title={`Revise ${openMistakes.length} mistake${openMistakes.length === 1 ? "" : "s"}`} sub="Get one right to clear it" onClick={() => fromList(openMistakes, "Mistake revision", "mistakes")} accent="text-review" />
          )}
          {bookmarks.length > 0 && <ShortcutTile icon="bookmark" title={`Practise ${bookmarks.length} bookmark${bookmarks.length === 1 ? "" : "s"}`} sub="Questions you saved" onClick={() => fromList(bookmarks, "Bookmarked questions", "bookmarks")} />}
        </div>
      )}

      <ProblemLibrary s={s} />

      {/* Recommended (Home shows the single best next step; these are more options) */}
      {picks.length > 0 && (
        <section aria-labelledby="rec-h" className="mt-14">
          <h2 id="rec-h" className="text-2xl font-semibold">
            Recommended for you
          </h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-3">
            {picks.map((p) => {
              const c = catalog.chapter(p.subject, p.chapter)!;
              const style = SUBJECT_STYLE[p.subject];
              return (
                <li key={`${p.subject}/${p.chapter}`} className="surface group relative flex flex-col overflow-hidden p-5">
                  <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", style.bg)} />
                  <p className={cn("text-sm font-medium", style.text)}>{catalog.subject(p.subject)!.name}</p>
                  <p className="mt-1 text-lg font-semibold leading-snug">{c.name}</p>
                  <p className="mt-2 flex items-start gap-2 text-sm text-fg-muted">
                    <Icon name={p.icon} className="mt-0.5 size-4 shrink-0" />
                    {p.why}
                  </p>
                  <div className="mt-5 flex items-center justify-between pt-1">
                    <span className="text-sm text-fg-muted">{counts.get(`${p.subject}/${p.chapter}`) ?? 0} questions</span>
                    <Button size="sm" variant="secondary" onClick={() => go(quickPractice(exam, { subject: p.subject, chapter: p.chapter }))}>
                      Practise
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Study plan entry: the diagnostic and a basic plan are free; longer plans and the full report are Tabby Plus. */}
      <Link href={routes.studyPlan} className="surface-flat group mt-14 flex items-center gap-4 p-4 transition-colors hover:border-line-strong sm:p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-2">
          <PixelIcon name="target" className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Not sure where to start? Take a diagnostic</span>
          <span className="block text-sm text-fg-muted">A short mixed test across your chapters, then a day-by-day plan built from your results.</span>
        </span>
        <Icon name="arrowRight" className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function ShortcutTile({ icon, title, sub, onClick, accent }: { icon: IconName; title: string; sub: string; onClick: () => void; accent?: string }) {
  return (
    <button type="button" onClick={onClick} className="surface-flat group flex items-center gap-3 p-4 text-left transition-colors hover:border-line-strong">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-surface-2", accent)}>
        <Icon name={icon} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-fg-muted">{sub}</span>
      </span>
      <Icon name="arrowRight" className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/* ---------------- Launcher (/practice/new/) ---------------- */

export function LauncherPage() {
  return <DemoGate>{(s) => <Launcher s={s} />}</DemoGate>;
}

function Launcher({ s }: { s: DemoState & { user: NonNullable<DemoState["user"]> } }) {
  const router = useRouter();
  const p = useSearchParams();
  const api = DATA_SOURCE === "api";
  // Mock mode links with ?q=<question id>; API mode (public question pages) with ?slug=<question slug>.
  const qParam = api ? null : p.get("q");
  const slugParam = api ? p.get("slug") : null;
  const examParam = p.get("exam");
  const exam: ExamId = examParam && examParam in EXAMS ? (examParam as ExamId) : s.user.exam;
  const subject = (p.get("subject") as SubjectId | null) ?? undefined;
  const chapterSlug = p.get("chapter") ?? undefined;
  const chapter = subject && chapterSlug ? catalog.chapter(subject, chapterSlug) : null;
  const subj = subject ? catalog.subject(subject) : null;
  const [mode, setMode] = useState<"learning" | "test">(p.get("mode") === "test" ? "test" : "learning");
  const [count, setCount] = useState("10");
  const [difficulty, setDifficulty] = useState<"any" | "easy" | "medium" | "hard">("any");
  const [includeSolved, setIncludeSolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = catalog.questionCount({ exam, subject, chapter: chapterSlug });
  const maxCount = api && mode === "test" ? 20 : 30; // test submissions are posted one by one (rate limit)

  // A single question link (from a public page or a list) starts straight away.
  const userExam = s.user.exam;
  useEffect(() => {
    if (qParam) {
      const q = catalog.question(qParam);
      if (!q) return;
      void startPractice({ exam: q.exams.includes(userExam) ? userExam : q.exams[0], mode: "learning", title: "Single question", questionIds: [q.id], scope: { source: "single" } }).then((id) => router.replace(`/practice/session/?id=${id}`));
    } else if (slugParam) {
      let live = true;
      startSingleBySlug(slugParam, exam, { subject, chapter: chapterSlug })
        .then((id) => live && router.replace(`/practice/session/?id=${id}`))
        .catch(() => live && setError("We couldn't open that question for practice."));
      return () => {
        live = false;
      };
    }
  }, [qParam, slugParam, router, userExam, exam, subject, chapterSlug]);

  // Chapter practice lives on the chapter page now (its Practise sheet): old links land there with the sheet open.
  const toChapter = !qParam && !slugParam && subject && chapterSlug ? routes.chapterPractise(EXAMS[exam].track, subject, chapterSlug, { timed: p.get("mode") === "test" }) : null;
  useEffect(() => {
    if (toChapter) router.replace(toChapter);
  }, [toChapter, router]);
  if (toChapter) return <PageSkeleton />;

  if (qParam || slugParam) {
    return error ? (
      <div className="mx-auto max-w-md px-4 py-24 text-center" role="alert">
        <h1 className="text-2xl font-semibold">{error}</h1>
        <ButtonLink href="/practice/" className="mt-6">
          Back to practice
        </ButtonLink>
      </div>
    ) : (
      <PageSkeleton />
    );
  }

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const id = await quickPractice(exam, { subject, chapter: chapterSlug, count: Number(count), mode, difficulty: difficulty === "any" ? undefined : difficulty, includeSolved });
      if (id) router.push(`/practice/session/?id=${id}`);
      else {
        setBusy(false);
        setError(api && !includeSolved ? "You've solved every question here. Tick “Include questions I've already solved” to practise them again." : "No questions match that yet.");
      }
    } catch {
      setBusy(false);
      setError("Couldn't start the session. Check your connection and try again.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/practice/" className="text-sm text-fg-muted hover:text-fg">
        ← Practice
      </Link>
      <Eyebrow className="mt-6">{EXAMS[exam].name}</Eyebrow>
      <h1 className={cn("mt-2 text-3xl font-semibold", subj && SUBJECT_STYLE[subj.id].text)}>{chapter?.name ?? (subj ? `${subj.name} · mixed` : "Mixed practice")}</h1>
      <p className="mt-2 text-fg-muted">{chapter?.summary || `${available} questions available.`}</p>

      {available === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
          <TabbyMascot state="idle" className="h-14 text-fg-subtle" />
          <p className="mt-4 font-medium">No questions here yet</p>
          <p className="mt-1 text-sm text-fg-muted">This chapter is still being added. Try another one.</p>
          <ButtonLink href="/practice/#library" variant="secondary" size="sm" className="mt-5">
            All chapters
          </ButtonLink>
        </div>
      ) : (
        <Card className="mt-8 space-y-7 p-6">
          <fieldset>
            <legend className="text-sm font-medium">Mode</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["learning", "Learning", "Check each answer, use hints, read solutions as you go."],
                  ["test", "Test", "Timed. Answers and solutions appear after you submit."],
                ] as const
              ).map(([id, l, d]) => (
                <label key={id} className={cn("cursor-pointer rounded-lg border p-4 transition-colors", mode === id ? "border-fg bg-surface-2" : "border-line hover:border-line-strong")}>
                  <input type="radio" name="mode" className="sr-only" checked={mode === id} onChange={() => setMode(id)} />
                  <span className="font-medium">{l}</span>
                  <span className="mt-1 block text-sm text-fg-muted">{d}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-sm font-medium">Questions</p>
              <Segmented
                className="mt-3"
                label="Number of questions"
                value={count}
                onChange={setCount}
                options={["5", "10", "20", "30"].filter((n) => Number(n) <= Math.min(maxCount, Math.max(5, available))).map((n) => ({ id: n, label: n }))}
              />
            </div>
            <div>
              <p className="text-sm font-medium">Difficulty</p>
              <Segmented
                className="mt-3"
                label="Difficulty"
                value={difficulty}
                onChange={setDifficulty}
                options={[
                  { id: "any", label: "Any" },
                  { id: "easy", label: "Easy" },
                  { id: "medium", label: "Medium" },
                  { id: "hard", label: "Hard" },
                ]}
              />
            </div>
          </div>
          {api && (
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={includeSolved} onChange={(e) => setIncludeSolved(e.target.checked)} className="size-4 accent-current" />
              Include questions I&rsquo;ve already solved
            </label>
          )}
          {mode === "test" && <p className="text-sm text-fg-muted">Time limit: {Math.max(5, Math.min(Number(count), available) * 2)} minutes (about 2 minutes per question).</p>}
          {error && (
            <p role="alert" className="rounded-lg border border-review/40 bg-review/5 p-3 text-sm">
              {error}
            </p>
          )}
          <Button size="lg" pixel onClick={start} disabled={busy} className="w-full sm:w-auto">
            <Icon name="play" className="size-4" /> {busy ? "Starting…" : `Start ${mode === "learning" ? "practising" : "the test"}`}
          </Button>
        </Card>
      )}
    </div>
  );
}

"use client";

import { QuotaExceededError } from "@/lib/billing/quota";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ExamId, Paper } from "@/contracts";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Card, Dialog, Eyebrow, PageSkeleton, Segmented } from "@/components/ui/Primitives";
import { DemoBadge } from "@/components/app/ModeBadge";
import { cn } from "@/lib/cn";
import { catalog } from "@/lib/data/catalog";
import { relativeDay } from "@/lib/demo/dates";
import { scoreAttempt } from "@/lib/demo/scoring";
import { demoLogin, startPaper, useDemo } from "@/lib/demo/store";
import { PAPERS_ENABLED } from "@/lib/demo/progress";
import { toast } from "@/components/ui/Toast";
import { Kitty } from "@/components/brand/Kitty";
import { ButtonLink } from "@/components/ui/Button";
import { DATA_SOURCE } from "@/lib/site";
import type { Attempt, DemoState } from "@/lib/demo/types";
import { EXAM_LIST, EXAMS } from "@/lib/exams";
import { SUBJECT_STYLE } from "@/lib/subjects";

function attemptsFor(s: DemoState | null, paperId: string) {
  if (!s) return [];
  return Object.values(s.attempts)
    .filter((a) => a.paperId === paperId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function useStart() {
  const router = useRouter();
  const s = useDemo();
  return async (paperId: string, mode: "cbt" | "test" | "learning", retryOf?: string) => {
    if (!s?.user) {
      if (DATA_SOURCE === "api") router.push("/login/?next=%2Ftests%2F");
      else {
        demoLogin();
        router.push("/onboarding/");
      }
      return;
    }
    try {
      const id = await startPaper(paperId, mode, retryOf);
      router.push(mode === "cbt" ? `/cbt/?id=${id}` : `/practice/session/?id=${id}`);
    } catch (e) {
      if (e instanceof QuotaExceededError) {
        const q = new URLSearchParams({ used: String(e.details.used), limit: String(e.details.limit), resets: e.details.resets_on });
        router.push(`/tests/limit/?${q.toString()}`);
        return;
      }
      toast("Couldn't start that paper. Please try again.", { icon: "alert", tone: "warn" });
    }
  };
}

/** API mode without FEATURE_PAPERS=demo: the backend has no paper endpoints yet. */
function PapersComingSoon() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <Kitty pose="sleep" className="h-20 w-auto text-fg-subtle" />
      <h1 className="mt-8 text-3xl font-semibold">Full papers are coming soon</h1>
      <p className="mt-3 text-fg-muted">Timed full papers and the exam-style CBT will arrive once licensed previous-year papers are ready. Chapter practice is available now.</p>
      <ButtonLink href="/practice/" className="mt-8">
        Go to practice
      </ButtonLink>
    </div>
  );
}

/* ---------------- /tests/ ---------------- */

export function PapersHub() {
  if (!PAPERS_ENABLED) return <PapersComingSoon />;
  return <PapersHubInner />;
}

function PapersHubInner() {
  const s = useDemo();
  const params = useSearchParams();
  const fromParam = params.get("exam") as ExamId | null;
  const [exam, setExam] = useState<ExamId | null>(fromParam && fromParam in EXAMS ? fromParam : null);
  if (s === null) return <PageSkeleton />;
  const current: ExamId = exam ?? s.user?.exam ?? "jee-main";
  const pyq = catalog.papers({ exam: current, kind: "pyq" });
  const mocks = catalog.papers({ exam: current, kind: "mock" });
  const years = [...new Set(pyq.map((p) => p.year))].sort((a, b) => (b ?? 0) - (a ?? 0));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Eyebrow className="flex items-center gap-2">
        Full papers <DemoBadge force />
      </Eyebrow>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">Papers & mock tests</h1>
          <p className="mt-2 max-w-2xl text-fg-muted">Sit a full paper in the exam-style CBT interface — timer, question palette, sections and mark-for-review — then review every solution.</p>
        </div>
        <Segmented label="Exam" value={current} onChange={(v) => setExam(v)} options={EXAM_LIST.map((e) => ({ id: e.id, label: e.name }))} />
      </div>

      <CbtExplainer />

      <section aria-labelledby="pyq-h" className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="pyq-h" className="text-xl font-semibold">
            Previous year papers
          </h2>
          <p className="text-xs text-fg-muted">Demo: real section pattern, original sample questions</p>
        </div>
        {years.map((y) => (
          <div key={y} className="mt-5">
            <h3 className="mb-3 font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">{y}</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pyq
                .filter((p) => p.year === y)
                .map((p) => (
                  <PaperTile key={p.id} paper={p} s={s} />
                ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="mock-h" className="mt-12">
        <h2 id="mock-h" className="text-xl font-semibold">
          Mock tests
        </h2>
        <p className="mt-1 text-sm text-fg-muted">Original full-length and sectional tests in the same format.</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mocks.map((p) => (
            <PaperTile key={p.id} paper={p} s={s} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function CbtExplainer() {
  return (
    <Card className="mt-8 grid gap-6 overflow-hidden p-0 md:grid-cols-[1fr_1.1fr]">
      <div className="p-6">
        <Eyebrow>Exam-style CBT</Eyebrow>
        <h2 className="mt-2 text-xl font-semibold">Practise the interface, not just the questions.</h2>
        <ul className="mt-4 space-y-2 text-sm text-fg-soft">
          {["Countdown timer with auto-submit", "Section tabs and a status palette", "Mark for review, clear response, save & next", "No hints or answers until you submit", "Every retry is saved as a new attempt"].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Icon name="check" className="mt-0.5 size-4 shrink-0 text-ok" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      {/* Miniature of the real CBT palette, built from the same visual language. */}
      <div aria-hidden className="relative hidden border-l border-line bg-bg p-6 md:block">
        <div className="rounded-md border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[0.65rem]">
            <span className="font-semibold">JEE Main · Full Mock</span>
            <span className="rounded border border-line-strong px-1.5 py-0.5 font-mono">02:41:07</span>
          </div>
          <div className="flex gap-3 border-b border-line px-3 py-1.5 text-[0.65rem] text-fg-muted">
            <span className="text-fg">Physics 12/25</span>
            <span>Chemistry 8/25</span>
            <span>Mathematics 3/25</span>
          </div>
          <div className="grid grid-cols-[1fr_7.5rem]">
            <div className="space-y-1.5 p-3">
              <div className="h-2 w-11/12 rounded bg-surface-3" />
              <div className="h-2 w-9/12 rounded bg-surface-3" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn("mt-2 h-5 rounded border", i === 1 ? "border-fg bg-surface-2" : "border-line")} />
              ))}
            </div>
            <div className="grid grid-cols-5 content-start gap-1 border-l border-line p-2">
              {Array.from({ length: 25 }, (_, i) => (
                <span key={i} className={cn("h-4 rounded-[2px]", i < 9 ? "bg-ok" : i === 9 || i === 14 ? "rounded-full bg-biology" : i < 13 ? "bg-bad" : "bg-surface-3")} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PaperTile({ paper: p, s }: { paper: Paper; s: DemoState }) {
  const start = useStart();
  const atts = attemptsFor(s, p.id);
  const done = atts.filter((a) => a.status === "submitted");
  const open = atts.find((a) => a.status === "in_progress");
  const best = done.length ? Math.max(...done.map((a) => scoreAttempt(a).score)) : null;
  const max = done.length ? scoreAttempt(done[0]).max : null;
  const router = useRouter();
  return (
    <li>
      <Card className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/tests/${p.id}/`} className="font-semibold leading-snug hover:underline">
            {p.title.replace(`${EXAMS[p.exam].name} `, "")}
          </Link>
          {p.kind === "mock" ? <span className="shrink-0 text-[0.65rem] uppercase tracking-wider text-fg-muted">Mock</span> : null}
        </div>
        <p className="mt-1 text-sm tabular-nums text-fg-muted">
          {p.questionCount} questions · {p.durationMinutes} min
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.sections.map((sec) => (
            <span key={sec.id} className={cn("text-xs", SUBJECT_STYLE[sec.subject].text)}>
              {sec.name}
            </span>
          ))}
        </div>
        <p className="mt-3 min-h-5 text-xs text-fg-muted">
          {open ? "Attempt in progress" : best !== null ? `Best ${best}/${max} · ${done.length} attempt${done.length === 1 ? "" : "s"}` : "Not attempted yet"}
        </p>
        <div className="mt-4 flex gap-2">
          {open ? (
            <Button size="sm" onClick={() => router.push(open.mode === "cbt" ? `/cbt/?id=${open.id}` : `/practice/session/?id=${open.id}`)}>
              Resume
            </Button>
          ) : (
            <Button size="sm" pixel onClick={() => start(p.id, "cbt", done[0]?.id)}>
              <Icon name="monitor" className="size-4" /> {done.length ? "Retry in CBT" : "Start in CBT"}
            </Button>
          )}
          <Link href={`/tests/${p.id}/`} className="inline-flex h-9 items-center rounded-md px-3 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg">
            Details
          </Link>
        </div>
      </Card>
    </li>
  );
}

/* ---------------- /tests/[paperId]/ ---------------- */

export function PaperDetail({ paperId }: { paperId: string }) {
  if (!PAPERS_ENABLED) return <PapersComingSoon />;
  return <PaperDetailInner paperId={paperId} />;
}

function PaperDetailInner({ paperId }: { paperId: string }) {
  const s = useDemo();
  const router = useRouter();
  const start = useStart();
  const [chooser, setChooser] = useState(false);
  const p = catalog.paper(paperId);
  if (!p) return null;
  const atts = attemptsFor(s, p.id);
  const done = atts.filter((a) => a.status === "submitted");
  const open = atts.find((a) => a.status === "in_progress");
  const latest = done[0];
  const exam = EXAMS[p.exam];

  const resume = (a: Attempt) => router.push(a.mode === "cbt" ? `/cbt/?id=${a.id}` : `/practice/session/?id=${a.id}`);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href={`/tests/?exam=${p.exam}`} className="text-sm text-fg-muted hover:text-fg">
        ← Papers & mocks
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-6">
        <div>
          <Eyebrow className="flex items-center gap-2">
            {exam.name} · {p.kind === "pyq" ? "Previous year paper" : "Mock test"} {p.isDemo && <DemoBadge force />}
          </Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{p.title}</h1>
          <p className="mt-2 text-fg-muted tabular-nums">
            {p.questionCount} questions · {p.durationMinutes} minutes · {p.sections.length} section{p.sections.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {open ? (
            <Button size="lg" pixel onClick={() => resume(open)}>
              <Icon name="play" className="size-4" /> Resume attempt
            </Button>
          ) : (
            <Button size="lg" pixel onClick={() => start(p.id, "cbt", latest?.id)}>
              <Icon name="monitor" className="size-4" /> {latest ? "Retry in exam-style CBT" : "Start in exam-style CBT"}
            </Button>
          )}
          <Button size="lg" variant="secondary" onClick={() => setChooser(true)}>
            Other ways to attempt
          </Button>
        </div>
      </div>

      {p.isDemo && (
        <p role="note" className="mt-6 rounded-xl border border-review/40 bg-review/5 p-4 text-sm text-fg-soft">
          <span className="font-medium text-review">Demo paper.</span>{" "}
          {p.kind === "pyq" ? "It follows this sitting's section pattern, but the questions are original sample items — not the questions actually asked." : "Questions are original sample items."}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <h2 className="font-medium">Pattern & marking</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <thead className="text-xs text-fg-muted">
                <tr>
                  <th className="pb-2 font-normal">Section</th>
                  <th className="pb-2 font-normal">Questions</th>
                  <th className="pb-2 font-normal">Marking (demo config)</th>
                </tr>
              </thead>
              <tbody>
                {p.sections.map((sec) => {
                  const types = [...new Set(sec.questionIds.map((id) => catalog.question(id)?.type))].filter(Boolean) as ("single_correct" | "multiple_correct" | "numerical")[];
                  return (
                    <tr key={sec.id} className="border-t border-line align-top">
                      <td className={cn("py-2.5 font-medium", SUBJECT_STYLE[sec.subject].text)}>{sec.name}</td>
                      <td className="py-2.5 tabular-nums">{sec.questionIds.length}</td>
                      <td className="py-2.5 text-fg-muted">
                        {types.map((t) => {
                          const r = sec.marking[t];
                          const n = sec.questionIds.filter((id) => catalog.question(id)?.type === t).length;
                          return (
                            <span key={t} className="block">
                              {n} × {t === "single_correct" ? "MCQ" : t === "numerical" ? "Numerical" : "Multi-correct"}: +{r?.correct} / {r?.incorrect || "0"}
                              {r?.partial ? ", partial" : ""}
                            </span>
                          );
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h3 className="mt-6 text-sm font-medium">Instructions</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
            {p.instructions.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <h2 className="font-medium">Your attempts</h2>
          {s === null ? (
            <div className="skeleton mt-4 h-24" />
          ) : atts.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">No attempts yet. Each time you start this paper, a new attempt is saved here.</p>
          ) : (
            <ol className="mt-3 divide-y divide-line">
              {atts.map((a, i) => {
                const r = a.status === "submitted" ? scoreAttempt(a) : null;
                return (
                  <li key={a.id} className="flex items-center gap-3 py-3 text-sm">
                    <span className="w-6 font-pixel text-[0.65rem] text-fg-subtle">#{atts.length - i}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {a.mode === "cbt" ? "CBT" : a.mode === "test" ? "Test mode" : "Learning mode"}
                        {a.retryOf && <span className="ml-2 text-xs font-normal text-fg-muted">retry</span>}
                      </p>
                      <p className="text-xs text-fg-muted">{relativeDay(a.startedAt)}</p>
                    </div>
                    {r ? (
                      <Link href={`/results/?id=${a.id}`} className="text-right hover:underline">
                        <span className="font-display font-semibold tabular-nums">
                          {r.score}
                          <span className="text-fg-subtle">/{r.max}</span>
                        </span>
                      </Link>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => resume(a)}>
                        Resume
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-4 border-t border-line pt-4 text-xs text-fg-muted">Retrying never overwrites an earlier attempt or its score.</p>
        </Card>
      </div>

      <Dialog open={chooser} onClose={() => setChooser(false)} title="How do you want to attempt this paper?" wide>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["cbt", "monitor", "Exam-style CBT", "The real exam experience: timer, palette, sections. Recommended."],
              ["test", "clock", "Test mode", "Timed, in the regular practice interface. Answers after submitting."],
              ["learning", "book", "Learning mode", "Untimed, with instant feedback, hints and solutions per question."],
            ] as const
          ).map(([mode, icon, title, body]) => (
            <button
              key={mode}
              type="button"
              disabled={Boolean(open)}
              onClick={() => start(p.id, mode, latest?.id)}
              className="flex flex-col items-start rounded-xl border border-line p-4 text-left transition-colors hover:border-fg disabled:opacity-50"
            >
              <Icon name={icon} className="size-5" />
              <span className="mt-3 font-medium">{title}</span>
              <span className="mt-1 text-sm text-fg-muted">{body}</span>
            </button>
          ))}
        </div>
        {open && <p className="mt-4 text-sm text-review">Finish or resume your current attempt first.</p>}
      </Dialog>
    </div>
  );
}

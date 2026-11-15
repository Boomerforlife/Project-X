"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ExamId } from "@/contracts";
import { Kitty } from "@/components/brand/Kitty";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PageSkeleton } from "@/components/ui/Primitives";
import { cn } from "@/lib/cn";
import { completeOnboarding, demoLogin, useAuthStatus, useDemo } from "@/lib/demo/store";
import type { ClassLevel } from "@/lib/demo/types";
import { EXAMS } from "@/lib/exams";
import { availableExams } from "@/lib/session/exams";
import { STREAK_MIN_QUESTIONS } from "@/lib/demo/progress";
import { DATA_SOURCE } from "@/lib/site";
import { LoadError } from "./DemoGate";
import { SUBJECT_STYLE } from "@/lib/subjects";

const GOALS = [
  { n: 10, label: "Light", sub: "~15 min a day" },
  { n: 20, label: "Steady", sub: "~30 min a day" },
  { n: 35, label: "Serious", sub: "~50 min a day" },
  { n: 50, label: "Intense", sub: "~75 min a day" },
];

const API = DATA_SOURCE === "api";

export function Onboarding() {
  const s = useDemo();
  const auth = useAuthStatus();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const examList = availableExams();
  const [exam, setExam] = useState<ExamId>(examList[0]?.id ?? "jee-main");
  const [cls, setCls] = useState<ClassLevel>("12");
  const [goal, setGoal] = useState(20);

  // Arriving here without a demo session (e.g. a bookmark) starts one.
  const signedOut = API && auth.status === "signedOut";
  useEffect(() => {
    if (s && !s.user) {
      if (API) router.replace("/login/?next=%2Fonboarding%2F");
      else demoLogin();
    }
  }, [s, router]);
  // Already onboarded (e.g. a bookmark of this page): nothing to do here.
  const already = API && Boolean(s?.user?.onboarded) && !busy;
  useEffect(() => {
    if (already) router.replace("/dashboard/");
  }, [already, router]);

  if (API && auth.status === "error") return <LoadError message={auth.message} />;
  if (!s?.user || signedOut || already) return <PageSkeleton />;

  const finish = async (patch: { exam: ExamId; classLevel: ClassLevel; dailyGoal: number }) => {
    setBusy(true);
    setFailed(false);
    try {
      await completeOnboarding(patch);
      router.push("/dashboard/");
    } catch {
      setBusy(false);
      setFailed(true);
    }
  };
  const steps = ["Exam", "Class", "Daily goal"];

  return (
    <div className="mx-auto grid w-full max-w-5xl flex-1 gap-12 px-4 py-8 sm:px-6 md:grid-cols-[1fr_15rem] md:py-14">
      <div>
        <ol className="flex items-center gap-2 text-xs" aria-label="Progress">
          {steps.map((l, i) => (
            <li key={l} className="flex items-center gap-2">
              <span className={cn("grid size-6 place-items-center rounded-full font-medium tabular-nums", i < step ? "bg-fg text-bg" : i === step ? "border border-fg" : "border border-line-strong text-fg-muted")} aria-current={i === step ? "step" : undefined}>
                {i < step ? <Icon name="check" className="size-3.5" /> : i + 1}
              </span>
              <span className={i === step ? "text-fg" : "text-fg-muted"}>{l}</span>
              {i < steps.length - 1 && <span aria-hidden className="h-px w-6 bg-line-strong" />}
            </li>
          ))}
        </ol>

        <div key={step} className="rise mt-10">
          {step === 0 && (
            <fieldset>
              <legend className="text-3xl font-semibold">Which exam are you preparing for?</legend>
              <p className="mt-2 text-fg-muted">You can switch any time from the header.</p>
              <div className="mt-8 grid gap-3">
                {examList.map((e) => (
                  <label key={e.id} className={cn("flex cursor-pointer items-start gap-4 rounded-xl border p-5 transition-colors", exam === e.id ? "border-fg bg-surface-2" : "border-line hover:border-line-strong")}>
                    <input type="radio" name="exam" className="sr-only" checked={exam === e.id} onChange={() => setExam(e.id)} />
                    <span aria-hidden className={cn("mt-1 grid size-5 shrink-0 place-items-center rounded-full border", exam === e.id ? "border-fg" : "border-line-strong")}>
                      {exam === e.id && <span className="size-2.5 rounded-full bg-fg" />}
                    </span>
                    <span className="flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-lg font-semibold">{e.name}</span>
                        <span className="flex gap-2 text-xs">
                          {e.subjects.map((sub) => (
                            <span key={sub} className={SUBJECT_STYLE[sub].text}>
                              {sub[0].toUpperCase() + sub.slice(1)}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm text-fg-muted">{e.pattern}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {step === 1 && (
            <fieldset>
              <legend className="text-3xl font-semibold">Where are you in your preparation?</legend>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["11", "Class 11", "Building foundations"],
                    ["12", "Class 12", "Board + entrance year"],
                    ["dropper", "Repeater", "Full-time preparation"],
                  ] as [ClassLevel, string, string][]
                ).map(([id, l, sub]) => (
                  <label key={id} className={cn("cursor-pointer rounded-xl border p-5 transition-colors", cls === id ? "border-fg bg-surface-2" : "border-line hover:border-line-strong")}>
                    <input type="radio" name="cls" className="sr-only" checked={cls === id} onChange={() => setCls(id)} />
                    <span className="block text-lg font-semibold">{l}</span>
                    <span className="mt-1 block text-sm text-fg-muted">{sub}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {step === 2 && (
            <fieldset>
              <legend className="text-3xl font-semibold">Set a daily goal</legend>
              <p className="mt-2 text-fg-muted">{STREAK_MIN_QUESTIONS === 1 ? "A streak day counts once you answer a question." : `A streak day counts once you answer at least ${STREAK_MIN_QUESTIONS} questions.`} Your goal is just for you.</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-4">
                {GOALS.map((g) => (
                  <label key={g.n} className={cn("cursor-pointer rounded-xl border p-5 text-center transition-colors", goal === g.n ? "border-fg bg-surface-2" : "border-line hover:border-line-strong")}>
                    <input type="radio" name="goal" className="sr-only" checked={goal === g.n} onChange={() => setGoal(g.n)} />
                    <span className="block font-display text-3xl font-semibold tabular-nums">{g.n}</span>
                    <span className="block text-sm">{g.label}</span>
                    <span className="mt-1 block text-xs text-fg-muted">{g.sub}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < 2 ? (
            <Button pixel onClick={() => setStep(step + 1)}>
              Continue <Icon name="arrowRight" className="size-4" />
            </Button>
          ) : (
            <Button pixel disabled={busy} onClick={() => finish({ exam, classLevel: cls, dailyGoal: goal })}>
              {busy ? "Saving…" : "Go to my dashboard"} <Icon name="arrowRight" className="size-4" />
            </Button>
          )}
          <button type="button" onClick={() => finish({ exam, classLevel: cls, dailyGoal: goal })} className="ml-auto text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
            Skip for now
          </button>
        </div>
        {failed && (
          <p role="alert" className="mt-6 rounded-lg border border-bad/50 bg-bad/5 p-3 text-sm">
            We couldn&rsquo;t save your choices. Check your connection and try again.
          </p>
        )}
        {!API && (
          <p className="mt-8 text-xs text-fg-muted">
            Demo: finishing fills your account with two months of sample practice for {EXAMS[exam].name} so every screen has something to show.
          </p>
        )}
      </div>
      <div className="hidden items-end md:flex">
        <Kitty pose="sit" animated className="w-full text-fg-subtle" />
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import type { Track } from "@/lib/exams";
import { quickPractice } from "@/lib/demo/launch";
import { inProgress, useDemo } from "@/lib/demo/store";
import { routes } from "@/lib/routes";

/**
 * Signed-in strip on the Practice home: Continue, Quick 10, Weakest chapter. Server render and signed-out visitors get
 * nothing (the chapter list below is the page). Uses the same quickPractice() as Home and the old practice hub.
 */
export function PracticeStrip({ track, chapterNames }: { track: Track; chapterNames: Record<string, string> }) {
  const s = useDemo();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const user = s?.user;
  if (!s || !user) return null;

  const resume = inProgress(s).find((a) => a.exam === user.exam) ?? inProgress(s)[0];
  const weak = s.server?.weak?.[0];
  const weakName = weak ? chapterNames[`${weak.subject}/${weak.chapter}`] : undefined;

  const quick = async () => {
    setStarting(true);
    try {
      const id = await quickPractice(user.exam);
      if (id) router.push(routes.session(id));
      else {
        setStarting(false);
        toast("You've solved everything there. Open a chapter to include solved questions.", { icon: "info", tone: "warn" });
      }
    } catch {
      setStarting(false);
      toast("Couldn't start the session. Please try again.", { icon: "alert", tone: "warn" });
    }
  };

  return (
    <section aria-label="Your practice" className="border-b border-line bg-surface/40">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
        {resume && (
          <Button variant="secondary" className="min-h-11" onClick={() => router.push(resume.mode === "cbt" ? routes.cbt(resume.id) : routes.session(resume.id))}>
            <Icon name="play" className="size-4" /> Continue: <span className="max-w-[16ch] truncate sm:max-w-[28ch]">{resume.title}</span>
          </Button>
        )}
        <Button pixel className="min-h-11" disabled={starting} onClick={quick}>
          <Icon name="zap" className="size-4" /> {starting ? "Starting…" : "Quick 10"}
        </Button>
        {weak && weakName && (
          <Link
            href={routes.chapterPractise(track, weak.subject, weak.chapter)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm text-fg-soft hover:bg-surface-2 hover:text-fg"
          >
            <Icon name="target" className="size-4" /> Weakest chapter: {weakName} ({Math.round(weak.accuracy * 100)}% over {weak.answered})
          </Link>
        )}
        <Link href={routes.allQuestions} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm text-fg-soft hover:bg-surface-2 hover:text-fg">
          <Icon name="list" className="size-4" /> All questions
        </Link>
      </div>
    </section>
  );
}

"use client";

import { useDemo } from "@/lib/demo/store";

/** One line of personal progress for a chapter row; renders nothing on the server or when signed out. */
export function ChapterProgress({ subject, chapter }: { subject: string; chapter: string }) {
  const s = useDemo();
  if (!s?.user || !s.server) return null;
  const c = s.server.chapters.find((x) => x.subject === subject && x.chapter === chapter);
  return (
    <p className="mt-1 text-xs tabular-nums text-fg-muted">
      {c && c.answered > 0 ? `You: ${c.correct} of ${c.answered} correct` : "Not practised yet"}
    </p>
  );
}

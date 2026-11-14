"use client";

import { useEffect, useRef, useState } from "react";
import { tick } from "@/lib/demo/store";

/**
 * Counts active seconds on the current question. Time is buffered and flushed
 * to the store every few seconds, on question change, and when the tab is
 * hidden or closed — so nothing is lost on reload. Returns the seconds not yet
 * flushed, to add to the stored total for a live clock.
 */
export function useAttemptClock(attemptId: string | null, questionId: string | null, running: boolean) {
  const pending = useRef(0);
  const [buf, setBuf] = useState({ key: "", n: 0 });
  const key = `${attemptId}:${questionId}`;
  const target = useRef<{ a: string | null; q: string | null }>({ a: attemptId, q: questionId });

  useEffect(() => {
    const flush = () => {
      const { a, q } = target.current;
      if (a && q && pending.current > 0) tick(a, q, pending.current);
      pending.current = 0;
    };
    // Question changed: book buffered time to the previous question first.
    flush();
    target.current = { a: attemptId, q: questionId };
    if (!running) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      pending.current += 1;
      if (pending.current >= 5) flush();
      setBuf({ key: `${attemptId}:${questionId}`, n: pending.current });
    }, 1000);
    const onHide = () => {
      flush();
      setBuf({ key: `${attemptId}:${questionId}`, n: 0 });
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [attemptId, questionId, running]);

  // Buffered seconds belong to the current question only; a stale buffer reads as 0.
  return { unflushed: buf.key === key ? buf.n : 0 };
}

export function formatClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

export function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

"use client";

import { useEffect, useState } from "react";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { cn } from "@/lib/cn";
import { SITE } from "@/lib/site";

export const LOADING_MESSAGES = [
  "Sharpening your pencils.",
  "Preparing your next challenge.",
  "Getting your questions ready.",
  "Setting up your study session.",
  "Almost there.",
] as const;

export const SESSION_MESSAGES = ["Setting up your study session.", "Getting your questions ready.", "Sharpening your pencils.", "Almost there."] as const;

const ROTATE_MS = 3200;
const FADE_MS = 260;

/** Cycles through messages with a short cross-fade. Starts at 0 so SSR and hydration agree. */
function useRotatingMessage(messages: readonly string[], enabled: boolean) {
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!enabled || messages.length < 2) return;
    let fade: number | undefined;
    const tick = window.setInterval(() => {
      setVisible(false);
      fade = window.setTimeout(() => {
        setI((n) => (n + 1) % messages.length);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(fade);
    };
  }, [messages.length, enabled]);
  return { message: messages[i % messages.length], visible };
}

/**
 * Branded loading state: the mascot looking around, a rotating message, an
 * indeterminate line and the wordmark. It shows only while work is actually
 * pending. Nothing waits for it to finish an animation cycle.
 *
 * `fullscreen` fills the viewport, for chrome-less shells (splash, focus mode).
 * Inside a page with navigation, use skeletons or `InlineLoader` instead so
 * headers are never duplicated.
 */
export function LoadingScreen({
  messages = LOADING_MESSAGES,
  label = "Loading",
  fullscreen = true,
  rotate = true,
  className,
}: {
  messages?: readonly string[];
  /** What screen readers hear; the rotating copy is decorative. */
  label?: string;
  fullscreen?: boolean;
  /** false for the pre-hydration splash, which is gone before a rotation would happen. */
  rotate?: boolean;
  className?: string;
}) {
  const { message, visible } = useRotatingMessage(messages, rotate);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center bg-bg px-6 text-center", fullscreen && "min-h-dvh", className)}
    >
      <span className="sr-only">{label}</span>
      <TabbyMascot state="loading" className="h-24 text-fg sm:h-28" />
      <p aria-hidden className="loading-message mt-10 h-6 font-display text-[0.95rem] tracking-tight text-fg-muted" data-visible={visible}>
        {message}
      </p>
      <div aria-hidden className="loading-line mt-5">
        <span />
      </div>
      <p aria-hidden className="mt-8 font-display text-[0.6875rem] font-semibold uppercase tracking-[0.34em] text-fg-subtle">
        {SITE.name}
      </p>
    </div>
  );
}

/** Compact loader for a section or button area: small mascot plus a label. */
export function InlineLoader({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn("inline-flex items-center gap-3 text-sm text-fg-muted", className)}>
      <TabbyMascot state="loading" className="h-7 shrink-0 text-fg" />
      <span>{label}</span>
    </div>
  );
}

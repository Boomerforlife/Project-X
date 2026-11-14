"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Marks the document ready once React has hydrated, which dismisses the
 * server-rendered splash. No artificial delay: the splash lasts exactly as
 * long as the app takes to become interactive.
 */
export function AppReady() {
  useEffect(() => {
    document.documentElement.dataset.ready = "1";
    try {
      sessionStorage.setItem("tabby-splashed", "1");
    } catch {
      /* private mode: the splash simply shows again next time */
    }
  }, []);
  return null;
}

/**
 * A 2px progress line for route changes. Starts on link clicks to another
 * page and completes when the new route renders. Purely visual feedback for
 * slower navigations; fast ones finish before it is noticeable.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (phase === "running") setPhase("done");
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      setPhase("running");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);


  useEffect(() => {
    if (phase !== "done") return;
    const t = window.setTimeout(() => setPhase("idle"), 450);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Safety: never leave the bar hanging if a navigation is cancelled.
  useEffect(() => {
    if (phase !== "running") return;
    const t = window.setTimeout(() => setPhase("done"), 8000);
    return () => window.clearTimeout(t);
  }, [phase]);

  return (
    <div
      aria-hidden
      className="nav-progress"
      style={{
        transform: `scaleX(${phase === "idle" ? 0 : phase === "running" ? 0.7 : 1})`,
        opacity: phase === "idle" ? 0 : 1,
        transitionDuration: phase === "running" ? "6s, 0.2s" : undefined,
      }}
    />
  );
}

"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Wrap a click handler that needs the account state. While it is still loading (`useDemo()` is null, e.g. for a second
 * after signing in or opening a page), a click is held and runs once loading finishes, with the latest state, instead of
 * being treated as "signed out" and sent to /login/. Only the last click is kept.
 */
export function useWhenLoaded<A extends unknown[]>(loaded: boolean, handler: (...args: A) => unknown): (...args: A) => void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  const queued = useRef<A | null>(null);
  useEffect(() => {
    if (!loaded || !queued.current) return;
    const t = window.setTimeout(() => {
      const args = queued.current;
      queued.current = null;
      if (args) void latest.current(...args);
    }, 0);
    return () => window.clearTimeout(t);
  }, [loaded]);
  return useCallback(
    (...args: A) => {
      if (loaded) void latest.current(...args);
      else queued.current = args;
    },
    [loaded],
  );
}

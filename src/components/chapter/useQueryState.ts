"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Query-string state for statically rendered public pages. The server (and the first client render) see no query, so
 * the HTML is the full unfiltered page for crawlers; the browser then applies ?year=…&type=… without a Suspense
 * boundary. Updates use history.replaceState (no navigation, no scroll jump) and notify every subscriber.
 */
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener("popstate", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("popstate", l);
  };
}

export function useQueryState(): [URLSearchParams, (patch: Record<string, string | null>) => void] {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const set = useCallback((patch: Record<string, string | null>) => {
    const u = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") u.delete(k);
      else u.set(k, v);
    }
    const qs = u.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    emit();
  }, []);
  return [new URLSearchParams(search), set];
}

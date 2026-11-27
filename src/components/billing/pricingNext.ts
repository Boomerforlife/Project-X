"use client";
import { useSyncExternalStore } from "react";
import { routes, safeNext } from "@/lib/routes";

/**
 * Where a student should land after paying, given the page they were on when they clicked "upgrade". The limit page is
 * a dead end once Plus is active (it would only show the limit again), and pricing/checkout pages are the funnel
 * itself, so those map to something useful or nothing.
 */
export function nextAfterPricing(current: string | null | undefined): string | null {
  if (!current) return null;
  const safe = safeNext(current, "");
  if (!safe) return null;
  if (safe.startsWith("/tests/limit/")) return routes.pyq("jee");
  if (["/pricing/", "/billing/", "/pay/", "/login/", "/signup/"].some((p) => safe.startsWith(p))) return null;
  return safe;
}

/** Link to /pricing/ that returns the student to `current` after paying. */
export function pricingHref(current: string | null | undefined): string {
  return routes.pricing(nextAfterPricing(current));
}

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};

/** Current path plus query (null while server-rendering). Read without useSearchParams so it needs no Suspense boundary. */
export function useCurrentUrl(): string | null {
  return useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search, () => null);
}

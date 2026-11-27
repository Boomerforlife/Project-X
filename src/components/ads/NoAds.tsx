"use client";
/**
 * Marks the current page as ad-free regardless of its URL. Error and not-found pages render at arbitrary paths, so the
 * path rules in src/lib/ads/policy.ts cannot cover them: render <NoAds /> inside such a page. While it is mounted,
 * SiteAdScript pauses the AdSense tag and AdSlot / useInfeedPositions render nothing; on unmount the flag clears.
 * Counted, so two markers mounted at once do not clear each other.
 */
import { useEffect, useSyncExternalStore } from "react";

let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** True while any <NoAds /> is mounted. */
export function useNoAds(): boolean {
  return useSyncExternalStore(subscribe, () => count > 0, () => false);
}

export function NoAds() {
  useEffect(() => {
    count += 1;
    document.documentElement.dataset.noAds = "true";
    emit();
    return () => {
      count = Math.max(0, count - 1);
      if (count === 0) delete document.documentElement.dataset.noAds;
      emit();
    };
  }, []);
  return null;
}

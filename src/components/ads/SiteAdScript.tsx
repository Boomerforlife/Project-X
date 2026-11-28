"use client";
/**
 * Site-wide AdSense tag (adsbygoogle.js?client=ca-pub-…) plus Google's ad-blocking recovery tag, loaded on every page
 * that may carry ads for free users, so Auto ads and the manual units work everywhere they are allowed. Skipped when:
 *  - ads are off in this build (NEXT_PUBLIC_ADS=off),
 *  - the viewer is not eligible (Plus = "No ads"; entitlements failing = no ads, fail closed),
 *  - the path is blocked by the ad policy (CBT, sign-in, checkout, account, admin, legal pages),
 *  - the page marked itself ad-free with <NoAds /> (404 and error pages).
 * The app is a SPA, so once loaded the scripts stay: on a blocked path we pause new ad requests and mark <html> so
 * Auto-ads placements are hidden (globals.css); on manual-only paths (practice sessions) only Auto-ads placements are
 * hidden. When an ad blocker stops both tags, a slim one-line note (a 44px strip at the very top of the page, in the
 * normal flow, so it never covers content) asks to allow ads or go ad-free; once dismissed it stays dismissed for the
 * tab, and it never shows on the question screen. We do not try to get around the blocker: proxying or disguising AdSense code
 * breaks AdSense policy.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAds } from "./AdsProvider";
import { useNoAds } from "./NoAds";
import { ADS_CONFIG } from "@/lib/ads/config";
import { loadAdSense, loadFundingChoices } from "@/lib/ads/loaders";
import { pathAllowsAds, pathManualOnly } from "@/lib/ads/policy";

const NOTICE_KEY = "tabby.adblock.noticeDismissed";

export function SiteAdScript() {
  const path = usePathname() ?? "/";
  const { ready, eligible, entitlements } = useAds();
  const noAds = useNoAds();
  const allowed = ADS_CONFIG.mode !== "off" && ready && eligible && !noAds && pathAllowsAds(path);
  const manualOnly = pathManualOnly(path);
  const [blocked, setBlocked] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const show = allowed && !manualOnly && blocked && !dismissed;

  // The note lives in its own element at the very top of <body>: in flow, so it pushes the page down instead of
  // covering the header or the hero call to action.
  useEffect(() => {
    if (!show) return;
    const el = document.createElement("div");
    document.body.prepend(el);
    let live = true;
    void Promise.resolve().then(() => live && setHost(el));
    return () => {
      live = false;
      el.remove();
      setHost(null);
    };
  }, [show]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("ads-blocked", !allowed);
    root.classList.toggle("ads-manual-only", allowed && manualOnly);
    const ads = window.adsbygoogle;
    if (!allowed) {
      if (ads) ads.pauseAdRequests = 1;
      return;
    }
    if (ads) ads.pauseAdRequests = 0;
    let live = true;
    void Promise.all([loadAdSense(), loadFundingChoices()]).then(([adsense, recovery]) => {
      // Google's own recovery message covers a blocker that let its tag through; ours is the fallback.
      if (!live) return;
      setBlocked(!adsense && !recovery);
      let seen = false;
      try {
        seen = sessionStorage.getItem(NOTICE_KEY) === "1";
      } catch {
        /* no storage: show the note */
      }
      setDismissed(seen);
    });
    return () => {
      live = false;
    };
  }, [allowed, manualOnly]);

  if (!show || !host) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(NOTICE_KEY, "1");
    } catch {
      /* the note simply shows again next page view */
    }
  };

  return createPortal(
    <div
      role="note"
      aria-label="Ad blocker detected"
      className="flex min-h-11 items-center gap-2 border-b border-line bg-surface pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] text-xs sm:justify-center sm:gap-4 sm:text-sm"
    >
      <p className="min-w-0 flex-1 truncate text-fg-soft sm:flex-none">
        <span className="font-medium text-fg">Ads keep Tabby free.</span>
        <span className="hidden sm:inline"> Please allow ads on tabbyprep.in, or go ad-free with Plus.</span>
      </p>
      {entitlements?.payments_enabled !== false && (
        <Link href="/pricing/?ref=adblock" className="inline-flex h-8 shrink-0 items-center rounded-md bg-fg px-3 text-xs font-medium text-bg hover:opacity-90">
          Go ad-free
        </Link>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss this note"
        className="grid size-11 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg sm:size-9"
      >
        <span aria-hidden className="text-base leading-none">&times;</span>
      </button>
    </div>,
    host,
  );
}

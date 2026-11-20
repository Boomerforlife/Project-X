"use client";
/**
 * Site-wide AdSense tag (adsbygoogle.js?client=ca-pub-…) plus Google's ad-blocking recovery tag, loaded on every page
 * that may carry ads for free users, so Auto ads and the manual units work everywhere they are allowed. Skipped when:
 *  - ads are off in this build (NEXT_PUBLIC_ADS=off),
 *  - the viewer is not eligible (Plus = "No ads"; entitlements failing = no ads, fail closed),
 *  - the path is blocked by the ad policy (CBT, sign-in, checkout, account, admin…).
 * The app is a SPA, so once loaded the scripts stay: on a blocked path we pause new ad requests and mark <html> so
 * Auto-ads placements are hidden (globals.css); on manual-only paths (practice sessions) only Auto-ads placements are
 * hidden. When an ad blocker stops both tags, a small dismissible note asks to allow ads or go ad-free (once per tab,
 * never on the question screen). We do not try to get around the blocker: proxying or disguising AdSense code
 * breaks AdSense policy.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAds } from "./AdsProvider";
import { ADS_CONFIG } from "@/lib/ads/config";
import { loadAdSense, loadFundingChoices } from "@/lib/ads/loaders";
import { pathAllowsAds, pathManualOnly } from "@/lib/ads/policy";

const NOTICE_KEY = "tabby.adblock.noticeDismissed";

export function SiteAdScript() {
  const path = usePathname() ?? "/";
  const { ready, eligible, entitlements } = useAds();
  const allowed = ADS_CONFIG.mode !== "off" && ready && eligible && pathAllowsAds(path);
  const manualOnly = pathManualOnly(path);
  const [blocked, setBlocked] = useState(false);
  const [dismissed, setDismissed] = useState(true);

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

  if (!allowed || manualOnly || !blocked || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(NOTICE_KEY, "1");
    } catch {
      /* the note simply shows again next page view */
    }
  };

  return (
    <div
      role="note"
      aria-label="Ad blocker detected"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface/95 px-4 py-3 text-sm shadow-lg backdrop-blur sm:inset-x-auto sm:right-4"
    >
      <p className="min-w-0 flex-1 text-fg-soft">
        <span className="font-medium text-fg">Ads keep Tabby free.</span> Please allow ads on tabbyprep.in, or go ad-free with Plus.
      </p>
      <div className="flex items-center gap-2">
        {entitlements?.payments_enabled !== false && (
          <Link href="/pricing/?ref=adblock" className="rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-bg hover:opacity-90">
            Go ad-free
          </Link>
        )}
        <button type="button" onClick={dismiss} className="rounded-md px-2 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg">
          Not now
        </button>
      </div>
    </div>
  );
}

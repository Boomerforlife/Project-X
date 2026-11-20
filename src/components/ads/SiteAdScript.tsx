"use client";
/**
 * Site-wide AdSense tag (adsbygoogle.js?client=ca-pub-…), loaded on every page that may carry ads, so AdSense Auto ads
 * and the manual units both work everywhere they are allowed. Skipped when:
 *  - ads are off in this build (NEXT_PUBLIC_ADS=off),
 *  - the viewer is not eligible (Plus = "No ads"; entitlements failing = no ads, fail closed),
 *  - the path is blocked by the ad policy (CBT, test-taking, practice sessions, sign-in, checkout, account, admin…).
 * The app is a SPA, so once loaded the script stays: on a blocked path we pause new ad requests and mark <html> so
 * Auto-ads placements are hidden (globals.css), and resume when the student leaves.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAds } from "./AdsProvider";
import { ADS_CONFIG } from "@/lib/ads/config";
import { loadAdSense } from "@/lib/ads/loaders";
import { pathAllowsAds } from "@/lib/ads/policy";

export function SiteAdScript() {
  const path = usePathname() ?? "/";
  const { ready, eligible } = useAds();
  const allowed = ADS_CONFIG.mode !== "off" && ready && eligible && pathAllowsAds(path);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("ads-blocked", !allowed);
    const ads = window.adsbygoogle;
    if (allowed) {
      if (ads) ads.pauseAdRequests = 0;
      void loadAdSense();
    } else if (ads) {
      ads.pauseAdRequests = 1;
    }
  }, [allowed]);

  return null;
}

"use client";
/**
 * Script loaders for AdSense (display / in-feed / multiplex) and Google Publisher Tag (rewarded ads, Google Ad Manager).
 * Loaded lazily, once, only when an eligible placement is about to be seen or the student pressed "watch an ad".
 * An ad blocker or network failure resolves to "blocked": the page simply shows no ad and never nags.
 */
import { ADS_CONFIG } from "./config";

declare global {
  interface Window {
    adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number; pauseAdRequests?: number };
    googletag?: GoogleTag;
  }
}

/* Minimal GPT surface used here (https://developers.google.com/publisher-tag/reference). */
interface GptSlot {
  addService(s: unknown): GptSlot;
}
interface GptEvent {
  slot: GptSlot;
  isEmpty?: boolean;
  makeRewardedVisible?: () => boolean | void;
}
interface GoogleTag {
  cmd: Array<() => void> | { push(f: () => void): void };
  enums: { OutOfPageFormat: { REWARDED: number } };
  defineOutOfPageSlot(unit: string, format: number): GptSlot | null;
  pubads(): {
    addEventListener(t: string, f: (e: GptEvent) => void): void;
    removeEventListener(t: string, f: (e: GptEvent) => void): void;
    setPrivacySettings(s: Record<string, boolean>): void;
  };
  enableServices(): void;
  display(s: GptSlot): void;
  destroySlots(s?: GptSlot[]): boolean;
}

function inject(src: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("blocked"));
    document.head.appendChild(s);
  });
}

let adsense: Promise<boolean> | null = null;
/** true when adsbygoogle.js loaded; false when blocked/failed (cached for the tab). */
export function loadAdSense(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  adsense ??= (async () => {
    window.adsbygoogle = window.adsbygoogle || ([] as unknown as NonNullable<Window["adsbygoogle"]>);
    // Audience includes minors: request non-personalised ads unless explicitly turned off (NEXT_PUBLIC_ADS_NPA=off).
    if (ADS_CONFIG.nonPersonalized) window.adsbygoogle.requestNonPersonalizedAds = 1;
    try {
      await inject(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADS_CONFIG.client)}`, {
        crossorigin: "anonymous",
      });
      return true;
    } catch {
      return false;
    }
  })();
  return adsense;
}

let fc: Promise<boolean> | null = null;
/**
 * Google's ad-blocking recovery tag (AdSense → Privacy & messaging → Ad blocking recovery). Google shows its own
 * "allow ads" message to visitors with an ad blocker; the iframe signal is Google's documented snippet. true when the
 * tag loaded (Google's message will handle a blocker), false when it was blocked too.
 */
export function loadFundingChoices(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  fc ??= (async () => {
    const pub = /^ca-pub-(\d{10,20})$/.exec(ADS_CONFIG.client)?.[1];
    if (!pub) return false;
    const signal = () => {
      if (window.frames["googlefcPresent" as unknown as number]) return;
      if (!document.body) return void setTimeout(signal, 0);
      const f = document.createElement("iframe");
      f.style.cssText = "width:0;height:0;border:none;z-index:-1000;left:-1000px;top:-1000px;display:none";
      f.name = "googlefcPresent";
      document.body.appendChild(f);
    };
    try {
      const loaded = inject(`https://fundingchoicesmessages.google.com/i/pub-${pub}?ers=1`);
      signal(); // as in Google's snippet: runs alongside the tag, not after it
      await loaded;
      return true;
    } catch {
      return false;
    }
  })();
  return fc;
}

let gpt: Promise<GoogleTag | null> | null = null;
function loadGpt(): Promise<GoogleTag | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  gpt ??= (async () => {
    window.googletag = window.googletag || ({ cmd: [] } as unknown as GoogleTag);
    try {
      await inject("https://securepubads.g.doubleclick.net/tag/js/gpt.js", { crossorigin: "anonymous" });
      return window.googletag ?? null;
    } catch {
      gpt = null; // allow a retry later
      return null;
    }
  })();
  return gpt;
}

export type RewardedOutcome = "GRANTED" | "CLOSED" | "NO_FILL" | "ERROR";

/**
 * Show one rewarded ad. Resolves:
 *  - GRANTED  only if GPT fired `rewardedSlotGranted` (then the student closed the ad),
 *  - CLOSED   the student closed it before the reward (allowed any time; Google's player provides the close control),
 *  - NO_FILL  no ad available / unsupported here / took too long to load (we never wait the student out),
 *  - ERROR    the tag could not load (ad blocker, network).
 * `onVisible` fires when the ad is actually on screen.
 */
export async function showRewarded(unit: string, opts: { loadTimeoutMs?: number; onVisible?: () => void } = {}): Promise<RewardedOutcome> {
  const tag = await loadGpt();
  if (!tag) return "ERROR";
  return new Promise<RewardedOutcome>((resolve) => {
    const push = (f: () => void) => (Array.isArray(tag.cmd) ? tag.cmd.push(f) : tag.cmd.push(f));
    push(() => {
      let slot: GptSlot | null = null;
      try {
        slot = tag.defineOutOfPageSlot(unit, tag.enums.OutOfPageFormat.REWARDED);
      } catch {
        slot = null;
      }
      // null = the page/device does not support rewarded ads (Google decides). Not the student's fault; no reward.
      if (!slot) return resolve("NO_FILL");
      const pub = tag.pubads();
      let granted = false;
      let visible = false;
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!visible) finish("NO_FILL");
      }, opts.loadTimeoutMs ?? 12_000);
      const finish = (o: RewardedOutcome) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        pub.removeEventListener("rewardedSlotReady", onReady);
        pub.removeEventListener("rewardedSlotGranted", onGranted);
        pub.removeEventListener("rewardedSlotClosed", onClosed);
        pub.removeEventListener("slotRenderEnded", onRender);
        try {
          tag.destroySlots([slot!]);
        } catch {
          /* already gone */
        }
        resolve(o);
      };
      const mine = (e: GptEvent) => e.slot === slot;
      const onReady = (e: GptEvent) => {
        if (!mine(e)) return;
        // The student already chose to watch (they pressed the button), so show it straight away.
        const ok = e.makeRewardedVisible?.();
        if (ok === false) return finish("NO_FILL");
        visible = true;
        opts.onVisible?.();
      };
      const onGranted = (e: GptEvent) => {
        if (mine(e)) granted = true;
      };
      const onClosed = (e: GptEvent) => {
        if (mine(e)) finish(granted ? "GRANTED" : "CLOSED");
      };
      const onRender = (e: GptEvent) => {
        if (mine(e) && e.isEmpty) finish("NO_FILL");
      };
      pub.addEventListener("rewardedSlotReady", onReady);
      pub.addEventListener("rewardedSlotGranted", onGranted);
      pub.addEventListener("rewardedSlotClosed", onClosed);
      pub.addEventListener("slotRenderEnded", onRender);
      try {
        slot.addService(pub);
        if (ADS_CONFIG.nonPersonalized) pub.setPrivacySettings({ nonPersonalizedAds: true });
        tag.enableServices();
        tag.display(slot);
      } catch {
        finish("ERROR");
      }
    });
  });
}

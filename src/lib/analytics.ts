/**
 * Privacy-light product analytics. Events are aggregated server-side into daily counters
 * (`POST /analytics/events` -> analytics_daily): no user id, no IP, no cookies, no third-party script.
 * Only allow-listed event names and one short dimension (e.g. plan code) are accepted.
 * No-op in mock mode, during SSR, and when the browser asks not to be tracked.
 */
import { browserBaseUrl, apiEnabled } from "@/lib/api/env";

export type AnalyticsEvent =
  | "signup_completed"
  | "session_started"
  | "session_completed"
  | "pricing_view"
  | "upgrade_prompt_shown"
  | "upgrade_prompt_clicked"
  | "checkout_start"
  | "checkout_submitted"
  | "checkout_dismissed"
  | "payment_confirmed"
  | "payment_link_created";

const queue: { event: AnalyticsEvent; dim?: string }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function optedOut(): boolean {
  try {
    const n = navigator as Navigator & { globalPrivacyControl?: boolean };
    return n.doNotTrack === "1" || n.globalPrivacyControl === true;
  } catch {
    return true;
  }
}

function flush() {
  timer = null;
  if (queue.length === 0) return;
  const body = JSON.stringify({ events: queue.splice(0, 20) });
  const url = `${browserBaseUrl()}/analytics/events`;
  try {
    if (!navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) {
      void fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => undefined);
    }
  } catch {
    /* analytics must never break the page */
  }
}

export function track(event: AnalyticsEvent, props?: { plan?: string; mode?: string; context?: string }) {
  if (typeof window === "undefined" || !apiEnabled() || optedOut()) return;
  const dim = props?.plan ?? props?.mode ?? props?.context;
  queue.push(dim ? { event, dim: dim.slice(0, 40) } : { event });
  if (!timer) timer = setTimeout(flush, 1500);
  if (queue.length >= 20) flush();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
}

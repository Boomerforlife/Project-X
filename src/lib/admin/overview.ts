/**
 * Pure helpers for the admin overview: number formatting and the "needs attention" list.
 * Every alert is derived from numbers the API returned; nothing is guessed.
 */
import type { AdminMetrics } from "@projectx/contracts";

const nf = new Intl.NumberFormat("en-IN");
export const fmt = (n: number) => nf.format(n);

/** Paise → "₹1,234" (whole rupees) or "₹12.50". */
export function inr(paise: number): string {
  const r = paise / 100;
  return `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 }).format(r)}`;
}

export function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** "3 h ago" style, relative to `now`. */
export function ago(isoTs: string | null, now: Date = new Date()): string {
  if (!isoTs) return "never";
  const s = Math.max(0, Math.round((now.getTime() - new Date(isoTs).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

export const sumBuckets = (rows: { count: number }[]) => rows.reduce((a, r) => a + r.count, 0);
export const bucket = (rows: { key: string; count: number }[], key: string) => rows.find((r) => r.key === key)?.count ?? 0;

export type Alert = { level: "warn" | "info"; text: string };

export function alertsFor(m: AdminMetrics, apiOk: boolean | null): Alert[] {
  const out: Alert[] = [];
  if (apiOk === false) out.push({ level: "warn", text: "The API health check is failing from this browser." });
  if (m.billing.webhooks_unprocessed > 0)
    out.push({ level: "warn", text: `${fmt(m.billing.webhooks_unprocessed)} Razorpay webhook event(s) received but not processed.` });
  const failedJobs = bucket(m.pipeline.jobs_by_status, "DEAD");
  if (failedJobs > 0) out.push({ level: "warn", text: `${fmt(failedJobs)} ingestion job(s) failed.` });
  if (m.support.reports_open > 0) out.push({ level: "warn", text: `${fmt(m.support.reports_open)} open question report(s) from students.` });
  if (m.users.admins === 0) out.push({ level: "warn", text: "No account has the ADMIN role." });
  if (m.support.doubts_open > 0) out.push({ level: "info", text: `${fmt(m.support.doubts_open)} open doubt(s).` });
  if (m.content.published_without_text > 0)
    out.push({ level: "info", text: `${fmt(m.content.published_without_text)} published question(s) have no readable text (image only), so they stay out of the sitemap.` });
  if (m.users.active_7d === 0) out.push({ level: "info", text: "No student answered a question in the last 7 days." });
  return out;
}

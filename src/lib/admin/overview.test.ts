import { describe, expect, it } from "vitest";
import type { AdminMetrics } from "@projectx/contracts";
import { ago, alertsFor, bytes, inr, pct } from "./overview";

const base: AdminMetrics = {
  generated_at: "2026-11-28T06:00:00.000Z",
  window_days: 30,
  users: { total: 4, new_7d: 0, new_30d: 4, active_1d: 0, active_7d: 1, active_30d: 2, onboarded: 3, email_unconfirmed: 0, with_password: 2, with_google: 3, admins: 1 },
  activity: {
    attempts_total: 8, attempts_7d: 2, attempts_30d: 8, correct_rate_30d: 0.5, sessions_total: 3, sessions_7d: 1, sessions_completed_30d: 1,
    sessions_by_mode_30d: [], paper_sessions_total: 0, paper_sessions_completed: 0, bookmarks: 0, mistakes_open: 0, study_plans: 0,
  },
  daily: { signups: [], attempts: [], active_users: [] },
  content: { published: 10, drafts: 2, archived: 0, in_sitemap: 8, papers: 1, by_exam_subject: [], by_verification: [], by_difficulty_published: [], published_without_text: 0, paper_only_published: 0 },
  billing: { orders_by_status: [], revenue_paise_total: 0, revenue_paise_30d: 0, refunded_paise_total: 0, plus_active: 0, last_paid_at: null, last_webhook_at: null, webhooks_unprocessed: 0 },
  support: { reports_open: 0, doubts_open: 0, recent_reports: [] },
  pipeline: { jobs_by_status: [], last_job_at: null, ai_runs_30d: 0, ai_cost_usd_30d: 0, difficulty_by_source: [] },
  analytics_30d: [],
  database: { size_bytes: 1, last_migration: "0031" },
};

describe("admin overview helpers", () => {
  it("formats money, percentages, sizes and times", () => {
    expect(inr(2900)).toBe("₹29");
    expect(inr(2950)).toBe("₹29.50");
    expect(inr(12_345_600)).toBe("₹1,23,456");
    expect(pct(0.5)).toBe("50%");
    expect(pct(null)).toBe("—");
    expect(bytes(150 * 1024 * 1024)).toBe("150 MB");
    expect(ago(null)).toBe("never");
    expect(ago("2026-11-28T03:00:00Z", new Date("2026-11-28T06:00:00Z"))).toBe("3 h ago");
  });

  it("raises alerts only from returned numbers", () => {
    expect(alertsFor(base, true)).toEqual([]);
    const bad = alertsFor(
      { ...base, users: { ...base.users, admins: 0, active_7d: 0 }, billing: { ...base.billing, webhooks_unprocessed: 2 }, pipeline: { ...base.pipeline, jobs_by_status: [{ key: "DEAD", count: 1 }] } },
      false,
    );
    expect(bad.filter((a) => a.level === "warn").map((a) => a.text)).toEqual([
      "The API health check is failing from this browser.",
      "2 Razorpay webhook event(s) received but not processed.",
      "1 ingestion job(s) failed.",
      "No account has the ADMIN role.",
    ]);
    expect(bad.some((a) => a.text.startsWith("No student answered"))).toBe(true);
  });
});

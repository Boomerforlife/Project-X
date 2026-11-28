/**
 * Admin overview (GET /admin/metrics, Owner B 2026-11-28): one read-only snapshot for the /admin/ dashboard.
 * Aggregates only. No emails, names or user ids; student reports carry the question, never the author.
 */
import { z } from '@hono/zod-openapi';

const Count = z.int().nonnegative();
const Day = z.object({ day: z.string(), count: Count });
const Bucket = z.object({ key: z.string(), count: Count });

export const AdminMetricsSchema = z.object({
  generated_at: z.string(),
  window_days: z.int(),
  users: z.object({
    total: Count,
    new_7d: Count,
    new_30d: Count,
    active_1d: Count,
    active_7d: Count,
    active_30d: Count,
    onboarded: Count,
    email_unconfirmed: Count,
    with_password: Count,
    with_google: Count,
    admins: Count,
  }),
  activity: z.object({
    attempts_total: Count,
    attempts_7d: Count,
    attempts_30d: Count,
    correct_rate_30d: z.number().nullable(),
    sessions_total: Count,
    sessions_7d: Count,
    sessions_completed_30d: Count,
    sessions_by_mode_30d: z.array(Bucket),
    paper_sessions_total: Count,
    paper_sessions_completed: Count,
    bookmarks: Count,
    mistakes_open: Count,
    study_plans: Count,
  }),
  daily: z.object({
    signups: z.array(Day),
    attempts: z.array(Day),
    active_users: z.array(Day),
  }),
  content: z.object({
    published: Count,
    drafts: Count,
    archived: Count,
    in_sitemap: Count,
    papers: Count,
    by_exam_subject: z.array(z.object({ exam: z.string(), subject: z.string(), published: Count, draft: Count })),
    by_verification: z.array(Bucket),
    by_difficulty_published: z.array(Bucket),
    published_without_text: Count,
    paper_only_published: Count,
  }),
  billing: z.object({
    orders_by_status: z.array(Bucket),
    revenue_paise_total: Count,
    revenue_paise_30d: Count,
    refunded_paise_total: Count,
    plus_active: Count,
    last_paid_at: z.string().nullable(),
    last_webhook_at: z.string().nullable(),
    webhooks_unprocessed: Count,
  }),
  support: z.object({
    reports_open: Count,
    doubts_open: Count,
    recent_reports: z.array(z.object({ created_at: z.string(), question_slug: z.string().nullable(), reason: z.string(), excerpt: z.string() })),
  }),
  pipeline: z.object({
    jobs_by_status: z.array(Bucket),
    last_job_at: z.string().nullable(),
    ai_runs_30d: Count,
    ai_cost_usd_30d: z.number(),
    difficulty_by_source: z.array(Bucket),
  }),
  analytics_30d: z.array(z.object({ event: z.string(), count: Count })),
  database: z.object({ size_bytes: Count, last_migration: z.string().nullable() }),
}).openapi('AdminMetrics');
export type AdminMetrics = z.infer<typeof AdminMetricsSchema>;

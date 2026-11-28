/**
 * Admin overview: one read-only snapshot of the whole system for the /admin/ dashboard.
 * Aggregates only: no emails, names or user ids leave this route (student reports show the question, never the author).
 * Every query runs in one service transaction; nothing is written.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';
import { AdminMetricsSchema, type AdminMetrics } from '@projectx/contracts';
import { deps, send, type AppEnv, type Ctx } from '../lib/http';
import { defineRoute, type Guards } from '../routes/define';

const WINDOW = 30;

type Row = Record<string, unknown>;
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string).toISOString());

/** `[REPORT:reason] text` → { reason, text }; anything else is a doubt, not a report. */
export function parseReport(body: string): { reason: string; text: string } | null {
  const m = /^\[REPORT:([^\]]{1,40})\]\s*([\s\S]*)$/.exec(body);
  return m ? { reason: m[1]!.trim(), text: m[2]!.trim() } : null;
}

export function registerAdminMetrics(app: OpenAPIHono<AppEnv>, g: Guards): void {
  const route = defineRoute({
    method: 'get', path: '/admin/metrics', summary: 'System overview for the admin dashboard (aggregates only)',
    tags: ['admin'], access: 'admin', cache: 'PRIVATE', rl: 'RL_ADMIN', data: AdminMetricsSchema,
  })(g);

  app.openapi(route, async (c: Ctx) => {
    const d = deps(c);
    const now = d.clock();
    const data = await d.db.withService(async (tx) => {
      const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await tx.query<Row>(sql, params)).rows[0] ?? {};
      const many = async (sql: string, params: unknown[] = []): Promise<Row[]> => (await tx.query<Row>(sql, params)).rows;
      const at = now.toISOString();

      // Hosted Supabase has auth.identities and email_confirmed_at; the local test shim does not, so probe first
      // (a failing query would abort the whole transaction).
      const caps = await one(
        `select to_regclass('auth.identities') is not null as identities,
                exists (select 1 from information_schema.columns
                         where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at') as confirmed,
                to_regclass('supabase_migrations.schema_migrations') is not null as migrations`,
      );
      const ident = (p: string) =>
        caps.identities ? `(select count(distinct user_id) from auth.identities where provider = '${p}')` : '0';
      const u = await one(
        `select count(*) total,
                count(*) filter (where created_at > $1::timestamptz - interval '7 days') new_7d,
                count(*) filter (where created_at > $1::timestamptz - interval '30 days') new_30d,
                ${caps.confirmed ? 'count(*) filter (where email_confirmed_at is null)' : '0'} email_unconfirmed,
                ${ident('email')} with_password,
                ${ident('google')} with_google,
                (select count(*) from public.profiles where onboarding_completed_at is not null) onboarded,
                (select count(distinct user_id) from public.user_roles where role = 'ADMIN') admins
           from auth.users`,
        [at],
      );
      const act = await one(
        `select count(distinct user_id) filter (where created_at > $1::timestamptz - interval '1 day') a1,
                count(distinct user_id) filter (where created_at > $1::timestamptz - interval '7 days') a7,
                count(distinct user_id) filter (where created_at > $1::timestamptz - interval '30 days') a30,
                count(*) total,
                count(*) filter (where created_at > $1::timestamptz - interval '7 days') t7,
                count(*) filter (where created_at > $1::timestamptz - interval '30 days') t30,
                avg(case when is_correct then 1.0 when is_correct = false then 0.0 end)
                  filter (where created_at > $1::timestamptz - interval '30 days') correct30
           from public.attempts`,
        [at],
      );
      const ses = await one(
        `select count(*) total,
                count(*) filter (where created_at > $1::timestamptz - interval '7 days') s7,
                count(*) filter (where completed_at > $1::timestamptz - interval '30 days') done30,
                count(*) filter (where paper_id is not null) papers,
                count(*) filter (where paper_id is not null and completed_at is not null) papers_done
           from public.practice_sessions`,
        [at],
      );
      const modes = await many(
        `select mode::text as key, count(*) as count from public.practice_sessions
          where created_at > $1::timestamptz - interval '30 days' group by 1 order by 2 desc`,
        [at],
      );
      const misc = await one(
        `select (select count(*) from public.bookmarks) bookmarks,
                (select count(*) from public.mistakes where resolved_at is null) mistakes_open,
                (select count(*) from public.study_plans) study_plans`,
      );

      const daySeries = (expr: string, table: string) =>
        many(
          `select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(x.count, 0) as count
             from generate_series((($1::timestamptz) at time zone 'Asia/Kolkata')::date - ${WINDOW - 1},
                                  (($1::timestamptz) at time zone 'Asia/Kolkata')::date, interval '1 day') as d(day)
             left join (select ((created_at at time zone 'Asia/Kolkata')::date) as day, ${expr} as count from ${table}
                         where created_at > $1::timestamptz - interval '${WINDOW + 1} days' group by 1) x on x.day = d.day::date
            order by d.day`,
          [at],
        );
      const signupsDaily = await daySeries('count(*)', 'auth.users');
      const attemptsDaily = await daySeries('count(*)', 'public.attempts');
      const activeDaily = await daySeries('count(distinct user_id)', 'public.attempts');

      const content = await one(
        `select count(*) filter (where publication_status = 'PUBLISHED') published,
                count(*) filter (where publication_status = 'DRAFT') drafts,
                count(*) filter (where publication_status = 'ARCHIVED') archived,
                count(*) filter (where sitemap_include) in_sitemap,
                count(*) filter (where publication_status = 'PUBLISHED' and length(coalesce(question_text, '')) < 40) no_text,
                count(*) filter (where publication_status = 'PUBLISHED' and c.is_active is not true) paper_only
           from public.questions q left join public.chapters c on c.id = q.chapter_id`,
      );
      const papers = await one(`select count(*) n from public.exam_papers`);
      const bySubject = await many(
        `select e.name exam, coalesce(s.name, '—') subject,
                count(*) filter (where q.publication_status = 'PUBLISHED') published,
                count(*) filter (where q.publication_status = 'DRAFT') draft
           from public.questions q join public.exams e on e.id = q.exam_id left join public.subjects s on s.id = q.subject_id
          group by 1, 2 order by 1, 2`,
      );
      const byVerification = await many(
        `select verification_status::text key, count(*) count from public.questions group by 1 order by 2 desc`,
      );
      const byDifficulty = await many(
        `select coalesce(difficulty::text, 'NOT_RATED') key, count(*) count from public.questions
          where publication_status = 'PUBLISHED' group by 1 order by 1`,
      );

      const ordersByStatus = await many(`select status::text key, count(*) count from public.billing_orders group by 1 order by 1`);
      const bill = await one(
        `select coalesce(sum(amount_paise) filter (where paid_at is not null), 0) total,
                coalesce(sum(amount_paise) filter (where paid_at > $1::timestamptz - interval '30 days'), 0) last30,
                coalesce(sum(refunded_paise), 0) refunded,
                max(paid_at) last_paid,
                (select count(distinct user_id) from public.billing_entitlements
                  where revoked_at is null and starts_at <= $1::timestamptz and ends_at > $1::timestamptz) plus_active,
                (select max(received_at) from public.billing_events) last_webhook,
                (select count(*) from public.billing_events where processed_at is null) unprocessed
           from public.billing_orders`,
        [at],
      );

      const sup = await one(
        `select count(*) filter (where body like '[REPORT:%' and status = 'OPEN') reports_open,
                count(*) filter (where body not like '[REPORT:%' and status = 'OPEN') doubts_open
           from public.doubts`,
      );
      const recent = await many(
        `select d.created_at, q.slug, d.body from public.doubts d left join public.questions q on q.id = d.question_id
          where d.body like '[REPORT:%' order by d.created_at desc limit 10`,
      );

      const jobs = await many(`select status::text key, count(*) count from public.pipeline_jobs group by 1 order by 1`);
      const pipe = await one(
        `select (select max(coalesce(finished_at, updated_at)) from public.pipeline_jobs) last_job,
                (select count(*) from public.ai_runs where created_at > $1::timestamptz - interval '30 days') ai30,
                (select coalesce(sum(cost_usd_micros), 0) from public.ai_runs where created_at > $1::timestamptz - interval '30 days') cost30`,
        [at],
      );
      const diffSource = await many(
        `select coalesce(difficulty_source, 'NONE') key, count(*) count from public.questions
          where publication_status = 'PUBLISHED' group by 1 order by 2 desc`,
      );
      const events = await many(
        `select event, sum(count) count from public.analytics_daily
          where day > (($1::timestamptz) at time zone 'Asia/Kolkata')::date - ${WINDOW} group by 1 order by 2 desc`,
        [at],
      );
      const dbInfo = await one(
        `select pg_database_size(current_database()) size,
                ${caps.migrations ? '(select max(version) from supabase_migrations.schema_migrations)' : 'null::text'} last_migration`,
      );

      const buckets = (rows: Row[]) => rows.map((r) => ({ key: String(r.key), count: n(r.count) }));
      const days = (rows: Row[]) => rows.map((r) => ({ day: String(r.day), count: n(r.count) }));

      const result: AdminMetrics = {
        generated_at: at,
        window_days: WINDOW,
        users: {
          total: n(u.total), new_7d: n(u.new_7d), new_30d: n(u.new_30d),
          active_1d: n(act.a1), active_7d: n(act.a7), active_30d: n(act.a30),
          onboarded: n(u.onboarded), email_unconfirmed: n(u.email_unconfirmed),
          with_password: n(u.with_password), with_google: n(u.with_google), admins: n(u.admins),
        },
        activity: {
          attempts_total: n(act.total), attempts_7d: n(act.t7), attempts_30d: n(act.t30),
          correct_rate_30d: act.correct30 === null || act.correct30 === undefined ? null : Math.round(Number(act.correct30) * 1000) / 1000,
          sessions_total: n(ses.total), sessions_7d: n(ses.s7), sessions_completed_30d: n(ses.done30),
          sessions_by_mode_30d: buckets(modes),
          paper_sessions_total: n(ses.papers), paper_sessions_completed: n(ses.papers_done),
          bookmarks: n(misc.bookmarks), mistakes_open: n(misc.mistakes_open), study_plans: n(misc.study_plans),
        },
        daily: { signups: days(signupsDaily), attempts: days(attemptsDaily), active_users: days(activeDaily) },
        content: {
          published: n(content.published), drafts: n(content.drafts), archived: n(content.archived),
          in_sitemap: n(content.in_sitemap), papers: n(papers.n),
          by_exam_subject: bySubject.map((r) => ({ exam: String(r.exam), subject: String(r.subject), published: n(r.published), draft: n(r.draft) })),
          by_verification: buckets(byVerification),
          by_difficulty_published: buckets(byDifficulty),
          published_without_text: n(content.no_text),
          paper_only_published: n(content.paper_only),
        },
        billing: {
          orders_by_status: buckets(ordersByStatus),
          revenue_paise_total: n(bill.total), revenue_paise_30d: n(bill.last30), refunded_paise_total: n(bill.refunded),
          plus_active: n(bill.plus_active), last_paid_at: iso(bill.last_paid), last_webhook_at: iso(bill.last_webhook),
          webhooks_unprocessed: n(bill.unprocessed),
        },
        support: {
          reports_open: n(sup.reports_open),
          doubts_open: n(sup.doubts_open),
          recent_reports: recent.flatMap((r) => {
            const p = parseReport(String(r.body ?? ''));
            if (!p) return [];
            return [{ created_at: iso(r.created_at) ?? at, question_slug: r.slug ? String(r.slug) : null, reason: p.reason, excerpt: p.text.slice(0, 200) }];
          }),
        },
        pipeline: {
          jobs_by_status: buckets(jobs),
          last_job_at: iso(pipe.last_job),
          ai_runs_30d: n(pipe.ai30),
          ai_cost_usd_30d: Math.round(n(pipe.cost30) / 10_000) / 100,
          difficulty_by_source: buckets(diffSource),
        },
        analytics_30d: events.map((r) => ({ event: String(r.event), count: n(r.count) })),
        database: { size_bytes: n(dbInfo.size), last_migration: dbInfo.last_migration ? String(dbInfo.last_migration) : null },
      };
      return result;
    });
    return send(c, 200, data);
  });
}

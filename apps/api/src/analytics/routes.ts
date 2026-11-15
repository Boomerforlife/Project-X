/**
 * Privacy-light analytics: the web app posts allow-listed event names; we only increment daily counters
 * (analytics_daily). Nothing identifies a person: no user id, no IP, no user agent is stored.
 * Payments are reported from billing_orders (the source of truth), not from client events.
 */
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { DateStringSchema } from '@projectx/contracts';
import { ApiError, validation } from '../lib/errors';
import { deps, send, valid, type AppEnv, type Ctx } from '../lib/http';
import { rateLimit } from '../middleware/guards';
import { defineRoute, type Guards } from '../routes/define';

export const ANALYTICS_EVENTS = [
  'signup_completed',
  'session_started',
  'session_completed',
  'pricing_view',
  'upgrade_prompt_shown',
  'upgrade_prompt_clicked',
  'checkout_start',
  'checkout_submitted',
  'checkout_dismissed',
  'payment_confirmed',
  'payment_link_created',
] as const;
const EVENTS = new Set<string>(ANALYTICS_EVENTS);

const EventsBody = z.object({
  events: z
    .array(z.object({ event: z.string().max(40), dim: z.string().max(40).optional() }))
    .min(1)
    .max(20),
});

const DailyQuery = z.object({ from: DateStringSchema, to: DateStringSchema });
const DailyRow = z.object({ day: z.string(), event: z.string(), dim: z.string(), count: z.int() });
const RevenueRow = z.object({ day: z.string(), plan_code: z.string(), paid_orders: z.int(), amount_paise: z.int(), refunded_orders: z.int() });

export function registerAnalytics(app: OpenAPIHono<AppEnv>, g: Guards): void {
  // Plain route: sendBeacon posts text/plain (no CORS preflight), so the body is parsed here.
  app.post('/analytics/events', rateLimit('RL_PUBLIC'), async (c) => {
    const raw = await c.req.text();
    if (raw.length > 4096) throw new ApiError('PAYLOAD_TOO_LARGE', 'Too many events');
    let parsed: z.infer<typeof EventsBody>;
    try {
      const r = EventsBody.safeParse(JSON.parse(raw));
      if (!r.success) throw validation('Invalid events');
      parsed = r.data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw validation('Body must be JSON');
    }
    const counts = new Map<string, { event: string; dim: string; n: number }>();
    for (const e of parsed.events) {
      if (!EVENTS.has(e.event)) continue;
      const dim = (e.dim ?? '').toLowerCase();
      if (!/^[a-z0-9_]{0,40}$/.test(dim)) continue;
      const k = `${e.event}|${dim}`;
      counts.set(k, { event: e.event, dim, n: (counts.get(k)?.n ?? 0) + 1 });
    }
    if (counts.size > 0) {
      const d = deps(c as Ctx);
      const now = d.clock().toISOString();
      await d.db.withService(async (tx) => {
        for (const v of counts.values()) {
          await tx.query(
            `insert into public.analytics_daily (day, event, dim, count)
             values ((($1::timestamptz) at time zone 'Asia/Kolkata')::date, $2, $3, $4)
             on conflict (day, event, dim) do update set count = analytics_daily.count + excluded.count`,
            [now, v.event, v.dim, v.n],
          );
        }
      });
    }
    return c.body(null, 204);
  });

  const daily = defineRoute({
    method: 'get', path: '/admin/analytics/daily', summary: 'Daily event counters (aggregate only)', tags: ['admin', 'analytics'],
    access: 'admin', cache: 'PRIVATE', rl: 'RL_ADMIN', request: { query: DailyQuery },
    data: z.object({ events: z.array(DailyRow), revenue: z.array(RevenueRow), signups: z.array(z.object({ day: z.string(), count: z.int() })) }),
  })(g);
  app.openapi(daily, async (c: Ctx) => {
    const q = valid(c, 'query', DailyQuery);
    if (q.from > q.to) throw validation('from must be <= to');
    const d = deps(c);
    const data = await d.db.withService(async (tx) => {
      const events = (
        await tx.query<{ day: string; event: string; dim: string; count: string }>(
          `select to_char(day, 'YYYY-MM-DD') as day, event, dim, count::text from public.analytics_daily
            where day between $1::date and $2::date order by day, event, dim`,
          [q.from, q.to],
        )
      ).rows.map((r) => ({ ...r, count: Number(r.count) }));
      const revenue = (
        await tx.query<{ day: string; plan_code: string; paid_orders: number; amount_paise: string; refunded_orders: number }>(
          `select to_char((paid_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day, plan_code,
                  count(*)::int as paid_orders, sum(amount_paise)::text as amount_paise,
                  count(*) filter (where status = 'REFUNDED')::int as refunded_orders
             from public.billing_orders
            where paid_at is not null and (paid_at at time zone 'Asia/Kolkata')::date between $1::date and $2::date
            group by 1, 2 order by 1, 2`,
          [q.from, q.to],
        )
      ).rows.map((r) => ({ ...r, amount_paise: Number(r.amount_paise) }));
      const signups = (
        await tx.query<{ day: string; count: number }>(
          `select to_char((created_at at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD') as day, count(*)::int as count
             from auth.users where (created_at at time zone 'Asia/Kolkata')::date between $1::date and $2::date
            group by 1 order by 1`,
          [q.from, q.to],
        )
      ).rows;
      return { events, revenue, signups };
    });
    return send(c, 200, data);
  });
}

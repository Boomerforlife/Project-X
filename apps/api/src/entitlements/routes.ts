import { OpenAPIHono } from '@hono/zod-openapi';
import { EntitlementsSchema } from '@projectx/contracts';
import { billingDeps } from '../billing/routes';
import { plusUntil, quotaPeriod, rewardedFullPapers } from '../billing/service';
import { send, type AppEnv, type Ctx } from '../lib/http';
import { defineRoute, type Guards } from '../routes/define';
import { buildEntitlements } from './policy';

type App = OpenAPIHono<AppEnv>;

export function registerEntitlements(app: App, g: Guards): void {
  const route = defineRoute({
    method: 'get', path: '/entitlements', summary: 'What this viewer gets: tier, features, limits, ad eligibility', tags: ['billing'],
    description: 'Signed out: the free tier with nothing used. Fails closed to FREE if billing data cannot be read.',
    access: 'optional', cache: 'PRIVATE', data: EntitlementsSchema,
  })(g);
  app.openapi(route, async (c: Ctx) => {
    const d = billingDeps(c);
    const user = c.get('user');
    const now = d.clock();
    let until: Date | null = null;
    let used = 0;
    let rewarded = 0;
    if (user) {
      try {
        await d.db.withService(async (tx) => {
          until = await plusUntil(tx, user.id);
          const { period } = await quotaPeriod(tx, now);
          const r = await tx.query<{ n: number }>(
            `select count(*)::int as n from public.billing_full_paper_usage where user_id=$1 and period=$2::date`,
            [user.id, period],
          );
          used = Number(r.rows[0]?.n ?? 0);
          rewarded = await rewardedFullPapers(tx, user.id, period);
        });
      } catch (e) {
        d.logger.warn('entitlements: billing read failed, serving FREE', { error: e instanceof Error ? e.message : String(e) });
        until = null;
      }
    }
    const u = until as Date | null;
    const tier = u && u > now ? 'PLUS' : 'FREE';
    return send(c, 200, buildEntitlements({ tier, plusUntil: u, config: d.config, fullPapersUsed: used, fullPapersRewarded: rewarded }));
  });
}

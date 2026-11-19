import { OpenAPIHono } from '@hono/zod-openapi';
import { RewardClaimBody, RewardClaimResultSchema, RewardCodeParam, RewardOffersSchema, RewardStartSchema } from '@projectx/contracts';
import { deps, requireUser, send, valid, type AppEnv, type Ctx } from '../lib/http';
import { defineRoute, type Guards } from '../routes/define';
import * as rewards from './service';

type App = OpenAPIHono<AppEnv>;
const rdeps = (c: Ctx): rewards.RewardDeps => {
  const d = deps(c);
  return { db: d.db, config: d.config, clock: d.clock, logger: d.logger };
};

export function registerRewards(app: App, g: Guards): void {
  const offers = defineRoute({
    method: 'get', path: '/rewards/offers', summary: 'Optional rewarded-ad offers and whether each is available now', tags: ['rewards'],
    access: 'user', cache: 'PRIVATE', data: RewardOffersSchema,
  })(g);
  app.openapi(offers, async (c: Ctx) => send(c, 200, await rewards.listOffers(rdeps(c), requireUser(c).id)));

  const start = defineRoute({
    method: 'post', path: '/rewards/offers/{code}/start', summary: 'The student chose to watch: issue a single-use nonce', tags: ['rewards'],
    access: 'user', cache: 'PRIVATE', rl: 'RL_WRITE', request: { params: RewardCodeParam }, status: 201, data: RewardStartSchema,
  })(g);
  app.openapi(start, async (c: Ctx) => send(c, 201, await rewards.startOffer(rdeps(c), requireUser(c).id, valid(c, 'param', RewardCodeParam).code)));

  const claim = defineRoute({
    method: 'post', path: '/rewards/claim', summary: 'Report the rewarded ad outcome; grants only on GRANTED within the rules', tags: ['rewards'],
    description: 'outcome GRANTED only after GPT rewardedSlotGranted. CLOSED / NO_FILL / ERROR record that no reward was earned.',
    access: 'user', cache: 'PRIVATE', rl: 'RL_WRITE',
    request: { body: { content: { 'application/json': { schema: RewardClaimBody } }, required: true } },
    data: RewardClaimResultSchema,
  })(g);
  app.openapi(claim, async (c: Ctx) => send(c, 200, await rewards.claim(rdeps(c), requireUser(c).id, valid(c, 'json', RewardClaimBody))));
}

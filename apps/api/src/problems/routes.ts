import { OpenAPIHono } from '@hono/zod-openapi';
import {
  DailyProblemSchema,
  PracticeQuestionSchema,
  ProblemDetailSchema,
  ProblemListQuery,
  ProblemListSchema,
  ProblemNumberParam,
  ProblemSummarySchema,
} from '@projectx/contracts';
import { z } from '@hono/zod-openapi';
import { ApiError } from '../lib/errors';
import { deps, requireUser, send, store, valid, type AppEnv, type Ctx } from '../lib/http';
import { defineRoute, type Guards } from '../routes/define';
import { buildPracticeQuestions } from '../services/practice';
import { viewerPlus } from './access';
import * as problems from './service';

type App = OpenAPIHono<AppEnv>;
const ExamQuery = z.object({ exam: z.string().default('jee-main') });

/**
 * LeetCode-style problem set (see packages/contracts/src/dto/problems.ts for the premium rules).
 * Signed-out responses are publicly cacheable; anything with a viewer is private.
 */
export function registerProblems(app: App, g: Guards): void {
  const list = defineRoute({
    method: 'get', path: '/problems', summary: 'Problem set: numbered problems with difficulty, acceptance and your status', tags: ['problems'],
    access: 'optional', cache: 'PUBLIC_LIST', rl: 'RL_PUBLIC', request: { query: ProblemListQuery }, data: ProblemListSchema,
  })(g);
  app.openapi(list, async (c: Ctx) => {
    const user = c.get('user');
    const q = valid(c, 'query', ProblemListQuery);
    const plus = await viewerPlus(c, user?.id);
    const data = await problems.listProblems(deps(c).db, user?.id ?? null, plus, q);
    return user ? send(c, 200, data) : send(c, 200, data, { cache: 'PUBLIC_LIST', tags: ['problems'] });
  });

  const sum = defineRoute({
    method: 'get', path: '/problems/summary', summary: 'Problem counts by difficulty and (signed in) how many you have solved', tags: ['problems'],
    access: 'optional', cache: 'PUBLIC_LIST', rl: 'RL_PUBLIC', request: { query: ExamQuery }, data: ProblemSummarySchema,
  })(g);
  app.openapi(sum, async (c: Ctx) => {
    const user = c.get('user');
    const { exam } = valid(c, 'query', ExamQuery);
    const plus = await viewerPlus(c, user?.id);
    const data = await problems.summary(deps(c).db, user?.id ?? null, plus, exam, deps(c).config.FREE_VARIANTS_PER_PROBLEM);
    return user ? send(c, 200, data) : send(c, 200, data, { cache: 'PUBLIC_LIST', tags: ['problems'] });
  });

  const daily = defineRoute({
    method: 'get', path: '/problems/daily', summary: 'Problem of the day (same for everyone, changes at midnight IST)', tags: ['problems'],
    access: 'public', cache: 'PUBLIC_LIST', rl: 'RL_PUBLIC', request: { query: ExamQuery }, data: DailyProblemSchema,
  })(g);
  app.openapi(daily, async (c: Ctx) => {
    const { exam } = valid(c, 'query', ExamQuery);
    const d = await problems.dailyProblem(deps(c).db, exam, deps(c).clock());
    if (!d) throw new ApiError('NOT_FOUND', 'No problems yet');
    return send(c, 200, d, { cache: 'PUBLIC_LIST', tags: ['problems'] });
  });

  const detail = defineRoute({
    method: 'get', path: '/problems/{number}', summary: 'One problem: stats, your progress and free variants left', tags: ['problems'],
    access: 'optional', cache: 'PRIVATE', rl: 'RL_PUBLIC', request: { params: ProblemNumberParam }, data: ProblemDetailSchema,
  })(g);
  app.openapi(detail, async (c: Ctx) => {
    const user = c.get('user');
    const { number } = valid(c, 'param', ProblemNumberParam);
    const plus = await viewerPlus(c, user?.id);
    return send(c, 200, await problems.getProblem(deps(c).db, user?.id ?? null, plus, number, deps(c).config.FREE_VARIANTS_PER_PROBLEM));
  });

  const next = defineRoute({
    method: 'get', path: '/problems/{number}/next', summary: 'Serve a variant of this problem to solve (no answer included)', tags: ['problems'],
    description:
      'Prefers a variant you have not tried, then one you have not got right. Free users get FREE_VARIANTS_PER_PROBLEM distinct variants, ' +
      'then re-practise those; Plus is unlimited. Submit with POST /practice/attempts. Premium problems: 403 PREMIUM_REQUIRED.',
    access: 'user', cache: 'PRIVATE', rl: 'RL_PUBLIC', request: { params: ProblemNumberParam }, data: PracticeQuestionSchema,
  })(g);
  app.openapi(next, async (c: Ctx) => {
    const user = requireUser(c);
    const { number } = valid(c, 'param', ProblemNumberParam);
    const plus = await viewerPlus(c, user.id);
    const id = await problems.nextVariantId(deps(c).db, user.id, plus, number, deps(c).config.FREE_VARIANTS_PER_PROBLEM);
    const dto = await store(c).service(async (r) => (await buildPracticeQuestions(r, deps(c), await r.content.summaries([id])))[0]);
    if (!dto) throw new ApiError('NOT_FOUND', 'Problem not found');
    return send(c, 200, dto);
  });
}

import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  CreateDiagnosticBody,
  CreatePlanBody,
  DiagnosticCreatedSchema,
  DiagnosticReportSchema,
  PlanItemParam,
  PlanItemStartedSchema,
  StudyPlanSchema,
} from '@projectx/contracts';
import { deps, requireUser, send, store, valid, type AppEnv, type Ctx } from '../lib/http';
import { premiumRequired, viewerPlus } from '../problems/access';
import { defineRoute, type Guards } from '../routes/define';
import * as plans from './service';

type App = OpenAPIHono<AppEnv>;
const SessionParam = z.object({ id: z.uuid() });
const ExamQuery = z.object({ exam: z.string().default('jee-main') });

/**
 * Diagnostic + study plans (packages/contracts/src/dto/plans.ts has the access rules). The diagnostic and its summary are free;
 * the full report, plans and plan items are Tabby Plus, enforced here.
 */
export function registerPlans(app: App, g: Guards): void {
  const diag = defineRoute({
    method: 'post', path: '/plans/diagnostic', summary: 'Start (or replay) a diagnostic: mixed difficulty, spread across chapters', tags: ['plans'],
    access: 'user', cache: 'PRIVATE', rl: 'RL_WRITE',
    request: { body: { content: { 'application/json': { schema: CreateDiagnosticBody } }, required: true } },
    status: 201, replay200: true, data: DiagnosticCreatedSchema,
  })(g);
  app.openapi(diag, async (c: Ctx) => {
    const user = requireUser(c);
    const body = valid(c, 'json', CreateDiagnosticBody);
    const plus = await viewerPlus(c, user.id);
    const r = await plans.createDiagnostic(deps(c).db, store(c), deps(c), user, plus, body);
    return send(c, r.created ? 201 : 200, r.data, r.created ? {} : { meta: { replayed: true } });
  });

  const rep = defineRoute({
    method: 'get', path: '/plans/diagnostic/{id}/report', summary: 'Diagnostic report: per-subject summary and focus chapters (full breakdown on Plus)', tags: ['plans'],
    access: 'user', cache: 'PRIVATE', request: { params: SessionParam }, data: DiagnosticReportSchema,
  })(g);
  app.openapi(rep, async (c: Ctx) => {
    const user = requireUser(c);
    const { id } = valid(c, 'param', SessionParam);
    const plus = await viewerPlus(c, user.id);
    return send(c, 200, await plans.report(deps(c).db, store(c), deps(c), user.id, plus, id));
  });

  const create = defineRoute({
    method: 'post', path: '/plans', summary: 'Build a study plan from a submitted diagnostic (Plus)', tags: ['plans'],
    description: 'Archives any active plan for the same exam. 403 PREMIUM_REQUIRED without Plus.',
    access: 'user', cache: 'PRIVATE', rl: 'RL_WRITE',
    request: { body: { content: { 'application/json': { schema: CreatePlanBody } }, required: true } },
    status: 201, replay200: true, data: StudyPlanSchema,
  })(g);
  app.openapi(create, async (c: Ctx) => {
    const user = requireUser(c);
    const body = valid(c, 'json', CreatePlanBody);
    if (!(await viewerPlus(c, user.id))) throw premiumRequired('Study plans are part of Tabby Plus');
    const r = await plans.createPlan(deps(c).db, store(c), deps(c), user.id, body);
    return send(c, r.created ? 201 : 200, r.data, r.created ? {} : { meta: { replayed: true } });
  });

  const current = defineRoute({
    method: 'get', path: '/plans/current', summary: 'My active plan, re-planned for today', tags: ['plans'],
    description: 'Days before today and started items are kept; the rest is regenerated from your answers since. Without Plus the plan is returned read-only (locked).',
    access: 'user', cache: 'PRIVATE', request: { query: ExamQuery }, data: StudyPlanSchema,
  })(g);
  app.openapi(current, async (c: Ctx) => {
    const user = requireUser(c);
    const { exam } = valid(c, 'query', ExamQuery);
    const plus = await viewerPlus(c, user.id);
    return send(c, 200, await plans.currentPlan(deps(c).db, deps(c), user.id, plus, exam));
  });

  const start = defineRoute({
    method: 'post', path: '/plans/{id}/items/{key}/start', summary: 'Start a plan item (creates or reuses its practice session) (Plus)', tags: ['plans'],
    access: 'user', cache: 'PRIVATE', rl: 'RL_WRITE', request: { params: PlanItemParam }, data: PlanItemStartedSchema,
  })(g);
  app.openapi(start, async (c: Ctx) => {
    const user = requireUser(c);
    const { id, key } = valid(c, 'param', PlanItemParam);
    if (!(await viewerPlus(c, user.id))) throw premiumRequired('Study plans are part of Tabby Plus');
    return send(c, 200, await plans.startItem(deps(c).db, store(c), deps(c), user, id, key));
  });
}

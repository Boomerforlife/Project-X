import { OpenAPIHono } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import type { AppDeps } from './deps';
import type { AppEnv } from './lib/http';
import { corsMiddleware, errorResponse, onError, onNotFound, requestContext } from './middleware/core';
import { createRoleResolver } from './middleware/guards';
import { createSqlStore } from './repositories/sql/store';
import { registerAnalytics } from './analytics/routes';
import { registerBilling } from './billing/routes';
import { registerClassify } from './classify/routes';
import { registerEntitlements } from './entitlements/routes';
import { registerRewards } from './rewards/routes';
import { registerPlans } from './plans/routes';
import { registerProblems } from './problems/routes';
import { registerAdminRoutes } from './routes/admin/index';
import { registerPublic, registerSystem } from './routes/public';
import { registerPractice, registerStudent } from './routes/student';

/** Largest JSON body any route accepts (admin content edits are the biggest, well under this). */
export const JSON_BODY_LIMIT = 1024 * 1024;

export function createApp(deps: AppDeps): OpenAPIHono<AppEnv> {
  const store = deps.store ?? createSqlStore(deps.db);
  const root = new OpenAPIHono<AppEnv>();
  root.use('*', requestContext(deps, store));
  root.use('*', corsMiddleware(deps));
  // Global request-body cap for JSON routes (Cloud Run alone allows 32 MB). /uploads streams raw images with its own
  // 5 MiB check and the Razorpay webhook caps itself at 256 KB, both below or outside this limit.
  const capped = bodyLimit({ maxSize: JSON_BODY_LIMIT, onError: (c) => errorResponse(c as never, 'PAYLOAD_TOO_LARGE', 413, 'Request body too large') });
  root.use('/api/v1/*', (c, next) => (c.req.path === '/api/v1/uploads' ? next() : capped(c, next)));

  const v1 = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (result.success) return undefined;
      const issues = result.error.issues.map((i) => ({
        path: [result.target === 'json' ? 'body' : result.target, ...i.path.map(String)].join('.'),
        message: i.message,
      }));
      return errorResponse(c, 'VALIDATION_ERROR', 400, 'Request validation failed', issues);
    },
  });
  v1.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
  v1.onError(onError);

  const guards = { resolveRoles: createRoleResolver(store, deps.clock) };
  let doc: unknown;
  const getDoc = () =>
    (doc ??= v1.getOpenAPI31Document({
      openapi: '3.1.0',
      info: {
        title: 'ProjectX API',
        version: deps.config.API_VERSION,
        description: 'JEE/NEET question bank and practice API. Envelope: { data, meta? } | { error }. See docs/API_CONTRACTS.md.',
      },
      servers: [{ url: '/api/v1' }],
    }));
  registerSystem(v1, guards, getDoc);
  registerPublic(v1, guards);
  registerPractice(v1, guards);
  registerStudent(v1, guards);
  registerAdminRoutes(v1, guards);
  registerBilling(v1, guards);
  registerAnalytics(v1, guards);
  registerProblems(v1, guards);
  registerPlans(v1, guards);
  registerEntitlements(v1, guards);
  registerRewards(v1, guards);
  registerClassify(v1, guards);

  root.route('/api/v1', v1);
  root.onError(onError);
  root.notFound(onNotFound);
  return root;
}

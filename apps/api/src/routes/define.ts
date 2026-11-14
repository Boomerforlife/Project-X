import { createRoute, z } from '@hono/zod-openapi';
import type { RouteConfig } from '@hono/zod-openapi';
import { ErrorEnvelopeSchema, envelope } from '@projectx/contracts';
import type { CacheClass, RateLimitClass } from '@projectx/edge';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../lib/http';
import { authGuard, rateLimit, type Access, type RoleResolver } from '../middleware/guards';

export interface Guards {
  resolveRoles: RoleResolver;
}

interface DefineOpts<Req> {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  access: Access;
  /** Documented cache class (`PRIVATE` for authed / non-GET). */
  cache: CacheClass;
  rl?: RateLimitClass | null;
  request?: Req;
  /** Response data schema (wrapped in the envelope); null for 204 */
  data: z.ZodType | null;
  status?: 200 | 201 | 202 | 204;
  /** Also document a 200 replay for idempotent POSTs. */
  replay200?: boolean;
}

const ERROR_RESPONSES = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN / ACCOUNT_REQUIRED',
  404: 'NOT_FOUND',
  409: 'CONFLICT / IDEMPOTENCY_CONFLICT / VERSION_CONFLICT / ALREADY_ATTEMPTED / INVALID_STATE_TRANSITION',
  429: 'RATE_LIMITED',
  500: 'INTERNAL',
} as const;

/**
 * Build a `createRoute` config with the standard envelope, security scheme, error responses and guard middleware.
 * Returned factory takes the app-scoped `Guards` (role resolver) so route modules stay pure.
 */
export function defineRoute<Req extends RouteConfig['request']>(o: DefineOpts<Req>) {
  const status = o.status ?? 200;
  return (g: Guards) => {
    const middleware: MiddlewareHandler<AppEnv>[] = [authGuard(o.access, g.resolveRoles)];
    if (o.rl) middleware.push(rateLimit(o.rl));
    const responses: RouteConfig['responses'] = {};
    if (status === 204 || o.data === null) {
      responses[204] = { description: 'No content' };
    } else {
      responses[status] = {
        description: `Success (cache: ${o.cache})`,
        content: { 'application/json': { schema: envelope(o.data) } },
      };
      if (o.replay200 && status !== 200) {
        responses[200] = {
          description: 'Idempotent replay (meta.replayed = true)',
          content: { 'application/json': { schema: envelope(o.data) } },
        };
      }
    }
    for (const [code, description] of Object.entries(ERROR_RESPONSES)) {
      if (o.access === 'public' && (code === '401' || code === '403') ) continue;
      responses[Number(code) as 400] = {
        description,
        content: { 'application/json': { schema: ErrorEnvelopeSchema } },
      };
    }
    return createRoute({
      method: o.method,
      path: o.path,
      summary: o.summary,
      ...(o.description ? { description: o.description } : {}),
      tags: o.tags,
      ...(o.request ? { request: o.request } : {}),
      ...(o.access !== 'public' ? { security: [{ Bearer: [] }] } : {}),
      middleware,
      responses,
    });
  };
}

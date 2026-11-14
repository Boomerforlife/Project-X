import type { ErrorHandler, MiddlewareHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { cors } from 'hono/cors';
import { applyCacheHeaders, hashIp } from '@projectx/edge';
import type { ErrorEnvelope } from '@projectx/contracts';
import { requireSecret } from '../config';
import type { AppDeps } from '../deps';
import { ApiError, mapDbError } from '../lib/errors';
import type { AppEnv, Ctx } from '../lib/http';
import type { Store } from '../repositories/types';

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/** Outermost: request id, deps/store injection, ip hash, security headers, default PRIVATE cache. */
export function requestContext(deps: AppDeps, store: Store): MiddlewareHandler<AppEnv> {
  const ipSecret = requireSecret(deps.config, 'IP_HASH_SECRET');
  return async (c, next) => {
    const incoming = c.req.header('X-Request-Id');
    const requestId = incoming && REQUEST_ID_RE.test(incoming) ? incoming : crypto.randomUUID();
    c.set('requestId', requestId);
    c.set('deps', deps);
    c.set('store', store);
    c.set('user', null);
    c.set('roles', []);
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    c.set('ipHash', await hashIp(ip, ipSecret));
    await next();
    const h = c.res.headers;
    h.set('X-Request-Id', requestId);
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'no-referrer');
    h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (!h.has('Cache-Control')) applyCacheHeaders(h, 'PRIVATE');
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') applyCacheHeaders(h, 'PRIVATE');
  };
}

export function corsMiddleware(deps: AppDeps): MiddlewareHandler {
  const allowed = new Set(deps.config.corsOrigins);
  return cors({
    origin: (origin) => (allowed.has(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Upload-Purpose'],
    exposeHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
    credentials: false,
  });
}

export function errorResponse(
  c: Ctx,
  code: ErrorEnvelope['error']['code'],
  status: number,
  message: string,
  details?: unknown,
  extra?: { headers?: Record<string, string>; cache?: ApiError['cache'] },
): Response {
  const body: ErrorEnvelope = {
    error: { code, message, request_id: c.get('requestId') ?? 'unknown', ...(details !== undefined ? { details } : {}) },
  };
  const res = c.json(body, status as 400);
  if (extra?.cache) applyCacheHeaders(res.headers, extra.cache.cls, extra.cache.tags);
  else applyCacheHeaders(res.headers, 'PRIVATE');
  if (extra?.headers) for (const [k, v] of Object.entries(extra.headers)) res.headers.set(k, v);
  return res;
}

export const onError: ErrorHandler<AppEnv> = (err, c) => {
  const log = c.get('deps')?.logger;
  if (err instanceof ApiError) {
    return errorResponse(c, err.code, err.status, err.message, err.details, { headers: err.headers, cache: err.cache });
  }
  if (err instanceof HTTPException) {
    if (err.status === 400) return errorResponse(c, 'VALIDATION_ERROR', 400, 'Malformed request');
    if (err.status === 413) return errorResponse(c, 'PAYLOAD_TOO_LARGE', 413, 'Payload too large');
    if (err.status === 415) return errorResponse(c, 'UNSUPPORTED_MEDIA_TYPE', 415, 'Unsupported media type');
    if (err.status === 401) return errorResponse(c, 'UNAUTHENTICATED', 401, 'Authentication required');
    if (err.status === 403) return errorResponse(c, 'FORBIDDEN', 403, 'Forbidden');
    if (err.status === 404) return errorResponse(c, 'NOT_FOUND', 404, 'Not found');
  }
  const mapped = mapDbError(err);
  if (mapped) {
    log?.warn('db error mapped', { request_id: c.get('requestId'), code: mapped.code, db: (err as Error).message });
    return errorResponse(c, mapped.code, mapped.status, mapped.message, mapped.details);
  }
  log?.error('unhandled error', {
    request_id: c.get('requestId'),
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return errorResponse(c, 'INTERNAL', 500, 'Internal server error');
};

export const onNotFound: NotFoundHandler<AppEnv> = (c) => errorResponse(c, 'NOT_FOUND', 404, 'Route not found');

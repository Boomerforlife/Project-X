import type { Context } from 'hono';
import type { z } from '@hono/zod-openapi';
import { applyCacheHeaders, type CacheClass } from '@projectx/edge';
import { decodeCursor, encodeCursor } from '@projectx/shared';
import type { AppRole, Meta } from '@projectx/contracts';
import type { AppDeps, AuthUser } from '../deps';
import type { PageCursor, Keyed, Store } from '../repositories/types';
import { validation } from './errors';

export interface AppVars {
  requestId: string;
  deps: AppDeps;
  store: Store;
  user: AuthUser | null;
  roles: AppRole[];
  /** Hashed client IP (rate limiting, doubts). */
  ipHash: string;
}
export type AppEnv = { Variables: AppVars };

// reason: handlers are typed against route definitions; responses are built from contract-typed mappers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ctx = Context<AppEnv, any, any>;

export function deps(c: Ctx): AppDeps {
  return c.get('deps');
}
export function store(c: Ctx): Store {
  return c.get('store');
}
export function requireUser(c: Ctx): AuthUser {
  const u = c.get('user');
  if (!u) throw new Error('requireUser called on a route without user auth');
  return u;
}

/**
 * Send `{ data, meta? }`. `cache` sets Cache-Control/Cache-Tag for public routes; everything else is PRIVATE by default.
 * Returns `never` so it satisfies any typed route handler return.
 */
export function send(
  c: Ctx,
  status: 200 | 201 | 202,
  data: unknown,
  opts?: { meta?: Meta; cache?: CacheClass; tags?: string[]; headers?: Record<string, string> },
): never {
  const body: { data: unknown; meta?: Meta } = { data };
  if (opts?.meta) body.meta = opts.meta;
  const res = c.json(body, status);
  applyCacheHeaders(res.headers, opts?.cache ?? 'PRIVATE', opts?.tags);
  if (opts?.headers) for (const [k, v] of Object.entries(opts.headers)) res.headers.set(k, v);
  return res as never;
}

export function sendEmpty(c: Ctx, status: 204 = 204): never {
  const res = c.body(null, status);
  applyCacheHeaders(res.headers, 'PRIVATE');
  return res as never;
}

/** Decode an optional cursor query value; invalid -> 400 VALIDATION_ERROR. */
export function parseCursor(cursor: string | undefined): PageCursor | null {
  if (!cursor) return null;
  const r = decodeCursor(cursor);
  if (!r.ok) throw validation('Invalid cursor', [{ path: 'cursor', message: 'invalid cursor' }]);
  return r.value;
}

/** Turn `limit + 1` keyed rows into a page and next cursor. */
export function paginate<T>(rows: Keyed<T>[], limit: number): { rows: Keyed<T>[]; meta: Meta } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    rows: page,
    meta: { page: { next_cursor: hasMore && last ? encodeCursor({ k: last._k, id: last._id }) : null, limit } },
  };
}

export const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
export const isoOrNull = (d: Date | string | null): string | null => (d === null ? null : iso(d));

/** Typed access to validated request input (the route's zod schema has already run). */
export function valid<S extends z.ZodType>(c: Ctx, target: 'query' | 'param' | 'json' | 'header', _schema: S): z.output<S> {
  // reason: zod-openapi's typed `valid` is lost through the generic route factory; the schema parameter fixes the type
  return (c.req as unknown as { valid(t: string): unknown }).valid(target) as z.output<S>;
}

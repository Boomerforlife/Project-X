import type { MiddlewareHandler } from 'hono';
import type { AppRole } from '@projectx/contracts';
import type { RateLimitClass } from '@projectx/edge';
import { ApiError } from '../lib/errors';
import type { AppEnv } from '../lib/http';
import type { Store } from '../repositories/types';

export type Access = 'public' | 'optional' | 'user' | 'reviewer' | 'admin';

/** Per-isolate role cache (<= 60 s). One instance per app so tests are isolated. */
export function createRoleResolver(store: Store, clock: () => Date, ttlMs = 60_000) {
  const cache = new Map<string, { roles: AppRole[]; at: number }>();
  return async (userId: string): Promise<AppRole[]> => {
    const now = clock().getTime();
    const hit = cache.get(userId);
    if (hit && now - hit.at < ttlMs) return hit.roles;
    const roles = await store.service((r) => r.students.rolesFor(userId));
    cache.set(userId, { roles, at: now });
    if (cache.size > 5000) cache.clear();
    return roles;
  };
}
export type RoleResolver = ReturnType<typeof createRoleResolver>;

/** Authentication by access level. `public` never reads the token (so output cannot vary by it). */
export function authGuard(access: Access, resolveRoles: RoleResolver): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (access === 'public') return next();
    const deps = c.get('deps');
    const header = c.req.header('Authorization');
    const token = header && /^Bearer\s+(\S+)$/i.exec(header)?.[1];
    if (!token) {
      if (access === 'optional') return next();
      throw new ApiError('UNAUTHENTICATED', 'Missing bearer token', { headers: { 'WWW-Authenticate': 'Bearer' } });
    }
    const user = await deps.auth.verify(token);
    if (!user) {
      if (access === 'optional') return next();
      throw new ApiError('UNAUTHENTICATED', 'Invalid or expired token', { headers: { 'WWW-Authenticate': 'Bearer' } });
    }
    c.set('user', user);
    if (access === 'user' || access === 'reviewer' || access === 'admin') {
      if (user.isAnonymous) throw new ApiError('ACCOUNT_REQUIRED', 'A full account is required');
    }
    if (access === 'reviewer' || access === 'admin') {
      const roles = await resolveRoles(user.id);
      c.set('roles', roles);
      const ok = access === 'admin' ? roles.includes('ADMIN') : roles.includes('ADMIN') || roles.includes('REVIEWER');
      if (!ok) throw new ApiError('FORBIDDEN', 'Insufficient role');
    }
    return next();
  };
}

/** Rate limit by class; key = user id when authenticated else hashed IP. */
export function rateLimit(cls: RateLimitClass): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const deps = c.get('deps');
    const who = c.get('user')?.id ?? c.get('ipHash');
    const r = await deps.rateLimiter.limit(cls, who);
    if (!r.success) {
      throw new ApiError('RATE_LIMITED', 'Too many requests', { headers: { 'Retry-After': String(Math.max(1, r.retryAfterSec)) } });
    }
    return next();
  };
}

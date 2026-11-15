import type { Db } from '@projectx/db';
import { rateLimitDefaults, type RateLimitClass, type RateLimiter } from '@projectx/edge';

/** Classes whose limits must hold across all server copies (writes, attempts, doubts, admin; later: payments). */
export const SHARED_RATE_LIMIT_CLASSES: readonly RateLimitClass[] = ['RL_WRITE', 'RL_ATTEMPTS', 'RL_DOUBTS', 'RL_ADMIN'];

/**
 * Shared fixed-window limiter backed by Postgres (migration 0017). For `shared` classes every instance counts
 * against the same row; other classes use `fallback` (in-memory, per instance) to avoid a DB hit per public read.
 * Fails open (allows the request) if the database call errors, so a DB blip can't take the API down.
 */
export function createPostgresRateLimiter(
  db: Db,
  fallback: RateLimiter,
  opts: { shared?: readonly RateLimitClass[]; onError?: (err: unknown) => void } = {},
): RateLimiter {
  const shared = new Set(opts.shared ?? SHARED_RATE_LIMIT_CLASSES);
  return {
    async limit(cls, key) {
      if (!shared.has(cls)) return fallback.limit(cls, key);
      const cfg = rateLimitDefaults[cls];
      try {
        const { rows } = await db.withService((tx) =>
          tx.query<{ hits: number; retry_after_sec: number }>(
            'select hits, retry_after_sec from app_private.rate_limit_hit($1, $2)',
            [`${cls}:${key}`, cfg.periodSec],
          ),
        );
        const r = rows[0];
        if (!r) return { success: true, retryAfterSec: 0 };
        const hits = Number(r.hits);
        return hits <= cfg.limit ? { success: true, retryAfterSec: 0 } : { success: false, retryAfterSec: Number(r.retry_after_sec) };
      } catch (err) {
        opts.onError?.(err);
        return { success: true, retryAfterSec: 0 };
      }
    },
  };
}

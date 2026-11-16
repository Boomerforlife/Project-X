import type { Db } from '@projectx/db';
import type { AuthVerifier } from '../deps';

/**
 * Makes logout take effect on the API. A Supabase access token stays cryptographically valid until it expires (about an
 * hour), even after the user logs out, because logout only deletes the session. This wrapper also requires the token's
 * `session_id` to still exist in `auth.sessions` (and not be past `not_after`).
 *
 * Cost: one indexed lookup per session per `ttlMs` (results are cached per instance), so logout is honoured within ttlMs.
 * Fails closed: a token without session_id, or a lookup error, is treated as signed out (401).
 */
export function createSessionCheckingVerifier(
  inner: AuthVerifier,
  db: Db,
  opts: { ttlMs?: number; now?: () => number; maxEntries?: number } = {},
): AuthVerifier {
  const ttl = opts.ttlMs ?? 30_000;
  const now = opts.now ?? Date.now;
  const max = opts.maxEntries ?? 10_000;
  const cache = new Map<string, { ok: boolean; at: number }>();

  async function sessionAlive(sessionId: string, userId: string): Promise<boolean> {
    const hit = cache.get(sessionId);
    if (hit && now() - hit.at < ttl) return hit.ok;
    let ok = false;
    try {
      const r = await db.withService((tx) =>
        tx.query<{ ok: number }>(
          `select 1 as ok from auth.sessions
            where id = $1 and user_id = $2 and (not_after is null or not_after > now())`,
          [sessionId, userId],
        ),
      );
      ok = r.rows.length > 0;
    } catch {
      return false; // don't cache errors
    }
    if (cache.size >= max) cache.clear();
    cache.set(sessionId, { ok, at: now() });
    return ok;
  }

  return {
    async verify(token) {
      const user = await inner.verify(token);
      if (!user) return null;
      const sid = (user.claims as Record<string, unknown>)['session_id'];
      if (typeof sid !== 'string' || sid.length === 0) return null;
      return (await sessionAlive(sid, user.id)) ? user : null;
    },
  };
}

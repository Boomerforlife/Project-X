import type { MiddlewareHandler } from 'hono';

/**
 * Cache API fallback (CACHE_MODE=cache_api) for when Workers Caching is unavailable.
 * Only GET without Authorization; stores 200s whose Cache-Control is public with s-maxage.
 * Purge by tag is NOT available through the Cache API: with this mode rely on short s-maxage or the zone API invalidator.
 */
export function edgeCacheMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const cacheStore = (globalThis as unknown as { caches?: { default?: CacheLike } }).caches?.default;
    const req = c.req.raw;
    if (!cacheStore || req.method !== 'GET' || req.headers.has('Authorization')) {
      await next();
      return;
    }
    const key = new Request(req.url, { method: 'GET' });
    const hit = await cacheStore.match(key);
    if (hit) {
      const res = new Response(hit.body, hit);
      res.headers.set('X-Edge-Cache', 'HIT');
      c.res = res;
      return;
    }
    await next();
    const res = c.res;
    const cc = res.headers.get('Cache-Control') ?? '';
    if (res.status === 200 && /(^|,\s*)public\b/.test(cc) && /s-maxage=\d+/.test(cc) && !res.headers.has('Set-Cookie')) {
      const put = cacheStore.put(key, res.clone());
      try {
        c.executionCtx.waitUntil(put);
      } catch {
        await put; // no ExecutionContext (tests / node)
      }
      res.headers.set('X-Edge-Cache', 'MISS');
    }
  };
}

interface CacheLike {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
}

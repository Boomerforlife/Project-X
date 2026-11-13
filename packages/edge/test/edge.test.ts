import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterAll, describe, expect, it } from 'vitest';
import {
  applyCacheHeaders,
  cachePolicies,
  cacheTags,
  copyObject,
  createCompositeInvalidator,
  createCloudflareRateLimiter,
  createMemoryRateLimiter,
  createMemoryStorage,
  createNoopInvalidator,
  createNoopRateLimiter,
  createRecordingInvalidator,
  createWorkersCacheInvalidator,
  createZoneApiInvalidator,
  edgeCacheMiddleware,
  hashIp,
  r2Keys,
  signFileUrl,
  sniffImageMime,
  verifyFileToken,
  type CacheClass,
} from '../src/index';
import { createLocalStorage } from '../src/node';

const text = (s: string): Uint8Array => new TextEncoder().encode(s);
async function readAll(s: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(s).text();
}

describe('cache policies', () => {
  const expected: Record<CacheClass, string> = {
    TAXONOMY: 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400',
    PUBLIC_CONTENT: 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400',
    PUBLIC_LIST: 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    PUBLIC_NOT_FOUND: 'public, max-age=30, s-maxage=300',
    PRIVATE: 'private, no-store',
    NONE: 'no-store',
  };
  it.each(Object.entries(expected))('%s Cache-Control is byte-exact', (cls, value) => {
    expect(cachePolicies[cls as CacheClass].cacheControl).toBe(value);
    const h = new Headers();
    applyCacheHeaders(h, cls as CacheClass, ['a']);
    expect(h.get('Cache-Control')).toBe(value);
  });
  it('adds tags only for cacheable classes', () => {
    const h = new Headers();
    applyCacheHeaders(h, 'PUBLIC_CONTENT', ['q-1', 'tax', 'q-1']);
    expect(h.get('Cache-Tag')).toBe('q-1,tax');
    expect(h.get('X-Cache-Tags')).toBe('q-1,tax');
    for (const cls of ['PRIVATE', 'NONE'] as const) {
      const p = new Headers({ 'Cache-Tag': 'stale' });
      applyCacheHeaders(p, cls, ['q-1']);
      expect(p.has('Cache-Tag')).toBe(false);
      expect(p.has('X-Cache-Tags')).toBe(false);
    }
  });
  it('caps tags at 1000 and drops invalid ones', () => {
    const h = new Headers();
    applyCacheHeaders(h, 'TAXONOMY', [...Array.from({ length: 1200 }, (_, i) => `t${i}`), 'bad tag', 'a,b', 'é']);
    expect(h.get('Cache-Tag')!.split(',')).toHaveLength(1000);
  });
  it('tag builders', () => {
    expect(cacheTags.question('1')).toBe('q-1');
    expect(cacheTags.questionSlug('s')).toBe('qslug-s');
    expect(cacheTags.chapter('c')).toBe('ch-c');
    expect(cacheTags.chapterSlug('c')).toBe('chslug-c');
    expect(cacheTags.subject('s')).toBe('sub-s');
    expect(cacheTags.exam('e')).toBe('exam-e');
    expect([cacheTags.taxonomy, cacheTags.qlist, cacheTags.sitemap, cacheTags.search]).toEqual(['tax', 'qlist', 'sitemap', 'search']);
  });
  it('r2 keys', () => {
    expect(r2Keys.sourceDocument('NTA', 2024, 'abc', 'pdf')).toBe('sources/NTA/2024/abc.pdf');
    expect(r2Keys.derivedCrop('d1', '12', 2)).toBe('derived/d1/crops/q12-2.png');
    expect(r2Keys.publicAsset('abcdef', 'png')).toBe('assets/ab/abcdef.png');
    expect(r2Keys.userUpload('u', '2026-11', 'id', 'webp')).toBe('u/u/2026-11/id.webp');
    expect(r2Keys.backup('2026-11-14')).toBe('backups/2026-11-14/db.sql.gz');
  });
});

describe('signed urls', () => {
  const base = { secret: 's3cret', baseUrl: 'https://api.example.test/api/v1/files', bucket: 'USER_UPLOADS' as const, key: 'u/x/2026-11/a.png' };
  const tokenOf = (url: string): string => url.slice(url.lastIndexOf('/') + 1);
  it('round-trips', async () => {
    const url = await signFileUrl({ ...base, expiresInSec: 900, now: 1_000_000 });
    expect(url.startsWith(`${base.baseUrl}/`)).toBe(true);
    expect(await verifyFileToken({ secret: base.secret, token: tokenOf(url), now: 1_000_000 + 899_000 })).toEqual({ bucket: 'USER_UPLOADS', key: base.key });
  });
  it('expires', async () => {
    const url = await signFileUrl({ ...base, expiresInSec: 60, now: 1_000_000 });
    expect(await verifyFileToken({ secret: base.secret, token: tokenOf(url), now: 1_000_000 + 60_000 })).toBeNull();
  });
  it('rejects tamper and wrong secret', async () => {
    const t = tokenOf(await signFileUrl({ ...base, expiresInSec: 60, now: 1_000_000 }));
    const [p, s] = t.split('.') as [string, string];
    const forged = btoa(JSON.stringify({ b: 'SOURCE_DOCS', k: base.key, e: 9_999_999_999 })).replace(/=+$/, '');
    expect(await verifyFileToken({ secret: base.secret, token: `${forged}.${s}`, now: 1_000_000 })).toBeNull();
    expect(await verifyFileToken({ secret: base.secret, token: `${p}.${s.slice(0, -2)}AA`, now: 1_000_000 })).toBeNull();
    expect(await verifyFileToken({ secret: 'other', token: t, now: 1_000_000 })).toBeNull();
    expect(await verifyFileToken({ secret: base.secret, token: 'garbage', now: 1_000_000 })).toBeNull();
  });
  it('refuses ttl > 900 s', async () => {
    await expect(signFileUrl({ ...base, expiresInSec: 901 })).rejects.toThrow();
    await expect(signFileUrl({ ...base, expiresInSec: 0 })).rejects.toThrow();
  });
});

describe('rate limiters', () => {
  it('memory limiter windows', async () => {
    let t = 1_000_000_000;
    const rl = createMemoryRateLimiter({ RL_DOUBTS: { limit: 2, periodSec: 60 } }, () => t);
    expect((await rl.limit('RL_DOUBTS', 'a')).success).toBe(true);
    expect((await rl.limit('RL_DOUBTS', 'a')).success).toBe(true);
    const denied = await rl.limit('RL_DOUBTS', 'a');
    expect(denied.success).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSec).toBeLessThanOrEqual(60);
    expect((await rl.limit('RL_DOUBTS', 'b')).success).toBe(true); // separate key
    t += 60_000; // next window
    expect((await rl.limit('RL_DOUBTS', 'a')).success).toBe(true);
  });
  it('defaults match contract', async () => {
    const rl = createMemoryRateLimiter();
    for (let i = 0; i < 30; i++) expect((await rl.limit('RL_SEARCH', 'ip')).success).toBe(true);
    expect((await rl.limit('RL_SEARCH', 'ip')).success).toBe(false);
  });
  it('cloudflare adapter and noop', async () => {
    const seen: string[] = [];
    const mk = (ok: boolean) => ({ limit: async (o: { key: string }) => (seen.push(o.key), { success: ok }) });
    const rl = createCloudflareRateLimiter({
      RL_PUBLIC: mk(true), RL_SEARCH: mk(false), RL_WRITE: mk(true), RL_ATTEMPTS: mk(true), RL_DOUBTS: mk(true), RL_ADMIN: mk(true),
    });
    expect(await rl.limit('RL_PUBLIC', 'k')).toEqual({ success: true, retryAfterSec: 0 });
    expect(await rl.limit('RL_SEARCH', 'k')).toEqual({ success: false, retryAfterSec: 60 });
    expect(seen).toEqual(['RL_PUBLIC:k', 'RL_SEARCH:k']);
    expect((await createNoopRateLimiter().limit('RL_ADMIN', 'x')).success).toBe(true);
  });
});

describe('invalidators', () => {
  const mkTags = (n: number): string[] => Array.from({ length: n }, (_, i) => `t${i}`);
  it('zone api chunks at 30', async () => {
    const bodies: string[][] = [];
    const f = (async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.cloudflare.com/client/v4/zones/z1/purge_cache');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      bodies.push((JSON.parse(init.body as string) as { tags: string[] }).tags);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const r = await createZoneApiInvalidator({ zoneId: 'z1', apiToken: 'tok', fetch: f }).purgeTags(mkTags(65));
    expect(bodies.map((b) => b.length)).toEqual([30, 30, 5]);
    expect(r.ok).toBe(true);
    expect(r.purged).toHaveLength(65);
  });
  it('zone api retries 5xx then succeeds; gives up after 3', async () => {
    let n = 0;
    const flaky = (async () => (++n < 3 ? new Response('', { status: 503 }) : new Response('{}', { status: 200 }))) as unknown as typeof fetch;
    const sleeps: number[] = [];
    const sleep = async (ms: number): Promise<void> => void sleeps.push(ms);
    expect((await createZoneApiInvalidator({ zoneId: 'z', apiToken: 't', fetch: flaky, sleep }).purgeTags(['a'])).ok).toBe(true);
    expect(n).toBe(3);
    expect(sleeps).toHaveLength(2);

    let m = 0;
    const down = (async () => (++m, new Response('', { status: 500 }))) as unknown as typeof fetch;
    const r = await createZoneApiInvalidator({ zoneId: 'z', apiToken: 't', fetch: down, sleep }).purgeTags(['a']);
    expect(m).toBe(3);
    expect(r.ok).toBe(false);
    expect(r.purged).toEqual([]);
    expect(r.error).toContain('500');
  });
  it('zone api does not retry 403 and survives thrown fetch', async () => {
    let n = 0;
    const forbidden = (async () => (++n, new Response('', { status: 403 }))) as unknown as typeof fetch;
    expect((await createZoneApiInvalidator({ zoneId: 'z', apiToken: 't', fetch: forbidden }).purgeTags(['a'])).ok).toBe(false);
    expect(n).toBe(1);
    const boom = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    const r = await createZoneApiInvalidator({ zoneId: 'z', apiToken: 't', fetch: boom, sleep: async () => {} }).purgeTags(['a']);
    expect(r).toMatchObject({ ok: false, error: 'net' });
  });
  it('workers, composite, noop, recording', async () => {
    const calls: string[][] = [];
    const w = createWorkersCacheInvalidator({ purge: async (o) => void calls.push(o.tags) });
    const rec = createRecordingInvalidator();
    const c = createCompositeInvalidator([w, rec, createNoopInvalidator()]);
    const r = await c.purgeTags(['a', 'b']);
    expect(r).toEqual({ ok: true, purged: ['a', 'b'] });
    expect(calls).toEqual([['a', 'b']]);
    expect(rec.calls).toEqual([['a', 'b']]);
    const bad = createWorkersCacheInvalidator({ purge: async () => { throw new Error('nope'); } });
    const r2 = await createCompositeInvalidator([bad, rec]).purgeTags(['x']);
    expect(r2.ok).toBe(false);
    expect(r2.error).toBe('nope');
    expect(r2.purged).toEqual(['x']);
  });
});

describe('storage', () => {
  it('memory storage + copyObject idempotency', async () => {
    const a = createMemoryStorage();
    const b = createMemoryStorage();
    await a.put('k', text('hello'), { contentType: 'text/plain' });
    expect(await copyObject(a, 'k', b, 'k2', { cacheControl: 'x' })).toBe('copied');
    expect(await copyObject(a, 'k', b, 'k2')).toBe('exists');
    expect(await b.head('k2')).toEqual({ size: 5, contentType: 'text/plain' });
    expect(await readAll((await b.get('k2'))!.body)).toBe('hello');
    await b.delete('k2');
    expect(await b.get('k2')).toBeNull();
    await expect(copyObject(a, 'missing', b, 'z')).rejects.toThrow();
  });
  describe('local storage', () => {
    const dirs: string[] = [];
    afterAll(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
    it('round-trips and blocks traversal', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'px-edge-'));
      dirs.push(dir);
      const s = createLocalStorage(dir, 'PUBLIC_ASSETS');
      await s.put('assets/ab/abc.png', text('data'), { contentType: 'image/png', cacheControl: 'c' });
      expect(await s.head('assets/ab/abc.png')).toEqual({ size: 4, contentType: 'image/png' });
      const got = await s.get('assets/ab/abc.png');
      expect(got?.contentType).toBe('image/png');
      expect(await readAll(got!.body)).toBe('data');
      expect(await s.get('nope')).toBeNull();
      await expect(s.put('../evil', text('x'), { contentType: 'text/plain' })).rejects.toThrow();
      await expect(s.get('/abs')).rejects.toThrow();
      await s.delete('assets/ab/abc.png');
      expect(await s.head('assets/ab/abc.png')).toBeNull();
    });
  });
});

describe('sniffing and hashing', () => {
  it('sniffs images, rejects svg/others', () => {
    expect(sniffImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageMime(Uint8Array.from([...text('RIFF'), 1, 2, 3, 4, ...text('WEBPVP8 ')]))).toBe('image/webp');
    expect(sniffImageMime(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageMime(text('RIFF....WAVE'))).toBeNull();
    expect(sniffImageMime(new Uint8Array())).toBeNull();
  });
  it('hashIp is deterministic HMAC hex', async () => {
    const a = await hashIp('1.2.3.4', 'k');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIp('1.2.3.4', 'k')).toBe(a);
    expect(await hashIp('1.2.3.4', 'k2')).not.toBe(a);
    expect(await hashIp('1.2.3.5', 'k')).not.toBe(a);
    expect(a).not.toContain('1.2.3.4');
  });
});

describe('edgeCacheMiddleware', () => {
  function fakeCaches(): { store: Map<string, Response>; install(): () => void } {
    const store = new Map<string, Response>();
    const def = {
      match: async (r: Request) => store.get(r.url)?.clone(),
      put: async (r: Request, res: Response) => void store.set(r.url, res),
    };
    return {
      store,
      install() {
        (globalThis as unknown as { caches: unknown }).caches = { default: def };
        return () => { delete (globalThis as unknown as { caches?: unknown }).caches; };
      },
    };
  }
  it('caches public GET without Authorization, skips authed and private', async () => {
    const fc = fakeCaches();
    const restore = fc.install();
    try {
      let hits = 0;
      const app = new Hono();
      app.use('*', edgeCacheMiddleware());
      app.get('/pub', (c) => { hits++; const h = new Headers(); applyCacheHeaders(h, 'PUBLIC_CONTENT'); return new Response('x', { headers: h }); });
      app.get('/priv', (c) => { hits++; const h = new Headers(); applyCacheHeaders(h, 'PRIVATE'); return new Response('x', { headers: h }); });
      expect((await app.request('/pub')).headers.get('X-Edge-Cache')).toBe('MISS');
      const second = await app.request('/pub');
      expect(second.headers.get('X-Edge-Cache')).toBe('HIT');
      expect(await second.text()).toBe('x');
      expect(hits).toBe(1);
      await app.request('/pub', { headers: { Authorization: 'Bearer t' } });
      expect(hits).toBe(2);
      await app.request('/priv'); await app.request('/priv');
      expect(hits).toBe(4);
      expect(fc.store.size).toBe(1);
    } finally { restore(); }
  });
  it('is a passthrough without caches', async () => {
    const app = new Hono();
    app.use('*', edgeCacheMiddleware());
    app.get('/a', (c) => c.text('ok'));
    expect(await (await app.request('/a')).text()).toBe('ok');
  });
});

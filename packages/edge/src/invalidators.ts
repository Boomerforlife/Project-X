export interface PurgeResult {
  ok: boolean;
  purged: string[];
  error?: string;
}
export interface CacheInvalidator {
  purgeTags(tags: string[]): Promise<PurgeResult>;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const uniq = (a: string[]): string[] => [...new Set(a)];

export function createNoopInvalidator(): CacheInvalidator {
  return { purgeTags: async () => ({ ok: true, purged: [] }) };
}

export function createRecordingInvalidator(): CacheInvalidator & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async purgeTags(tags) {
      calls.push([...tags]);
      return { ok: true, purged: [...tags] };
    },
  };
}

/** Workers Caching purge (`cache.purge({tags})` from the Workers runtime). */
const WORKERS_CHUNK = 100;
const WORKERS_ATTEMPTS = 3;
const RATE_LIMIT_RE = /rate.?limit|too many|\b429\b|\b971\b|throttl/i;

/** Inspect a resolved `cache.purge()` result. Returns an error string on failure, null on success. */
function purgeFailure(res: unknown): string | null {
  const r = res as { success?: unknown; errors?: unknown } | null | undefined;
  if (r && typeof r === 'object' && r.success === true) return null;
  const errs = r && typeof r === 'object' && Array.isArray(r.errors) ? r.errors : [];
  const text = errs
    .map((e: unknown) => {
      const x = e as { code?: unknown; message?: unknown } | string;
      return typeof x === 'string' ? x : [x?.code, x?.message].filter((v) => v !== undefined && v !== null).join(' ');
    })
    .filter(Boolean)
    .join('; ');
  if (text) return text;
  return r && typeof r === 'object' && 'success' in r ? 'purge reported success=false' : 'purge returned no success flag';
}

/**
 * Workers Caching purge (`cache.purge({tags})` from the Workers runtime).
 * A rate-limited purge RESOLVES with `{success:false, errors}` rather than throwing, so the result is inspected.
 * Tags are chunked to <=100 per call; rate-limit style failures are retried with bounded backoff.
 */
export function createWorkersCacheInvalidator(
  cache: { purge(o: { tags: string[] }): Promise<unknown> },
  o: { sleep?: (ms: number) => Promise<void>; attempts?: number; baseDelayMs?: number } = {},
): CacheInvalidator {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const attempts = Math.max(1, o.attempts ?? WORKERS_ATTEMPTS);
  const base = o.baseDelayMs ?? 500;

  async function purgeChunk(chunk: string[]): Promise<string | null> {
    let last = 'unknown error';
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const err = purgeFailure(await cache.purge({ tags: chunk }));
        if (err === null) return null;
        last = err;
      } catch (e) {
        last = msg(e);
      }
      if (!RATE_LIMIT_RE.test(last)) return last;
      if (attempt < attempts) await sleep(base * 2 ** (attempt - 1));
    }
    return last;
  }

  return {
    async purgeTags(tags) {
      const t = uniq(tags);
      const purged: string[] = [];
      const errors: string[] = [];
      for (let i = 0; i < t.length; i += WORKERS_CHUNK) {
        const chunk = t.slice(i, i + WORKERS_CHUNK);
        const err = await purgeChunk(chunk);
        if (err === null) purged.push(...chunk);
        else errors.push(err);
      }
      return errors.length === 0 ? { ok: true, purged } : { ok: false, purged, error: [...new Set(errors)].join('; ') };
    },
  };
}

const ZONE_CHUNK = 30;
const ZONE_ATTEMPTS = 3;

/** Cloudflare zone purge API: POST /zones/{id}/purge_cache {tags}; chunks of <=30; 3 attempts per chunk. */
export function createZoneApiInvalidator(o: {
  zoneId: string;
  apiToken: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): CacheInvalidator {
  const doFetch = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const url = `https://api.cloudflare.com/client/v4/zones/${o.zoneId}/purge_cache`;

  async function purgeChunk(chunk: string[]): Promise<string | null> {
    let lastErr = 'unknown error';
    for (let attempt = 1; attempt <= ZONE_ATTEMPTS; attempt++) {
      try {
        const res = await doFetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${o.apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: chunk }),
        });
        if (res.ok) return null;
        lastErr = `HTTP ${res.status}`;
        // client errors other than 429 will not succeed on retry
        if (res.status < 500 && res.status !== 429) return lastErr;
        if (attempt < ZONE_ATTEMPTS) {
          const ra = Number(res.headers.get('Retry-After'));
          await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 200 * 2 ** (attempt - 1));
        }
      } catch (e) {
        lastErr = msg(e);
        if (attempt < ZONE_ATTEMPTS) await sleep(200 * 2 ** (attempt - 1));
      }
    }
    return lastErr;
  }

  return {
    async purgeTags(tags) {
      const t = uniq(tags);
      const purged: string[] = [];
      const errors: string[] = [];
      for (let i = 0; i < t.length; i += ZONE_CHUNK) {
        const chunk = t.slice(i, i + ZONE_CHUNK);
        const err = await purgeChunk(chunk);
        if (err === null) purged.push(...chunk);
        else errors.push(err);
      }
      return errors.length === 0 ? { ok: true, purged } : { ok: false, purged, error: errors.join('; ') };
    },
  };
}

const WEBHOOK_CHUNK = 200;
const WEBHOOK_TIMEOUT_MS = 3000;

/**
 * Web revalidation webhook: POST {url} with `Authorization: Bearer <secret>` and body `{"tags":[...]}`
 * (chunks of <= 200, 3 s timeout each). Never throws; failures are logged and reported in the result.
 */
export function createWebhookInvalidator(o: {
  url: string;
  secret: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (message: string) => void;
}): CacheInvalidator {
  const doFetch = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const log = o.log ?? ((m: string) => console.warn(m));
  const timeoutMs = o.timeoutMs ?? WEBHOOK_TIMEOUT_MS;

  async function post(chunk: string[]): Promise<string | null> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await doFetch(o.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${o.secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: chunk }),
        signal: ctl.signal,
      });
      return res.ok ? null : `HTTP ${res.status}`;
    } catch (e) {
      return msg(e);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async purgeTags(tags) {
      const t = uniq(tags);
      const purged: string[] = [];
      const errors: string[] = [];
      try {
        for (let i = 0; i < t.length; i += WEBHOOK_CHUNK) {
          const chunk = t.slice(i, i + WEBHOOK_CHUNK);
          const err = await post(chunk);
          if (err === null) purged.push(...chunk);
          else errors.push(err);
        }
      } catch (e) {
        errors.push(msg(e));
      }
      if (errors.length === 0) return { ok: true, purged };
      const error = errors.join('; ');
      log(`web revalidation webhook failed: ${error}`);
      return { ok: false, purged, error };
    },
  };
}

export function createCompositeInvalidator(list: CacheInvalidator[]): CacheInvalidator {
  return {
    async purgeTags(tags) {
      const results = await Promise.all(
        list.map((i) => i.purgeTags(tags).catch((e: unknown): PurgeResult => ({ ok: false, purged: [], error: msg(e) }))),
      );
      const errors = results.map((r) => r.error).filter((e): e is string => !!e);
      const out: PurgeResult = { ok: results.every((r) => r.ok), purged: uniq(results.flatMap((r) => r.purged)) };
      if (errors.length) out.error = errors.join('; ');
      return out;
    },
  };
}

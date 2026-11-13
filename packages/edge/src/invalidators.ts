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
export function createWorkersCacheInvalidator(cache: { purge(o: { tags: string[] }): Promise<unknown> }): CacheInvalidator {
  return {
    async purgeTags(tags) {
      const t = uniq(tags);
      if (t.length === 0) return { ok: true, purged: [] };
      try {
        await cache.purge({ tags: t });
        return { ok: true, purged: t };
      } catch (e) {
        return { ok: false, purged: [], error: msg(e) };
      }
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

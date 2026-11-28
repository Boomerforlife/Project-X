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

export type RateLimitClass = 'RL_PUBLIC' | 'RL_SEARCH' | 'RL_WRITE' | 'RL_ATTEMPTS' | 'RL_DOUBTS' | 'RL_ADMIN';

export const rateLimitDefaults: Record<RateLimitClass, { limit: number; periodSec: 60 }> = {
  RL_PUBLIC: { limit: 300, periodSec: 60 },
  RL_SEARCH: { limit: 30, periodSec: 60 },
  RL_WRITE: { limit: 30, periodSec: 60 },
  RL_ATTEMPTS: { limit: 60, periodSec: 60 },
  RL_DOUBTS: { limit: 5, periodSec: 60 },
  RL_ADMIN: { limit: 120, periodSec: 60 },
};

export interface RateLimiter {
  limit(cls: RateLimitClass, key: string): Promise<{ success: boolean; retryAfterSec: number }>;
}

export function createNoopRateLimiter(): RateLimiter {
  return { limit: async () => ({ success: true, retryAfterSec: 0 }) };
}

/** Fixed-window in-memory limiter (dev/tests). */
export function createMemoryRateLimiter(
  limits?: Partial<Record<RateLimitClass, { limit: number; periodSec: 10 | 60 }>>,
  now: () => number = Date.now,
): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    async limit(cls, key) {
      const cfg = limits?.[cls] ?? rateLimitDefaults[cls];
      const periodMs = cfg.periodSec * 1000;
      const t = now();
      const start = Math.floor(t / periodMs) * periodMs;
      const k = `${cls}:${key}`;
      let w = windows.get(k);
      if (!w || w.start !== start) {
        w = { start, count: 0 };
        windows.set(k, w);
        if (windows.size > 10_000) for (const [wk, wv] of windows) if (wv.start !== start) windows.delete(wk);
      }
      w.count += 1;
      if (w.count <= cfg.limit) return { success: true, retryAfterSec: 0 };
      return { success: false, retryAfterSec: Math.max(1, Math.ceil((start + periodMs - t) / 1000)) };
    },
  };
}

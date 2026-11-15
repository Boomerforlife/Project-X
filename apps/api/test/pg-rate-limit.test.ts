import { describe, expect, it } from 'vitest';
import { createTestDb } from '@projectx/db/testing';
import { createMemoryRateLimiter, rateLimitDefaults } from '@projectx/edge';
import { createPostgresRateLimiter } from '../src/lib/pg-rate-limit';

describe('createPostgresRateLimiter', () => {
  it('shares one counter across limiter instances (simulating multiple server copies)', async () => {
    const db = await createTestDb();
    const a = createPostgresRateLimiter(db, createMemoryRateLimiter());
    const b = createPostgresRateLimiter(db, createMemoryRateLimiter());
    const limit = rateLimitDefaults.RL_DOUBTS.limit; // 5/min
    const results: boolean[] = [];
    for (let i = 0; i < limit + 2; i++) results.push((await (i % 2 ? a : b).limit('RL_DOUBTS', 'user-1')).success);
    expect(results.filter(Boolean)).toHaveLength(limit);
    const denied = await a.limit('RL_DOUBTS', 'user-1');
    expect(denied.success).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
    expect((await a.limit('RL_DOUBTS', 'user-2')).success).toBe(true); // other keys unaffected
    await db.close();
  });

  it('uses the in-memory fallback for non-shared classes and fails open on DB errors', async () => {
    let fallbackCalls = 0;
    const fallback = { limit: async () => (fallbackCalls++, { success: true, retryAfterSec: 0 }) };
    const broken = { withService: async () => { throw new Error('db down'); } } as never;
    const errors: unknown[] = [];
    const rl = createPostgresRateLimiter(broken, fallback, { onError: (e) => errors.push(e) });
    expect((await rl.limit('RL_PUBLIC', 'ip')).success).toBe(true);
    expect(fallbackCalls).toBe(1);
    expect((await rl.limit('RL_WRITE', 'ip')).success).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it('is not callable by anon/authenticated roles', async () => {
    const db = await createTestDb();
    await expect(db.withAnon((tx) => tx.query("select * from app_private.rate_limit_hit('x', 60)"))).rejects.toThrow();
    await db.close();
  });
});

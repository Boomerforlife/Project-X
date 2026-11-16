import { describe, expect, it } from 'vitest';
import type { Db } from '@projectx/db';
import { createSessionCheckingVerifier } from '../src/auth/session-check';
import type { AuthUser, AuthVerifier } from '../src/deps';

const user = (sid?: string): AuthUser =>
  ({ id: 'u1', email: null, isAnonymous: false, claims: { sub: 'u1', role: 'authenticated', ...(sid ? { session_id: sid } : {}) } }) as unknown as AuthUser;
const inner = (u: AuthUser | null): AuthVerifier => ({ verify: async () => u });
function fakeDb(live: Set<string>, calls: { n: number }, fail = false): Db {
  return {
    withService: async (fn: (tx: unknown) => unknown) =>
      fn({
        query: async (_sql: string, params: unknown[]) => {
          calls.n++;
          if (fail) throw new Error('db down');
          return { rows: live.has(String(params[0])) ? [{ ok: 1 }] : [], rowCount: 0 };
        },
      }),
  } as unknown as Db;
}

describe('session-checking verifier', () => {
  it('accepts a live session and caches the lookup', async () => {
    const calls = { n: 0 };
    const v = createSessionCheckingVerifier(inner(user('s1')), fakeDb(new Set(['s1']), calls));
    expect(await v.verify('t')).not.toBeNull();
    expect(await v.verify('t')).not.toBeNull();
    expect(calls.n).toBe(1);
  });

  it('refuses a logged-out session after the cache window', async () => {
    let t = 0;
    const live = new Set(['s1']);
    const calls = { n: 0 };
    const v = createSessionCheckingVerifier(inner(user('s1')), fakeDb(live, calls), { ttlMs: 1000, now: () => t });
    expect(await v.verify('t')).not.toBeNull();
    live.delete('s1'); // user logs out
    t = 1500;
    expect(await v.verify('t')).toBeNull();
  });

  it('fails closed: no session_id, invalid token, or a lookup error', async () => {
    const calls = { n: 0 };
    expect(await createSessionCheckingVerifier(inner(user()), fakeDb(new Set(), calls)).verify('t')).toBeNull();
    expect(await createSessionCheckingVerifier(inner(null), fakeDb(new Set(['s1']), calls)).verify('t')).toBeNull();
    expect(await createSessionCheckingVerifier(inner(user('s1')), fakeDb(new Set(['s1']), calls, true)).verify('t')).toBeNull();
  });
});

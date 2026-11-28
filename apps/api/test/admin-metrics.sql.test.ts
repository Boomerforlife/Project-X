/**
 * GET /admin/metrics against real migrations (PGlite): admin-only, aggregates only (no emails or user ids),
 * counts follow the data, and the route never writes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, createTestUser, type TestDb } from '@projectx/db/testing';
import { createSqlStore } from '../src/repositories/sql/store';
import { parseReport } from '../src/admin-metrics/routes';
import { allKeys, makeHarness, token, type Harness } from './helpers';

type J = { data?: any; error?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
let db: TestDb;
let h: Harness;
let adminT: string;
let studentT: string;
let studentEmail: string;
const now = new Date('2026-11-28T06:00:00Z');
const sql = <T = Record<string, unknown>>(q: string, p: unknown[] = []) => db.withService(async (tx) => (await tx.query<T>(q, p)).rows);

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  h = makeHarness({ store: createSqlStore(db), db, clock: () => now });
  const a = await createTestUser(db, { email: 'metrics-admin@test.local', roles: ['ADMIN'] });
  adminT = await token(a.id);
  studentEmail = 'metrics-student@test.local';
  const s = await createTestUser(db, { email: studentEmail });
  studentT = await token(s.id);
  const q = (await sql<{ id: string }>(`select id from public.questions where publication_status = 'PUBLISHED' limit 1`))[0]!;
  await sql(
    `insert into public.doubts (user_id, question_id, body, status) values ($1, $2, '[REPORT:wrong_answer] Option 2 is right', 'OPEN'),
            ($1, $2, 'How do I start this one?', 'OPEN')`,
    [s.id, q.id],
  );
}, 120_000);
afterAll(async () => {
  await db.close();
});

describe('GET /admin/metrics', () => {
  it('is admin only', async () => {
    expect((await h.req('/admin/metrics')).status).toBe(401);
    expect((await h.req('/admin/metrics', { token: studentT })).status).toBe(403);
  });

  it('returns the overview with counts that match the database and no personal data', async () => {
    const before = await sql<{ n: string }>(`select count(*)::text n from public.audit_log`);
    const r = await h.req('/admin/metrics', { token: adminT });
    expect(r.status).toBe(200);
    const body = (await r.json()) as J;
    const m = body.data;
    const users = await sql<{ n: string }>(`select count(*)::text n from auth.users`);
    const published = await sql<{ n: string }>(`select count(*)::text n from public.questions where publication_status = 'PUBLISHED'`);
    expect(m.users.total).toBe(Number(users[0]!.n));
    expect(m.users.admins).toBeGreaterThanOrEqual(1);
    expect(m.content.published).toBe(Number(published[0]!.n));
    expect(m.daily.signups).toHaveLength(m.window_days);
    expect(m.daily.attempts.at(-1).day).toBe('2026-11-28');
    expect(m.support.reports_open).toBe(1);
    expect(m.support.doubts_open).toBe(1);
    expect(m.support.recent_reports[0]).toMatchObject({ reason: 'wrong_answer', excerpt: 'Option 2 is right' });
    expect(m.support.recent_reports[0].question_slug).toEqual(expect.any(String));
    // Aggregates only: no emails, user ids or report authors anywhere in the payload.
    const text = JSON.stringify(m);
    expect(text).not.toContain(studentEmail);
    expect(text).not.toContain('metrics-admin@');
    expect([...allKeys(m)].some((k) => /user_id|email$/.test(k))).toBe(false);
    // Read-only.
    const after = await sql<{ n: string }>(`select count(*)::text n from public.audit_log`);
    expect(after[0]!.n).toBe(before[0]!.n);
  });
});

describe('parseReport', () => {
  it('splits a report and ignores ordinary doubts', () => {
    expect(parseReport('[REPORT:typo] Missing minus sign')).toEqual({ reason: 'typo', text: 'Missing minus sign' });
    expect(parseReport('Why is the answer 4?')).toBeNull();
  });
});

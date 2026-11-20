import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, createTestUser, type TestDb } from '@projectx/db/testing';
import { createSqlStore } from '../src/repositories/sql/store';
import { parseConfig } from '../src/config';
import { makeHarness, SECRET, token, type Harness } from './helpers';

/** Paper analysis is Plus-only (owner decision 2026-11-20): enforced by the API, not just hidden in the web. */
type J = { data?: any; error?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<J> => (await r.json()) as J;

let db: TestDb;
let h: Harness;
const sql = <T = Record<string, unknown>>(q: string, p: unknown[] = []) => db.withService(async (tx) => (await tx.query<T>(q, p)).rows);

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  h = makeHarness({ store: createSqlStore(db), db });
  h.deps.config = parseConfig({
    APP_ENV: 'test', AUTH_MODE: 'test', TEST_JWT_SECRET: SECRET,
    SIGNING_SECRET: 'sign-secret-sign-secret-sign-secret-1234', IP_HASH_SECRET: 'ip-secret-ip-secret-ip-secret-ip-secret-1234',
    PUBLIC_ASSETS_BASE_URL: 'https://assets.test', FILES_BASE_URL: 'https://api.test/api/v1/files', CORS_ALLOWED_ORIGINS: 'https://app.test',
  });
}, 120_000);
afterAll(() => db.close());

async function sessionWithOneAnswer(t: string): Promise<string> {
  const s = await j(await h.req('/practice/sessions', { method: 'POST', token: t, json: { client_request_id: crypto.randomUUID(), mode: 'MIXED', exam: 'jee-main', size: 3, ui_mode: 'test' } }));
  const q = s.data.questions[0];
  const response = q.question_type === 'NUMERICAL' ? { type: 'NUMERICAL', value: '987654321' } : q.question_type === 'MULTI_MCQ' ? { type: 'MULTI_MCQ', option_ids: [q.options[0].id] } : { type: 'SINGLE_MCQ', option_id: q.options[0].id };
  const a = await h.req('/practice/attempts', { method: 'POST', token: t, json: { client_attempt_id: crypto.randomUUID(), question_id: q.id, session_id: s.data.session.id, response, time_spent_ms: 42_000 } });
  expect(a.status).toBe(201);
  return s.data.session.id;
}

describe('session analysis (Plus)', () => {
  it('refuses a Free account with PREMIUM_REQUIRED', async () => {
    const u = await createTestUser(db, { email: 'free-analysis@test.local' });
    const t = await token(u.id);
    const sid = await sessionWithOneAnswer(t);
    const r = await h.req(`/practice/sessions/${sid}/analysis`, { token: t });
    expect(r.status).toBe(403);
    expect((await j(r)).error.details.reason).toBe('PREMIUM_REQUIRED');
  });

  it('gives a Plus account chapter, time and section breakdowns of its own session only', async () => {
    const u = await createTestUser(db, { email: 'plus-analysis@test.local' });
    await sql(`insert into billing_entitlements (user_id, source, starts_at, ends_at, note) values ($1, 'SUPPORT_GRANT', now() - interval '1 day', now() + interval '30 days', 'test')`, [u.id]);
    const t = await token(u.id);
    const sid = await sessionWithOneAnswer(t);
    const r = await h.req(`/practice/sessions/${sid}/analysis`, { token: t });
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    const d = (await j(r)).data;
    expect(d.session_id).toBe(sid);
    expect(d.chapters.reduce((n: number, c: { questions: number }) => n + c.questions, 0)).toBe(3);
    expect(d.chapters.reduce((n: number, c: { attempted: number }) => n + c.attempted, 0)).toBe(1);
    expect(d.time).toMatchObject({ total_ms: 42_000, answered: 1, avg_ms: 42_000 });
    expect(d.time.slowest[0].time_ms).toBe(42_000);
    expect(d.sections.length).toBeGreaterThan(0);
    expect(d.previous).toBeNull();

    // Another user's session is not readable, even on Plus.
    const other = await createTestUser(db, { email: 'other-analysis@test.local' });
    await sql(`insert into billing_entitlements (user_id, source, starts_at, ends_at, note) values ($1, 'SUPPORT_GRANT', now() - interval '1 day', now() + interval '30 days', 'test')`, [other.id]);
    expect((await h.req(`/practice/sessions/${sid}/analysis`, { token: await token(other.id) })).status).toBe(404);
  });
});

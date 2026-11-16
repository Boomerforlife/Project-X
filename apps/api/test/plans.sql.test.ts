import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, createTestUser, type TestDb } from '@projectx/db/testing';
import { createSqlStore } from '../src/repositories/sql/store';
import { parseConfig } from '../src/config';
import { makeHarness, SECRET, token, type Harness } from './helpers';

type J = { data?: any; meta?: any; error?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<J> => (await r.json()) as J;

const env = {
  APP_ENV: 'test',
  AUTH_MODE: 'test',
  TEST_JWT_SECRET: SECRET,
  SIGNING_SECRET: 'sign-secret-sign-secret-sign-secret-1234',
  IP_HASH_SECRET: 'ip-secret-ip-secret-ip-secret-ip-secret-1234',
  PUBLIC_ASSETS_BASE_URL: 'https://assets.test',
  FILES_BASE_URL: 'https://api.test/api/v1/files',
  CORS_ALLOWED_ORIGINS: 'https://app.test',
};

let db: TestDb;
let h: Harness;
const sql = <T = Record<string, unknown>>(q: string, p: unknown[] = []) => db.withService(async (tx) => (await tx.query<T>(q, p)).rows);

async function user(): Promise<{ id: string; t: string }> {
  const u = await createTestUser(db, { email: `pl${Math.random().toString(36).slice(2, 10)}@test.local` });
  return { id: u.id, t: await token(u.id) };
}
async function makePlus(userId: string) {
  await sql(`insert into billing_entitlements (user_id, source, starts_at, ends_at, note) values ($1, 'SUPPORT_GRANT', now() - interval '1 day', now() + interval '30 days', 'test')`, [userId]);
}
async function endPlus(userId: string) {
  await sql(`update billing_entitlements set ends_at = now() - interval '1 minute', starts_at = now() - interval '2 days' where user_id = $1`, [userId]);
}
async function response(qid: string, right: boolean) {
  const [r] = await sql<{ k: { type: string; correct_option_ids?: string[]; accepted_ranges?: { min: string }[] } }>(`select answer_key as k from questions where id=$1`, [qid]);
  const k = r!.k;
  if (k.type === 'NUMERICAL') return { type: 'NUMERICAL', value: right ? k.accepted_ranges![0]!.min : '987654321' };
  const opts = (await sql<{ id: string }>(`select id from question_options where question_id=$1 order by sort_order`, [qid])).map((o) => o.id);
  const good = new Set(k.correct_option_ids);
  const pick = right ? k.correct_option_ids! : [opts.find((o) => !good.has(o))!];
  return k.type === 'SINGLE_MCQ' ? { type: 'SINGLE_MCQ', option_id: pick[0] } : { type: 'MULTI_MCQ', option_ids: pick };
}
async function answer(t: string, sessionId: string, qid: string, right: boolean) {
  return h.req('/practice/attempts', {
    method: 'POST', token: t,
    json: { client_attempt_id: crypto.randomUUID(), question_id: qid, session_id: sessionId, response: await response(qid, right), time_spent_ms: 60_000 },
  });
}

/** Start a diagnostic, answer it (alternating right/wrong, last one left blank) and submit it. */
async function takeDiagnostic(u: { t: string }) {
  const r = await h.req('/plans/diagnostic', { method: 'POST', token: u.t, json: { client_request_id: crypto.randomUUID(), exam: 'jee-main', length: 15 } });
  expect(r.status).toBe(201);
  const d = (await j(r)).data;
  const qs = d.questions as { id: string }[];
  for (let i = 0; i < qs.length - 1; i++) expect((await answer(u.t, d.session.id, qs[i]!.id, i % 2 === 0)).status).toBe(201);
  await h.req(`/practice/sessions/${d.session.id}/complete`, { method: 'POST', token: u.t });
  return d;
}

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  h = makeHarness({ store: createSqlStore(db), db });
  h.deps.config = parseConfig(env);
});
afterAll(() => db.close());

describe('diagnostic', () => {
  it('needs sign-in', async () => {
    expect((await h.req('/plans/diagnostic', { method: 'POST', json: { client_request_id: crypto.randomUUID(), length: 15 } })).status).toBe(401);
  });

  it('builds a timed test-mode session with one question per problem, states the real mix, and replays idempotently', async () => {
    const u = await user();
    const id = crypto.randomUUID();
    const r = await h.req('/plans/diagnostic', { method: 'POST', token: u.t, json: { client_request_id: id, exam: 'jee-main', length: 15 } });
    expect(r.status).toBe(201);
    const d = (await j(r)).data;
    expect(d.session.ui_mode).toBe('test');
    expect(d.session.time_limit_sec).toBeGreaterThan(0);
    expect(d.questions.length).toBeGreaterThan(0);
    expect(d.questions.length + d.short_by).toBe(15);
    expect(d.actual_mix.EASY + d.actual_mix.MEDIUM + d.actual_mix.HARD).toBe(d.questions.length);
    expect(JSON.stringify(d.questions)).not.toMatch(/answer_key|correct_option|final_answer/);
    const fams = await sql<{ family_id: string }>(`select family_id from questions where id = any($1::uuid[])`, [d.questions.map((q: { id: string }) => q.id)]);
    expect(new Set(fams.map((f) => f.family_id)).size).toBe(fams.length);

    const again = await h.req('/plans/diagnostic', { method: 'POST', token: u.t, json: { client_request_id: id, exam: 'jee-main', length: 15 } });
    expect(again.status).toBe(200);
    expect((await j(again)).data.session.id).toBe(d.session.id);
  });

  it('free users get the summary and top 3 only; the full breakdown is stripped', async () => {
    const u = await user();
    const d = await takeDiagnostic(u);
    const rep = await j(await h.req(`/plans/diagnostic/${d.session.id}/report`, { token: u.t }));
    expect(rep.data.completed).toBe(true);
    expect(rep.data.plus).toBe(false);
    expect(rep.data.chapters).toBeNull();
    expect(rep.data.focus.length).toBeLessThanOrEqual(3);
    const answered = rep.data.subjects.reduce((s: number, x: { answered: number; skipped: number }) => s + x.answered + x.skipped, 0);
    expect(answered).toBe(d.questions.length);
    for (const f of rep.data.focus) expect(['weak', 'shaky']).toContain(f.band);
    expect(JSON.stringify(rep.data)).not.toMatch(/mastery|alpha|beta/);
  });

  it("someone else's diagnostic is not found", async () => {
    const a = await user();
    const d = await takeDiagnostic(a);
    const b = await user();
    expect((await h.req(`/plans/diagnostic/${d.session.id}/report`, { token: b.t })).status).toBe(404);
  });
});

describe('study plan (Plus)', () => {
  it('free users cannot create a plan', async () => {
    const u = await user();
    const d = await takeDiagnostic(u);
    const r = await h.req('/plans', { method: 'POST', token: u.t, json: { client_request_id: crypto.randomUUID(), diagnostic_session_id: d.session.id } });
    expect(r.status).toBe(403);
    expect((await j(r)).error.details.reason).toBe('PREMIUM_REQUIRED');
  });

  it('builds a plan, re-plans on read, starts items idempotently, and goes read-only when Plus lapses', async () => {
    const u = await user();
    await makePlus(u.id);
    const d = await takeDiagnostic(u);
    const rep = await j(await h.req(`/plans/diagnostic/${d.session.id}/report`, { token: u.t }));
    expect(Array.isArray(rep.data.chapters)).toBe(true);

    const created = await h.req('/plans', { method: 'POST', token: u.t, json: { client_request_id: crypto.randomUUID(), diagnostic_session_id: d.session.id, daily_minutes: 60, days: 14 } });
    expect(created.status).toBe(201);
    const plan = (await j(created)).data;
    expect(plan.plan_days).toHaveLength(14);
    expect(plan.plan_days[0].items[0].kind).toBe('REVIEW_DIAGNOSTIC');
    const kinds = plan.plan_days.flatMap((x: { items: { kind: string }[] }) => x.items.map((i) => i.kind));
    expect(kinds).toContain('CHECKPOINT');
    expect(kinds).not.toContain('READ');

    const cur = await h.req('/plans/current', { token: u.t });
    expect(cur.status).toBe(200);
    expect((await j(cur)).data.id).toBe(plan.id);

    // Start the first practice-like item; starting it again returns the same session.
    const item = plan.plan_days.flatMap((x: { items: { key: string; kind: string }[] }) => x.items).find((i: { kind: string }) => ['PRACTICE', 'TIMED', 'MISTAKES'].includes(i.kind));
    if (item) {
      const s1 = await h.req(`/plans/${plan.id}/items/${item.key}/start`, { method: 'POST', token: u.t });
      expect(s1.status).toBe(200);
      const b1 = (await j(s1)).data;
      expect(b1.session).not.toBeNull();
      expect(b1.item.started_at).not.toBeNull();
      const s2 = (await j(await h.req(`/plans/${plan.id}/items/${item.key}/start`, { method: 'POST', token: u.t }))).data;
      expect(s2.session.session.id).toBe(b1.session.session.id);
    }

    // A second plan archives the first; only one stays active.
    const second = await h.req('/plans', { method: 'POST', token: u.t, json: { client_request_id: crypto.randomUUID(), diagnostic_session_id: d.session.id, daily_minutes: 30, days: 7 } });
    expect(second.status).toBe(201);
    const active = await sql<{ n: string }>(`select count(*)::text as n from study_plans where user_id=$1 and status='ACTIVE'`, [u.id]);
    expect(active[0]!.n).toBe('1');

    await endPlus(u.id);
    const locked = await j(await h.req('/plans/current', { token: u.t }));
    expect(locked.data.locked).toBe(true);
    const k = locked.data.plan_days[0].items[0].key;
    expect((await h.req(`/plans/${locked.data.id}/items/${k}/start`, { method: 'POST', token: u.t })).status).toBe(403);
  });

  it('no plan yet is a 404', async () => {
    const u = await user();
    await makePlus(u.id);
    expect((await h.req('/plans/current', { token: u.t })).status).toBe(404);
  });
});

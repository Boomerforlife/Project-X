import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, createTestUser, type TestDb } from '@projectx/db/testing';
import { createSqlStore } from '../src/repositories/sql/store';
import { parseConfig } from '../src/config';
import { stripPremiumSolutionExtras } from '../src/problems/access';
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
  FREE_VARIANTS_PER_PROBLEM: '1',
};

let db: TestDb;
let h: Harness;
const sql = <T = Record<string, unknown>>(q: string, p: unknown[] = []) => db.withService(async (tx) => (await tx.query<T>(q, p)).rows);

async function user(): Promise<{ id: string; t: string }> {
  const u = await createTestUser(db, { email: `p${Math.random().toString(36).slice(2, 10)}@test.local` });
  return { id: u.id, t: await token(u.id) };
}
async function makePlus(userId: string) {
  await sql(`insert into billing_entitlements (user_id, source, starts_at, ends_at, note) values ($1, 'SUPPORT_GRANT', now() - interval '1 day', now() + interval '30 days', 'test')`, [userId]);
}
/** A correct response for a question, built from its stored answer key. */
async function correctResponse(qid: string) {
  const [r] = await sql<{ k: { type: string; correct_option_ids?: string[]; accepted_ranges?: { min: string }[] } }>(`select answer_key as k from questions where id=$1`, [qid]);
  const k = r!.k;
  if (k.type === 'SINGLE_MCQ') return { type: 'SINGLE_MCQ', option_id: k.correct_option_ids![0] };
  if (k.type === 'MULTI_MCQ') return { type: 'MULTI_MCQ', option_ids: k.correct_option_ids };
  return { type: 'NUMERICAL', value: k.accepted_ranges![0]!.min };
}
/** A wrong response of the right type (so the API accepts and records it). */
async function wrongResponse(qid: string) {
  const ok = (await correctResponse(qid)) as { type: string; option_id?: string; option_ids?: string[] };
  if (ok.type === 'NUMERICAL') return { type: 'NUMERICAL', value: '987654321' };
  const right = new Set(ok.option_ids ?? [ok.option_id]);
  const [other] = (await sql<{ id: string }>(`select id from question_options where question_id=$1 order by sort_order`, [qid])).filter((o) => !right.has(o.id));
  return ok.type === 'SINGLE_MCQ' ? { type: 'SINGLE_MCQ', option_id: other!.id } : { type: 'MULTI_MCQ', option_ids: [other!.id] };
}
async function answer(t: string, qid: string, right = true) {
  const response = right ? await correctResponse(qid) : await wrongResponse(qid);
  return h.req('/practice/attempts', { method: 'POST', token: t, json: { client_attempt_id: crypto.randomUUID(), question_id: qid, response } });
}

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  h = makeHarness({ store: createSqlStore(db), db });
  h.deps.config = parseConfig(env);
});
afterAll(() => db.close());

describe('problem set', () => {
  it('lists numbered problems for anonymous visitors, publicly cacheable, with no personal status', async () => {
    const r = await h.req('/problems');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toMatch(/public/);
    const b = await j(r);
    expect(b.data.total).toBeGreaterThan(0);
    const nums = b.data.items.map((p: { number: number }) => p.number);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    for (const p of b.data.items) {
      expect(p.status).toBeNull();
      expect(p.acceptance_rate).toBeNull(); // nobody has tried yet
      expect(p.variants).toBeGreaterThan(0);
      expect(p.title.length).toBeGreaterThan(0);
    }
    const s = await j(await h.req('/problems/summary'));
    expect(s.data.problems.total).toBe(b.data.total);
    expect(s.data.solved).toBeNull();
  });

  it('status filters need sign-in', async () => {
    expect((await h.req('/problems?status=SOLVED')).status).toBe(401);
  });

  it('the daily problem is the same on repeat calls', async () => {
    const a = await j(await h.req('/problems/daily'));
    const b = await j(await h.req('/problems/daily'));
    expect(a.data.problem.number).toBe(b.data.problem.number);
    expect(a.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('serving a variant hides the answer; solving it updates status, counters and summary', async () => {
    const u = await user();
    const first = (await j(await h.req('/problems?limit=1'))).data.items[0];
    const nx = await h.req(`/problems/${first.number}/next`, { token: u.t });
    expect(nx.status).toBe(200);
    const q = (await j(nx)).data;
    expect(JSON.stringify(q)).not.toMatch(/answer_key|correct_option|final_answer/);
    expect((await answer(u.t, q.id)).status).toBe(201);

    const mine = await j(await h.req('/problems?status=SOLVED', { token: u.t }));
    expect(mine.data.items.map((p: { number: number }) => p.number)).toContain(first.number);
    const d = await j(await h.req(`/problems/${first.number}`, { token: u.t }));
    expect(d.data.status).toBe('SOLVED');
    expect(d.data.variants_tried).toBe(1);
    expect(d.data.solvers).toBe(1);
    const s = await j(await h.req('/problems/summary', { token: u.t }));
    expect(s.data.solved.total).toBe(1);
    expect((await h.req('/problems', { token: u.t })).headers.get('cache-control')).toMatch(/private/);
  });

  it('free users get FREE_VARIANTS_PER_PROBLEM distinct variants (1 in this test); Plus gets new ones', async () => {
    // Put two published questions into one family to make a two-variant problem.
    const pub = await sql<{ id: string; family_id: string; n: number }>(
      `select q.id, q.family_id, f.number as n from questions q join question_families f on f.id=q.family_id
        where q.publication_status='PUBLISHED' order by f.number limit 2`,
    );
    const [a, b] = pub as [{ id: string; family_id: string; n: number }, { id: string; family_id: string; n: number }];
    await sql(`update questions set family_id=$1 where id=$2`, [a.family_id, b.id]);

    const free = await user();
    const v1 = (await j(await h.req(`/problems/${a.n}/next`, { token: free.t }))).data.id;
    expect((await answer(free.t, v1, false)).status).toBe(201);
    for (let i = 0; i < 4; i++) {
      expect((await j(await h.req(`/problems/${a.n}/next`, { token: free.t }))).data.id).toBe(v1); // no new variant
    }
    const det = await j(await h.req(`/problems/${a.n}`, { token: free.t }));
    expect(det.data.variants_left_free).toBe(0);

    const plus = await user();
    await makePlus(plus.id);
    const p1 = (await j(await h.req(`/problems/${a.n}/next`, { token: plus.t }))).data.id;
    expect((await answer(plus.t, p1, false)).status).toBe(201);
    const p2 = (await j(await h.req(`/problems/${a.n}/next`, { token: plus.t }))).data.id;
    expect(p2).not.toBe(p1); // Plus moves on to the untried variant
  });

  it('premium problems are locked for free users (no content, no grading) and open for Plus', async () => {
    const [f] = await sql<{ id: string; n: number; qid: string; chapter: string }>(
      `select f.id, f.number as n, q.id as qid, c.slug as chapter from question_families f
         join questions q on q.family_id=f.id and q.publication_status='PUBLISHED'
         join chapters c on c.id=f.chapter_id order by f.number desc limit 1`,
    );
    await sql(`update question_families set access_tier='PREMIUM' where id=$1`, [f!.id]);
    await sql(`update questions set access_tier='PREMIUM' where family_id=$1`, [f!.id]);

    const anon = await j(await h.req(`/problems?premium=true`));
    expect(anon.data.items.some((p: { number: number; locked: boolean }) => p.number === f!.n && p.locked)).toBe(true);

    const free = await user();
    const nx = await h.req(`/problems/${f!.n}/next`, { token: free.t });
    expect(nx.status).toBe(403);
    expect((await j(nx)).error.details.reason).toBe('PREMIUM_REQUIRED');
    const at = await answer(free.t, f!.qid);
    expect(at.status).toBe(403);

    // Chapter practice for a free user never includes the premium question.
    const s = await h.req('/practice/sessions', {
      method: 'POST', token: free.t,
      json: { client_request_id: crypto.randomUUID(), mode: 'CHAPTER', exam: 'jee-main', chapter: f!.chapter, size: 20, filters: { exclude_correct: false } },
    });
    if (s.status === 201) expect((await j(s)).data.questions.map((q: { id: string }) => q.id)).not.toContain(f!.qid);
    else expect(s.status).toBe(422); // the chapter had only premium questions

    const plus = await user();
    await makePlus(plus.id);
    expect((await h.req(`/problems/${f!.n}/next`, { token: plus.t })).status).toBe(200);
    expect((await answer(plus.t, f!.qid)).status).toBe(201);
    const pl = await j(await h.req(`/problems?premium=true`, { token: plus.t }));
    expect(pl.data.items.find((p: { number: number }) => p.number === f!.n).locked).toBe(false);
  });
});

describe('solution extras are Plus-only', () => {
  it('free keeps answer and steps; extras are emptied', () => {
    const r = { solution: { final_answer: 'B', steps: [{ text: 's1' }], alternatives: [{ title: 'x', steps: [] }], shortcuts: ['k'], common_mistakes: ['m'] } };
    const free = stripPremiumSolutionExtras(r, false).solution as unknown as Record<string, unknown[]>;
    expect(free.steps).toHaveLength(1);
    expect(free.alternatives).toEqual([]);
    expect(free.shortcuts).toEqual([]);
    expect(free.common_mistakes).toEqual([]);
    expect(stripPremiumSolutionExtras(r, true)).toBe(r);
  });
});

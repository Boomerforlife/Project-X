import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, createTestUser, type TestDb, type TestUser } from '@projectx/db/testing';
import { PRACTICE_FORBIDDEN_KEYS } from '@projectx/contracts';
import { createSqlStore } from '../src/repositories/sql/store';
import { allKeys, makeHarness, token, type Harness } from './helpers';

type J = { data?: any; meta?: any; error?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<J> => (await r.json()) as J;
const uuid = () => crypto.randomUUID();

let db: TestDb;
let h: Harness;
let user: TestUser;
let user2: TestUser;
let admin: TestUser;
let ut: string;
let ut2: string;
let at: string;

async function qid(slug: string): Promise<string> {
  return db.withService(async (tx) => (await tx.query<{ id: string }>('select id from public.questions where slug=$1', [slug])).rows[0]!.id);
}

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  user = await createTestUser(db, { email: 'u1@test.local', timezone: 'Asia/Kolkata' });
  user2 = await createTestUser(db, { email: 'u2@test.local' });
  admin = await createTestUser(db, { email: 'a@test.local', roles: ['ADMIN'] });
  h = makeHarness({ store: createSqlStore(db), db });
  [ut, ut2, at] = await Promise.all([token(user.id, { email: 'u1@test.local' }), token(user2.id), token(admin.id)]);
}, 120_000);
afterAll(async () => {
  await db.close();
});

describe('SQL repositories: public + practice', () => {
  it('health reports db ok; taxonomy and public question DTO', async () => {
    expect((await j(await h.req('/health'))).data.db).toBe('ok');
    const exams = await j(await h.req('/taxonomy/exams'));
    expect(exams.data.map((e: any) => e.slug)).toContain('jee-main');
    const r = await h.req('/public/questions/demo-constant-acceleration-distance');
    expect(r.status).toBe(200);
    const b = await j(r);
    expect(b.data.question_type).toBe('SINGLE_MCQ');
    expect(b.data.solution.final_answer.correct_labels).toEqual(['B']);
    expect(b.data.options).toHaveLength(4);
    expect(b.data.exam.slug).toBe('jee-main');
    expect(b.data.attribution.origin).toBe('EDITORIAL');
    expect(r.headers.get('Cache-Tag')).toContain(`q-${b.data.id}`);
    expect(r.headers.get('ETag')).toMatch(/^W\/"/);
    const tax = await j(await h.req('/taxonomy/subjects/jee-main-physics/chapters'));
    expect(tax.data.find((c: any) => c.slug === 'jee-main-physics-kinematics').published_question_count).toBeGreaterThanOrEqual(2);
  });

  it('draft and disputed questions are 404; search + chapter + sitemap work', async () => {
    expect((await h.req('/public/questions/demo-draft-unreviewed-question')).status).toBe(404);
    expect((await h.req('/public/questions/demo-disputed-question')).status).toBe(404);
    const s = await j(await h.req('/public/search?q=particle%20acceleration'));
    expect(s.data.length).toBeGreaterThanOrEqual(1);
    expect(typeof s.data[0].rank).toBe('number');
    const c1 = await j(await h.req('/public/chapters/jee-main-physics-kinematics?limit=1'));
    expect(c1.data.questions).toHaveLength(1);
    expect(c1.meta.page.next_cursor).toBeTruthy();
    const c2 = await j(await h.req(`/public/chapters/jee-main-physics-kinematics?limit=1&cursor=${c1.meta.page.next_cursor}`));
    expect(c2.data.questions[0].id).not.toBe(c1.data.questions[0].id);
    expect((await h.req('/public/sitemap/questions')).status).toBe(200);
    const rel = await j(await h.req('/public/questions/demo-constant-acceleration-distance/related'));
    expect(Array.isArray(rel.data)).toBe(true);
  });

  it('practice list never leaks answers (deep key scan)', async () => {
    const r = await h.req('/practice/questions?exam=jee-main&limit=50');
    const body = await j(r);
    expect(body.data.length).toBeGreaterThanOrEqual(6);
    const keys = allKeys(body);
    for (const k of PRACTICE_FORBIDDEN_KEYS) expect(keys.has(k), `leaked ${k}`).toBe(false);
    expect(JSON.stringify(body)).not.toContain('Use $s = ');
    const nf = await j(await h.req('/practice/questions?exam=jee-main&type=NUMERICAL&difficulty=EASY'));
    expect(nf.data.every((q: any) => q.question_type === 'NUMERICAL')).toBe(true);
  });

  it('sessions idempotent; attempts replay/conflict/already attempted; streak + progress + mistakes', async () => {
    const body = { client_request_id: uuid(), mode: 'CHAPTER', exam: 'jee-main', chapter: 'jee-main-physics-kinematics', size: 3 };
    const a = await h.req('/practice/sessions', { method: 'POST', token: ut, json: body });
    expect(a.status).toBe(201);
    const ab = await j(a);
    const again = await h.req('/practice/sessions', { method: 'POST', token: ut, json: body });
    expect(again.status).toBe(200);
    expect((await j(again)).meta.replayed).toBe(true);
    const sid = ab.data.session.id;
    const sq = ab.data.questions[0];
    const wrongOpt = sq.options[0].id;
    const resp = sq.question_type === 'NUMERICAL' ? { type: 'NUMERICAL', value: '999' } : sq.question_type === 'MULTI_MCQ' ? { type: 'MULTI_MCQ', option_ids: [wrongOpt] } : { type: 'SINGLE_MCQ', option_id: wrongOpt };
    const cid = uuid();
    const mk = (client_attempt_id: string, response: unknown) =>
      h.req('/practice/attempts', { method: 'POST', token: ut, json: { client_attempt_id, question_id: sq.id, session_id: sid, response, time_spent_ms: 1500 } });
    const r1 = await mk(cid, resp);
    expect(r1.status).toBe(201);
    const b1 = await j(r1);
    expect(b1.data.correct_answer).toBeTruthy();
    expect(b1.data.session.attempted_count).toBe(1);
    const r2 = await mk(cid, resp);
    expect(r2.status).toBe(200);
    const b2 = await j(r2);
    expect(b2.meta.replayed).toBe(true);
    expect(b2.data.attempt_id).toBe(b1.data.attempt_id);
    expect(b2.data.score).toBe(b1.data.score);
    const r3 = await mk(cid, { type: 'NUMERICAL', value: '1' });
    expect([400, 409]).toContain(r3.status); // type mismatch is checked after replay lookup -> conflict
    expect((await j(r3)).error.code).toBe('IDEMPOTENCY_CONFLICT');
    const r4 = await mk(uuid(), resp);
    expect(r4.status).toBe(409);
    expect((await j(r4)).error.code).toBe('ALREADY_ATTEMPTED');

    // double-count check: exactly one attempt row, one daily_activity count
    const counts = await db.withService(async (tx) => ({
      attempts: (await tx.query<{ n: number }>('select count(*)::int n from public.attempts where user_id=$1', [user.id])).rows[0]!.n,
      daily: (await tx.query<{ n: number }>('select coalesce(sum(attempts_count),0)::int n from public.daily_activity where user_id=$1', [user.id])).rows[0]!.n,
    }));
    expect(counts).toEqual({ attempts: 1, daily: 1 });

    const st = await j(await h.req('/users/me/streak', { token: ut }));
    expect(st.data.current_streak).toBe(1);
    expect(st.data.today_attempts).toBe(1);
    const prog = await j(await h.req('/users/me/progress?exam=jee-main', { token: ut }));
    expect(prog.data.totals.attempts).toBe(1);
    const mistakes = await j(await h.req('/users/me/mistakes', { token: ut }));
    expect(mistakes.data).toHaveLength(1);
    const detail = await j(await h.req(`/practice/sessions/${sid}`, { token: ut }));
    expect(detail.data.items.filter((i: any) => i.attempt).length).toBe(1);
    const hist = await j(await h.req('/users/me/attempts', { token: ut }));
    expect(hist.data).toHaveLength(1);
    expect(hist.data[0].response).toEqual(resp);
    // other user isolated
    expect((await j(await h.req('/users/me/attempts', { token: ut2 }))).data).toHaveLength(0);
    expect((await h.req(`/practice/sessions/${sid}`, { token: ut2 })).status).toBe(404);
  });

  it('bookmark CRUD through withUser (RLS), profile + prefs', async () => {
    const id = await qid('demo-hydrogen-n3-orbitals');
    const c = await h.req('/users/me/bookmarks', { method: 'POST', token: ut, json: { question_id: id, note: 'review' } });
    expect(c.status).toBe(201);
    expect((await h.req('/users/me/bookmarks', { method: 'POST', token: ut, json: { question_id: id, note: 'again' } })).status).toBe(200);
    expect((await h.req('/users/me/bookmarks', { method: 'POST', token: ut, json: { question_id: await qid('demo-draft-unreviewed-question') } })).status).toBe(404);
    const list = await j(await h.req('/users/me/bookmarks', { token: ut }));
    expect(list.data).toHaveLength(1);
    expect(list.data[0].note).toBe('again');
    expect((await j(await h.req('/users/me/bookmarks', { token: ut2 }))).data).toHaveLength(0);
    expect((await h.req(`/users/me/bookmarks/${id}`, { method: 'DELETE', token: ut })).status).toBe(204);
    expect((await h.req(`/users/me/bookmarks/${id}`, { method: 'DELETE', token: ut })).status).toBe(204);
    const bm = await h.req('/practice/sessions', { method: 'POST', token: ut, json: { client_request_id: uuid(), mode: 'BOOKMARKS', exam: 'jee-main' } });
    expect(bm.status).toBe(422);

    const me = await j(await h.req('/users/me', { method: 'PATCH', token: ut, json: { display_name: 'Asha', timezone: 'America/Los_Angeles', target_exam: 'jee-main' } }));
    expect(me.data.timezone).toBe('America/Los_Angeles');
    expect(me.data.target_exam.slug).toBe('jee-main');
    expect((await h.req('/users/me', { method: 'PATCH', token: ut, json: { timezone: 'Not/AZone' } })).status).toBe(400);
    const pf = await j(await h.req('/users/me/exam-preferences', { method: 'PUT', token: ut, json: { preferences: [{ exam: 'jee-main', is_primary: true, target_year: 2027 }] } }));
    expect(pf.data.exam_preferences[0].target_year).toBe(2027);
    const d = await h.req('/doubts', { method: 'POST', token: ut, json: { body: 'help' } });
    expect(d.status).toBe(202);
    expect((await j(await h.req('/users/me/doubts', { token: ut }))).data).toHaveLength(1);
    const g = await h.req('/doubts', { method: 'POST', json: { body: 'guest help' } });
    expect(g.status).toBe(202);
  });
});

describe('SQL repositories: admin workflow', () => {
  it('dispute resolution: new solution -> approve -> publish -> unpublish with purge tags; VERSION_CONFLICT; guard 422', async () => {
    const id = await qid('demo-disputed-question');
    const q0 = await j(await h.req(`/admin/questions/${id}`, { token: at }));
    expect(q0.data.verification_status).toBe('DISPUTED');
    const key = q0.data.answer_key;
    const sol = await h.req(`/admin/questions/${id}/solutions`, {
      method: 'POST',
      token: at,
      json: { final_answer: key, steps: [{ index: 1, title: null, blocks: [{ type: 'paragraph', text: 'Corrected reasoning.' }] }], summary: 'fixed', edit_note: 'corrected solution' },
    });
    expect(sol.status).toBe(201);
    const sv = (await j(sol)).data;
    const stale = await h.req(`/admin/questions/${id}/approve`, { method: 'POST', token: at, json: { solution_version_id: sv.id, expected_row_version: q0.data.row_version + 5 } });
    expect(stale.status).toBe(409);
    expect((await j(stale)).error.code).toBe('VERSION_CONFLICT');
    const ap = await h.req(`/admin/questions/${id}/approve`, { method: 'POST', token: at, json: { solution_version_id: sv.id, expected_row_version: q0.data.row_version, note: 'dispute resolved' } });
    expect(ap.status).toBe(200);
    const apb = (await j(ap)).data;
    expect(apb.verification_status).toBe('HUMAN_VERIFIED');
    expect(apb.solution_versions.filter((v: any) => v.review_status === 'APPROVED')).toHaveLength(1);
    const pub = await h.req(`/admin/questions/${id}/publish`, { method: 'POST', token: at, json: { expected_row_version: apb.row_version } });
    expect(pub.status).toBe(200);
    const pb = (await j(pub)).data;
    expect(pb.publication_status).toBe('PUBLISHED');
    expect(h.invalidator.calls.at(-1)).toEqual(expect.arrayContaining([`q-${id}`, 'qslug-demo-disputed-question', 'qlist', 'sitemap', 'search']));
    expect((await h.req('/public/questions/demo-disputed-question')).status).toBe(200);

    // slug change on a published question -> 301 from the old slug
    const sl = await h.req(`/admin/questions/${id}`, { method: 'PATCH', token: at, json: { expected_row_version: pb.row_version, slug: 'demo-disputed-renamed', seo_title: 'Renamed' } });
    expect(sl.status).toBe(200);
    const moved = await h.req('/public/questions/demo-disputed-question');
    expect(moved.status).toBe(301);
    expect(moved.headers.get('Location')).toBe('/api/v1/public/questions/demo-disputed-renamed');
    expect(h.invalidator.calls.at(-1)).toEqual(expect.arrayContaining(['qslug-demo-disputed-question', 'qslug-demo-disputed-renamed']));

    const v = (await j(sl)).data.row_version;
    const un = await h.req(`/admin/questions/${id}/unpublish`, { method: 'POST', token: at, json: { expected_row_version: v, reason: 'testing unpublish' } });
    expect(un.status).toBe(200);
    expect((await j(un)).data.publication_status).toBe('DRAFT');
    expect((await h.req('/public/questions/demo-disputed-renamed')).status).toBe(404);
    const ev = await j(await h.req(`/admin/questions/${id}/verification`, { token: at }));
    expect(ev.data.review_events.map((e: any) => e.action)).toEqual(expect.arrayContaining(['UNPUBLISH', 'PUBLISH', 'RESOLVE_DISPUTE', 'EDIT_SOLUTION']));
    const audit = await db.withService(async (tx) => (await tx.query<{ n: number }>(`select count(*)::int n from public.audit_log where entity_id=$1`, [id])).rows[0]!.n);
    expect(audit).toBeGreaterThanOrEqual(4);
  });

  it('publish guard: API pre-check returns 422 with unmet[]', async () => {
    const id = await qid('demo-draft-unreviewed-question');
    const q = (await j(await h.req(`/admin/questions/${id}`, { token: at }))).data;
    const r = await h.req(`/admin/questions/${id}/publish`, { method: 'POST', token: at, json: { expected_row_version: q.row_version } });
    expect(r.status).toBe(422);
    const b = await j(r);
    expect(b.error.code).toBe('PUBLISH_REQUIREMENTS_NOT_MET');
    expect(b.error.details.unmet.length).toBeGreaterThan(2);
    // list + queue + enqueue
    const list = await j(await h.req('/admin/questions?publication_status=DRAFT&limit=5', { token: at }));
    expect(list.data.length).toBeGreaterThanOrEqual(1);
    const run = await h.req(`/admin/questions/${id}/verification/run`, { method: 'POST', token: at, json: { stages: ['CLASSIFY'] } });
    expect(run.status).toBe(202);
    const run2 = await j(await h.req(`/admin/questions/${id}/verification/run`, { method: 'POST', token: at, json: { stages: ['CLASSIFY'] } }));
    expect(run2.data.job_ids).toHaveLength(1);
    const jobs = await j(await h.req('/admin/ingestion/jobs?kind=AI_CLASSIFY', { token: at }));
    expect(jobs.data.length).toBe(1);
    const queue = await j(await h.req('/admin/verification/queue', { token: at }));
    expect(Array.isArray(queue.data)).toBe(true);
    expect((await h.req('/admin/sources', { token: at })).status).toBe(200);
  });

  it('non-admin users are denied on admin routes (RLS never reached)', async () => {
    expect((await h.req('/admin/questions', { token: ut })).status).toBe(403);
    expect((await h.req('/admin/questions')).status).toBe(401);
  });
});

import { describe, expect, it } from 'vitest';
import { createMemoryRateLimiter } from '@projectx/edge';
import { PRACTICE_FORBIDDEN_KEYS } from '@projectx/contracts';
import { IDS, allKeys, id, memoryHarness, token } from './helpers';

type J = { data?: any; meta?: any; error?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<J> => (await r.json()) as J;

describe('envelope, errors, headers', () => {
  it('health ok with envelope, request id and security headers, NONE cache', async () => {
    const { req } = memoryHarness();
    const r = await req('/health');
    expect(r.status).toBe(200);
    expect(await j(r)).toEqual({ data: { status: 'ok', version: '0.1.0', db: 'ok' } });
    expect(r.headers.get('X-Request-Id')).toBeTruthy();
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
  it('unknown route -> NOT_FOUND envelope; validation -> VALIDATION_ERROR with issues', async () => {
    const { req } = memoryHarness();
    const a = await req('/nope');
    expect(a.status).toBe(404);
    expect((await j(a)).error.code).toBe('NOT_FOUND');
    const b = await req('/public/search?q=a');
    expect(b.status).toBe(400);
    const body = await j(b);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details[0]).toEqual(expect.objectContaining({ path: 'query.q' }));
    expect(body.error.request_id).toBe(b.headers.get('X-Request-Id'));
  });
  it('invalid cursor -> 400', async () => {
    const { req } = memoryHarness();
    const r = await req('/public/chapters/jee-main-physics-kinematics?cursor=%21%21');
    expect(r.status).toBe(400);
  });
  it('CORS allow-list only', async () => {
    const { req } = memoryHarness();
    const ok = await req('/health', { headers: { Origin: 'https://app.test' } });
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test');
    expect(ok.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    const bad = await req('/health', { headers: { Origin: 'https://evil.test' } });
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('openapi.json is 3.1 and docs are served when enabled', async () => {
    const { req } = memoryHarness();
    const d = (await (await req('/openapi.json')).json()) as { openapi: string; paths: Record<string, Record<string, unknown>> };
    expect(d.openapi).toBe('3.1.0');
    const ops = Object.values(d.paths).flatMap((p) => Object.keys(p));
    expect(ops.length).toBeGreaterThanOrEqual(55);
    expect((await req('/docs')).status).toBe(200);
  });
});

describe('taxonomy + public content + cache classes', () => {
  it('taxonomy endpoints use TAXONOMY policy and tags', async () => {
    const { req } = memoryHarness();
    const r = await req('/taxonomy/exams');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=86400, stale-while-revalidate=86400');
    expect(r.headers.get('Cache-Tag')).toContain('tax');
    expect(r.headers.get('X-Cache-Tags')).toBe(r.headers.get('Cache-Tag'));
    expect(r.headers.get('Set-Cookie')).toBeNull();
    expect((await j(r)).data[0].slug).toBe('jee-main');
    const subs = await j(await req('/taxonomy/exams/jee-main/subjects'));
    expect(subs.data[0].chapter_count).toBe(2);
    const ch = await j(await req('/taxonomy/subjects/jee-main-physics/chapters'));
    expect(ch.data[0].published_question_count).toBe(3);
    const tree = await j(await req('/taxonomy/tree?exam=jee-main'));
    expect(tree.data.subjects[0].chapters[0].topics[0].segment).toBe('projectile-motion');
    expect((await req('/taxonomy/exams/nope/subjects')).status).toBe(404);
  });

  it('public question: DTO, tags, ETag/304, no token influence', async () => {
    const { req } = memoryHarness();
    const r = await req('/public/questions/demo-single');
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400');
    const tags = r.headers.get('Cache-Tag')!.split(',');
    expect(tags).toEqual(expect.arrayContaining([`q-${IDS.qSingle}`, 'qslug-demo-single', `ch-${IDS.chapter}`, `sub-${IDS.subject}`, `exam-${IDS.exam}`]));
    const b = await j(r);
    expect(b.data.canonical_path).toBe('/questions/demo-single');
    expect(b.data.solution.final_answer.correct_labels).toEqual(['B']);
    expect(b.data.seo.robots).toBe('index,follow');
    expect(b.data.breadcrumbs.length).toBe(4);
    expect(b.data.related.count).toBeGreaterThanOrEqual(1);
    const etag = r.headers.get('ETag')!;
    expect(etag).toBe(`W/"${IDS.qSingle}:1"`);
    const again = await req('/public/questions/demo-single', { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
    // a bearer token must not change the response or headers
    const withTok = await req('/public/questions/demo-single', { token: await token(IDS.user) });
    expect(await j(withTok)).toEqual(b);
    expect(withTok.headers.get('Cache-Control')).toBe(r.headers.get('Cache-Control'));
  });

  it('draft/unknown -> 404 PUBLIC_NOT_FOUND; old slug -> 301 with Location', async () => {
    const { req, state } = memoryHarness();
    const d = await req('/public/questions/demo-draft');
    expect(d.status).toBe(404);
    expect(d.headers.get('Cache-Control')).toBe('public, max-age=30, s-maxage=300');
    expect(d.headers.get('Cache-Tag')).toBe('qslug-demo-draft');
    state.redirects.set('old-single', IDS.qSingle);
    const m = await req('/public/questions/old-single');
    expect(m.status).toBe(301);
    expect(m.headers.get('Location')).toBe('/api/v1/public/questions/demo-single');
    const mb = await j(m);
    expect(mb.error.code).toBe('MOVED_PERMANENTLY');
    expect(mb.error.details).toEqual({ slug: 'demo-single', canonical_path: '/questions/demo-single' });
  });

  it('related, chapter page with pagination, search, sitemap, exam/subject pages', async () => {
    const { req } = memoryHarness();
    const rel = await j(await req('/public/questions/demo-single/related?limit=1'));
    expect(rel.data).toHaveLength(1);
    const p1 = await req('/public/chapters/jee-main-physics-kinematics?limit=2');
    expect(p1.headers.get('Cache-Control')).toContain('s-maxage=3600');
    const b1 = await j(p1);
    expect(b1.data.questions).toHaveLength(2);
    expect(b1.meta.page.next_cursor).toBeTruthy();
    const b2 = await j(await req(`/public/chapters/jee-main-physics-kinematics?limit=2&cursor=${b1.meta.page.next_cursor}`));
    expect(b2.data.questions).toHaveLength(1);
    expect(b2.meta.page.next_cursor).toBeNull();
    const s = await req('/public/search?q=demo');
    expect(s.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    expect((await j(s)).data.length).toBe(3);
    const sm = await req('/public/sitemap/questions');
    expect((await j(sm)).data).toEqual([expect.objectContaining({ canonical_path: '/questions/demo-multi', slug: 'demo-multi', exam_slug: 'jee-main' })]);
    expect((await j(await req('/public/exams/jee-main'))).data.subjects[0].published_question_count).toBe(3);
    expect((await j(await req('/public/subjects/jee-main-physics'))).data.chapters).toHaveLength(2);
  });
});

describe('practice', () => {
  it('practice list never leaks answers/solutions (deep key scan)', async () => {
    const { req } = memoryHarness();
    const r = await req('/practice/questions?exam=jee-main');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    const raw = await r.text();
    const keys = allKeys(JSON.parse(raw));
    for (const k of PRACTICE_FORBIDDEN_KEYS) expect(keys.has(k), `leaked key ${k}`).toBe(false);
    expect(JSON.parse(raw).data).toHaveLength(3);
    // option ids are exposed, but nothing marks the right one
    expect(raw).not.toContain('Because physics');
  });

  it('session creation is idempotent and the session detail hides solutions until attempted', async () => {
    const { req } = memoryHarness();
    const t = await token(IDS.user);
    const body = { client_request_id: id(7001), mode: 'CHAPTER', exam: 'jee-main', chapter: 'jee-main-physics-kinematics', size: 2 };
    const a = await req('/practice/sessions', { method: 'POST', token: t, json: body });
    expect(a.status).toBe(201);
    expect(a.headers.get('Cache-Control')).toBe('private, no-store');
    const ab = await j(a);
    const again = await req('/practice/sessions', { method: 'POST', token: t, json: body });
    expect(again.status).toBe(200);
    const bb = await j(again);
    expect(bb.meta.replayed).toBe(true);
    expect(bb.data.session.id).toBe(ab.data.session.id);
    const keys = allKeys(ab.data.questions);
    for (const k of PRACTICE_FORBIDDEN_KEYS) expect(keys.has(k)).toBe(false);
    const detail = await j(await req(`/practice/sessions/${ab.data.session.id}`, { token: t }));
    expect(detail.data.items.every((i: any) => i.attempt === null)).toBe(true);
    // mode requirements and no-eligible
    const bad = await req('/practice/sessions', { method: 'POST', token: t, json: { client_request_id: id(7002), mode: 'TOPIC', exam: 'jee-main' } });
    expect(bad.status).toBe(400);
    const none = await req('/practice/sessions', { method: 'POST', token: t, json: { client_request_id: id(7003), mode: 'MISTAKES', exam: 'jee-main' } });
    expect(none.status).toBe(422);
    expect((await j(none)).error.details).toEqual({ reason: 'NO_QUESTIONS' });
    // other users get 404
    const other = await req(`/practice/sessions/${ab.data.session.id}`, { token: await token(IDS.user2) });
    expect(other.status).toBe(404);
  });

  it('attempts: grading, replay 200, conflict 409, ALREADY_ATTEMPTED, mismatches', async () => {
    const { req } = memoryHarness();
    const t = await token(IDS.user);
    const optB = id(1002 * 0 + 1000 + 2); // option id of qSingle option 2 (id = q*10+n)
    const correct = `00000000-0000-4000-8000-${String(IDS.qSingle.slice(-3) === '100' ? 1002 : 0).padStart(12, '0')}`;
    const wrong = `00000000-0000-4000-8000-${String(1001).padStart(12, '0')}`;
    void optB;
    const sess = await j(await req('/practice/sessions', { method: 'POST', token: t, json: { client_request_id: id(7100), mode: 'MIXED', exam: 'jee-main', size: 3 } }));
    const sid = sess.data.session.id;
    const attempt = (cid: string, resp: unknown, extra: Record<string, unknown> = {}) =>
      req('/practice/attempts', { method: 'POST', token: t, json: { client_attempt_id: cid, question_id: IDS.qSingle, response: resp, ...extra } });
    // not in session? qSingle may be in session; use no session first
    const r1 = await attempt(id(8001), { type: 'SINGLE_MCQ', option_id: correct });
    expect(r1.status).toBe(201);
    const b1 = await j(r1);
    expect(b1.data.is_correct).toBe(true);
    expect(b1.data.score).toBe('4');
    expect(b1.data.correct_answer.correct_labels).toEqual(['B']);
    expect(b1.data.solution.summary).toBe('Because physics.');
    // replay
    const r2 = await attempt(id(8001), { type: 'SINGLE_MCQ', option_id: correct });
    expect(r2.status).toBe(200);
    const b2 = await j(r2);
    expect(b2.meta.replayed).toBe(true);
    expect(b2.data.attempt_id).toBe(b1.data.attempt_id);
    // conflict
    const r3 = await attempt(id(8001), { type: 'SINGLE_MCQ', option_id: wrong });
    expect(r3.status).toBe(409);
    expect((await j(r3)).error.code).toBe('IDEMPOTENCY_CONFLICT');
    // wrong -> negative marks; header must equal id
    const r4 = await req('/practice/attempts', { method: 'POST', token: t, headers: { 'Idempotency-Key': id(8002) }, json: { client_attempt_id: id(8002), question_id: IDS.qSingle, response: { type: 'SINGLE_MCQ', option_id: wrong } } });
    expect((await j(r4)).data.score).toBe('-1');
    const r5 = await req('/practice/attempts', { method: 'POST', token: t, headers: { 'Idempotency-Key': id(8999) }, json: { client_attempt_id: id(8003), question_id: IDS.qSingle, response: { type: 'SINGLE_MCQ', option_id: wrong } } });
    expect(r5.status).toBe(400);
    // type mismatch / unknown option / draft question / numerical decimals
    expect((await attempt(id(8004), { type: 'NUMERICAL', value: '1' })).status).toBe(400);
    expect((await attempt(id(8005), { type: 'SINGLE_MCQ', option_id: id(424242) })).status).toBe(400);
    const draft = await req('/practice/attempts', { method: 'POST', token: t, json: { client_attempt_id: id(8006), question_id: IDS.qDraft, response: { type: 'SINGLE_MCQ', option_id: id(1021) } } });
    expect(draft.status).toBe(404);
    const num = await req('/practice/attempts', { method: 'POST', token: t, json: { client_attempt_id: id(8007), question_id: IDS.qNum, response: { type: 'NUMERICAL', value: '2.500' } } });
    expect((await j(num)).data.is_correct).toBe(true);
    // session: ALREADY_ATTEMPTED with a different client_attempt_id
    const inSession = sess.data.questions.find((q: any) => q.id === IDS.qSingle) ? IDS.qSingle : sess.data.questions[0].id;
    const sq = sess.data.questions.find((q: any) => q.id === inSession);
    const opt = sq.options[0]?.id ?? id(1);
    const body = (cid: string) => ({ client_attempt_id: cid, question_id: inSession, session_id: sid, response: sq.question_type === 'NUMERICAL' ? { type: 'NUMERICAL', value: '1' } : { type: sq.question_type, ...(sq.question_type === 'SINGLE_MCQ' ? { option_id: opt } : { option_ids: [opt] }) } });
    const s1 = await req('/practice/attempts', { method: 'POST', token: t, json: body(id(8010)) });
    expect(s1.status).toBe(201);
    expect((await j(s1)).data.session.attempted_count).toBe(1);
    const s2 = await req('/practice/attempts', { method: 'POST', token: t, json: body(id(8011)) });
    expect(s2.status).toBe(409);
    expect((await j(s2)).error.code).toBe('ALREADY_ATTEMPTED');
    // abandon
    const ab = await req(`/practice/sessions/${sid}/abandon`, { method: 'POST', token: t });
    expect((await j(ab)).data.status).toBe('ABANDONED');
    expect((await req(`/practice/sessions/${sid}/abandon`, { method: 'POST', token: t })).status).toBe(409);
  });
});

describe('student endpoints', () => {
  it('me / patch / preferences', async () => {
    const { req } = memoryHarness();
    const t = await token(IDS.user, { email: 'a@test.local' });
    const me = await j(await req('/users/me', { token: t }));
    expect(me.data).toEqual(expect.objectContaining({ id: IDS.user, email: 'a@test.local', timezone: 'Asia/Kolkata', roles: [] }));
    const p = await j(await req('/users/me', { method: 'PATCH', token: t, json: { display_name: 'Asha', target_exam: 'jee-main', daily_goal_attempts: 3 } }));
    expect(p.data.display_name).toBe('Asha');
    expect(p.data.target_exam.slug).toBe('jee-main');
    expect((await req('/users/me', { method: 'PATCH', token: t, json: {} })).status).toBe(400);
    expect((await req('/users/me', { method: 'PATCH', token: t, json: { timezone: 'Mars/Base' } })).status).toBe(400);
    const prefs = await j(await req('/users/me/exam-preferences', { method: 'PUT', token: t, json: { preferences: [{ exam: 'jee-main', is_primary: true }] } }));
    expect(prefs.data.exam_preferences).toHaveLength(1);
  });

  it('bookmarks CRUD, mistakes, progress, streak after attempts', async () => {
    const { req } = memoryHarness();
    const t = await token(IDS.user);
    const c1 = await req('/users/me/bookmarks', { method: 'POST', token: t, json: { question_id: IDS.qSingle, note: 'hard' } });
    expect(c1.status).toBe(201);
    expect((await req('/users/me/bookmarks', { method: 'POST', token: t, json: { question_id: IDS.qSingle, note: 'x' } })).status).toBe(200);
    expect((await req('/users/me/bookmarks', { method: 'POST', token: t, json: { question_id: IDS.qDraft } })).status).toBe(404);
    const list = await j(await req('/users/me/bookmarks', { token: t }));
    expect(list.data).toHaveLength(1);
    expect(list.data[0].note).toBe('x');
    expect((await req(`/users/me/bookmarks/${IDS.qSingle}`, { method: 'DELETE', token: t })).status).toBe(204);
    expect((await req(`/users/me/bookmarks/${IDS.qSingle}`, { method: 'DELETE', token: t })).status).toBe(204);

    const wrong = id(1001);
    for (let i = 0; i < 5; i++) {
      await req('/practice/attempts', { method: 'POST', token: t, json: { client_attempt_id: id(9000 + i), question_id: IDS.qSingle, response: { type: 'SINGLE_MCQ', option_id: wrong } } });
    }
    const mistakes = await j(await req('/users/me/mistakes', { token: t }));
    expect(mistakes.data[0].wrong_count).toBe(5);
    const prog = await j(await req('/users/me/progress?exam=jee-main', { token: t }));
    expect(prog.data.totals).toEqual(expect.objectContaining({ attempts: 5, correct: 0, accuracy: 0, distinct_chapters: 1 }));
    expect(prog.data.weak_areas[0].reason).toBe('LOW_ACCURACY');
    const st = await j(await req('/users/me/streak', { token: t }));
    expect(st.data).toEqual(expect.objectContaining({ current_streak: 1, today_attempts: 5, goal_met_today: true, daily_goal_attempts: 2 }));
    expect(st.data.last_7_days).toHaveLength(7);
    const hist = await j(await req('/users/me/attempts', { token: t }));
    expect(hist.data).toHaveLength(5);
    expect((await req(`/users/me/mistakes/${IDS.qSingle}`, { method: 'DELETE', token: t })).status).toBe(204);
    expect((await j(await req('/users/me/mistakes', { token: t }))).data).toHaveLength(0);
    // another user sees nothing
    const t2 = await token(IDS.user2);
    expect((await j(await req('/users/me/attempts', { token: t2 }))).data).toHaveLength(0);
  });

  it('doubts: guest + user, never public, daily cap', async () => {
    const { req, state } = memoryHarness();
    const g = await req('/doubts', { method: 'POST', json: { body: 'why?', question_id: IDS.qSingle } });
    expect(g.status).toBe(202);
    expect(state.doubts[0]).toEqual(expect.objectContaining({ user_id: null, is_public: false }));
    expect(state.doubts[0]!.ip_hash).toBeTruthy();
    const t = await token(IDS.user);
    const u = await req('/doubts', { method: 'POST', token: t, json: { body: 'how?' } });
    expect(u.status).toBe(202);
    expect(state.doubts[1]!.user_id).toBe(IDS.user);
    expect((await req('/doubts', { method: 'POST', json: { body: 'x', question_id: IDS.qDraft } })).status).toBe(404);
    expect((await j(await req('/users/me/doubts', { token: t }))).data).toHaveLength(1);
    for (let i = 0; i < 25; i++) await req('/doubts', { method: 'POST', token: t, json: { body: `d${i}` } });
    expect((await req('/doubts', { method: 'POST', token: t, json: { body: 'over' } })).status).toBe(429);
  });

  it('uploads: magic bytes, size, type; signed file round trip', async () => {
    const { req, storage } = memoryHarness();
    const t = await token(IDS.user);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const ok = await req('/uploads', { method: 'POST', token: t, headers: { 'Content-Type': 'image/png', 'X-Upload-Purpose': 'DOUBT_ATTACHMENT' }, body: png });
    expect(ok.status).toBe(201);
    const body = await j(ok);
    expect(body.data.mime_type).toBe('image/png');
    const path = new URL(body.data.url).pathname.replace('/api/v1', '');
    const file = await req(path);
    expect(file.status).toBe(200);
    expect(file.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect((await req(`${path}x`)).status).toBe(403);
    const lie = await req('/uploads', { method: 'POST', token: t, headers: { 'Content-Type': 'image/jpeg', 'X-Upload-Purpose': 'DOUBT_ATTACHMENT' }, body: png });
    expect(lie.status).toBe(415);
    const svg = await req('/uploads', { method: 'POST', token: t, headers: { 'Content-Type': 'image/svg+xml', 'X-Upload-Purpose': 'DOUBT_ATTACHMENT' }, body: '<svg/>' });
    expect(svg.status).toBe(415);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(png);
    const huge = await req('/uploads', { method: 'POST', token: t, headers: { 'Content-Type': 'image/png', 'X-Upload-Purpose': 'DOUBT_ATTACHMENT' }, body: big });
    expect(huge.status).toBe(413);
    void storage;
  });
});

describe('auth matrix', () => {
  it('every secured operation: 401 without token, anonymous -> ACCOUNT_REQUIRED, admin routes 403 without role', async () => {
    const { req } = memoryHarness();
    const doc = (await (await req('/openapi.json')).json()) as { paths: Record<string, Record<string, { security?: unknown }>> };
    const anon = await token(IDS.user, { is_anonymous: true });
    const plain = await token(IDS.user);
    let n = 0;
    for (const [path, ops] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        if (!op.security) continue;
        const url = path.replace(/\{[^}]+\}/g, id(1)).replace('/files/' + id(1), '/files/x');
        const init = { method: method.toUpperCase(), json: method === 'get' || method === 'delete' ? undefined : {} };
        const noTok = await req(url, init);
        const OPTIONAL_AUTH = ['/doubts', '/problems', '/problems/summary', '/problems/{number}', '/entitlements'];
        if (OPTIONAL_AUTH.includes(path)) {
          expect(noTok.status, `${method} ${path}`).not.toBe(401); // optional auth
          continue;
        }
        expect(noTok.status, `${method} ${path} no token`).toBe(401);
        const a = await req(url, { ...init, token: anon });
        if (path !== '/doubts') expect(a.status, `${method} ${path} anon`).toBe(403);
        if (path.startsWith('/admin/')) {
          const p = await req(url, { ...init, token: plain });
          expect(p.status, `${method} ${path} plain`).toBe(403);
        }
        n++;
      }
    }
    expect(n).toBeGreaterThan(40);
  });

  it('reviewer cannot hit admin-only routes; roles enforce content edit split', async () => {
    const { req } = memoryHarness();
    const rev = await token(IDS.reviewer);
    expect((await req('/admin/sources', { token: rev })).status).toBe(403);
    expect((await req('/admin/questions', { token: rev })).status).toBe(200);
    const patch = await req(`/admin/questions/${IDS.qDraft}`, { method: 'PATCH', token: rev, json: { expected_row_version: 1, marks: '3' } });
    expect(patch.status).toBe(403);
    const meta = await req(`/admin/questions/${IDS.qDraft}`, { method: 'PATCH', token: rev, json: { expected_row_version: 1, difficulty: 'HARD' } });
    expect(meta.status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('returns 429 with Retry-After once the class limit is exceeded', async () => {
    const { req } = memoryHarness({ rateLimiter: createMemoryRateLimiter({ RL_SEARCH: { limit: 2, periodSec: 60 } }) });
    expect((await req('/public/search?q=demo')).status).toBe(200);
    expect((await req('/public/search?q=demo')).status).toBe(200);
    const r = await req('/public/search?q=demo');
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await j(r)).error.code).toBe('RATE_LIMITED');
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('admin workflow', () => {
  it('approve -> publish -> unpublish records purge tags; guard 422; VERSION_CONFLICT', async () => {
    const { req, state, invalidator } = memoryHarness();
    const adm = await token(IDS.admin);
    const solId = state.solutions.find((s) => s.question_id === IDS.qDraft)!.id;

    // publish before approval -> 422 with unmet[]
    const early = await req(`/admin/questions/${IDS.qDraft}/publish`, { method: 'POST', token: adm, json: { expected_row_version: 1 } });
    expect(early.status).toBe(422);
    const eb = await j(early);
    expect(eb.error.code).toBe('PUBLISH_REQUIREMENTS_NOT_MET');
    expect(eb.error.details.unmet.length).toBeGreaterThan(0);

    // version conflict
    const conflict = await req(`/admin/questions/${IDS.qDraft}/approve`, { method: 'POST', token: adm, json: { solution_version_id: solId, expected_row_version: 99 } });
    expect(conflict.status).toBe(409);
    expect((await j(conflict)).error).toEqual(expect.objectContaining({ code: 'VERSION_CONFLICT', details: { current_row_version: 1 } }));

    const ap = await req(`/admin/questions/${IDS.qDraft}/approve`, { method: 'POST', token: adm, json: { solution_version_id: solId, expected_row_version: 1, note: 'ok' } });
    expect(ap.status).toBe(200);
    const apb = await j(ap);
    expect(apb.data.verification_status).toBe('HUMAN_VERIFIED');
    expect(apb.data.answer_key_source).toBe('HUMAN');
    expect(apb.data.current_solution_id).toBe(solId);
    expect(ap.headers.get('Cache-Control')).toBe('private, no-store');
    const v = apb.data.row_version;

    // approve again -> invalid state
    const again = await req(`/admin/questions/${IDS.qDraft}/approve`, { method: 'POST', token: adm, json: { solution_version_id: solId, expected_row_version: v } });
    expect(again.status).toBe(409);
    expect((await j(again)).error.code).toBe('INVALID_STATE_TRANSITION');

    expect((await req('/public/questions/demo-draft')).status).toBe(404);
    const pub = await req(`/admin/questions/${IDS.qDraft}/publish`, { method: 'POST', token: adm, json: { expected_row_version: v } });
    expect(pub.status).toBe(200);
    expect((await j(pub)).data.publication_status).toBe('PUBLISHED');
    expect(invalidator.calls).toHaveLength(1);
    expect(invalidator.calls[0]).toEqual(
      expect.arrayContaining([`q-${IDS.qDraft}`, 'qslug-demo-draft', `ch-${IDS.chapter}`, `sub-${IDS.subject}`, `exam-${IDS.exam}`, 'qlist', 'sitemap', 'search']),
    );
    expect((await req('/public/questions/demo-draft')).status).toBe(200);

    // content edits on a published question -> 409; metadata ok
    const edit = await req(`/admin/questions/${IDS.qDraft}`, { method: 'PATCH', token: adm, json: { expected_row_version: v + 1, marks: '3' } });
    expect(edit.status).toBe(409);
    expect((await j(edit)).error.code).toBe('INVALID_STATE_TRANSITION');

    const un = await req(`/admin/questions/${IDS.qDraft}/unpublish`, { method: 'POST', token: adm, json: { expected_row_version: v + 1, reason: 'typo found' } });
    expect(un.status).toBe(200);
    expect((await j(un)).data.publication_status).toBe('DRAFT');
    expect(invalidator.calls).toHaveLength(2);
    expect((await req('/public/questions/demo-draft')).status).toBe(404);

    const hist = await j(await req(`/admin/questions/${IDS.qDraft}/verification`, { token: adm }));
    expect(hist.data.review_events.map((e: any) => e.action)).toEqual(['UNPUBLISH', 'PUBLISH', 'APPROVE']);
    expect(state.audit.map((a) => a.action)).toEqual(expect.arrayContaining(['question.approve', 'question.publish', 'question.unpublish']));
  });

  it('dispute auto-unpublishes and purges; solutions, run verification, queue, sources', async () => {
    const { req, invalidator } = memoryHarness();
    const adm = await token(IDS.admin);
    const d = await req(`/admin/questions/${IDS.qMulti}/dispute`, { method: 'POST', token: adm, json: { reason: 'key looks wrong' } });
    expect(d.status).toBe(200);
    const db = await j(d);
    expect(db.data.verification_status).toBe('DISPUTED');
    expect(db.data.publication_status).toBe('DRAFT');
    expect(invalidator.calls).toHaveLength(1);
    expect((await req('/public/questions/demo-multi')).status).toBe(404);

    const sol = await req(`/admin/questions/${IDS.qDraft}/solutions`, {
      method: 'POST',
      token: adm,
      json: { final_answer: { type: 'SINGLE_MCQ', correct_option_ids: [id(1021)] }, steps: [{ index: 1, title: null, blocks: [{ type: 'paragraph', text: 'x' }] }], edit_note: 'rewrite' },
    });
    expect(sol.status).toBe(201);
    const sb = await j(sol);
    expect(sb.data.version).toBe(2);
    expect(sb.data.provenance).toBe('HUMAN_AUTHORED');
    expect((await req(`/admin/questions/${IDS.qDraft}/solutions/${sb.data.id}`, { token: adm })).status).toBe(200);

    const run = await req(`/admin/questions/${IDS.qDraft}/verification/run`, { method: 'POST', token: adm, json: { stages: ['SOLVE', 'VERIFY'], force: true } });
    expect(run.status).toBe(202);
    const q = await j(await req('/admin/verification/queue', { token: adm }));
    expect(q.data.some((x: any) => x.id === IDS.qDraft)).toBe(true);

    const src = await req('/admin/sources', { method: 'POST', token: adm, json: { code: 'NEWSRC', name: 'New', kind: 'LICENSED_PUBLISHER', reuse_permitted: false } });
    expect(src.status).toBe(201);
    const sid = (await j(src)).data.id;
    const approve = await req(`/admin/sources/${sid}/approve`, { method: 'POST', token: adm, json: { reuse_permitted: true, license_name: 'CC-BY', note: 'written permission received' } });
    expect((await j(approve)).data.approved_at).toBeTruthy();
    expect((await req('/admin/ingestion/jobs', { token: adm })).status).toBe(200);
  });
});

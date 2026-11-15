import { describe, expect, it } from 'vitest';
import { AttemptResultSchema, SessionListItemSchema, ActivityDaySchema, MeSchema, PRACTICE_FORBIDDEN_KEYS } from '@projectx/contracts';
import { IDS, allKeys, id, memoryHarness, token } from './helpers';

type J = { data?: any; meta?: any; error?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<J> => (await r.json()) as J;

const base = { mode: 'CHAPTER', exam: 'jee-main', chapter: 'jee-main-physics-kinematics' } as const;

describe('B0 sitemap entries carry slug + exam_slug', () => {
  it('lists slug and exam_slug next to canonical_path', async () => {
    const { req } = memoryHarness();
    const r = await j(await req('/public/sitemap/questions'));
    expect(r.data).toEqual([expect.objectContaining({ canonical_path: '/questions/demo-multi', slug: 'demo-multi', exam_slug: 'jee-main' })]);
  });
});

describe('B1 profile class_level + onboarding_completed', () => {
  it('Me returns the new fields and PATCH sets them', async () => {
    const { req } = memoryHarness();
    const t = await token(IDS.user);
    const me = await j(await req('/users/me', { token: t }));
    expect(MeSchema.parse(me.data)).toMatchObject({ class_level: null, onboarding_completed: false });
    const p = await j(await req('/users/me', { method: 'PATCH', token: t, json: { class_level: '12', onboarding_completed: true } }));
    expect(p.data).toMatchObject({ class_level: '12', onboarding_completed: true });
    const cleared = await j(await req('/users/me', { method: 'PATCH', token: t, json: { class_level: null } }));
    expect(cleared.data.class_level).toBeNull();
    expect(cleared.data.onboarding_completed).toBe(true);
    expect((await req('/users/me', { method: 'PATCH', token: t, json: { class_level: '10' } })).status).toBe(400);
  });
});

describe('B4 session ui_mode + time limit', () => {
  it('defaults to learning, stores test mode and time limit, validates range', async () => {
    const { req } = memoryHarness();
    const t = await token(IDS.user);
    const a = await j(await req('/practice/sessions', { method: 'POST', token: t, json: { ...base, client_request_id: id(7101), size: 2 } }));
    expect(a.data.session).toMatchObject({ ui_mode: 'learning', time_limit_sec: null });
    const bodyB = { ...base, client_request_id: id(7102), size: 2, ui_mode: 'test', time_limit_sec: 600 };
    const b = await j(await req('/practice/sessions', { method: 'POST', token: t, json: bodyB }));
    expect(b.data.session).toMatchObject({ ui_mode: 'test', time_limit_sec: 600 });
    // replay returns the stored values
    const again = await j(await req('/practice/sessions', { method: 'POST', token: t, json: bodyB }));
    expect(again.meta.replayed).toBe(true);
    expect(again.data.session).toMatchObject({ ui_mode: 'test', time_limit_sec: 600 });
    const detail = await j(await req(`/practice/sessions/${b.data.session.id}`, { token: t }));
    expect(detail.data.session).toMatchObject({ ui_mode: 'test', time_limit_sec: 600 });
    for (const bad of [{ time_limit_sec: 30 }, { time_limit_sec: 99999 }, { ui_mode: 'exam' }]) {
      const r = await req('/practice/sessions', { method: 'POST', token: t, json: { ...base, client_request_id: id(7103), ...bad } });
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
  });
});

describe('B2 AttemptResult echoes the response and time', () => {
  it('attempt result and resumed session items carry response + time_spent_ms; practice DTOs stay clean', async () => {
    const { req } = memoryHarness();
    const t = await token(IDS.user);
    const s = await j(await req('/practice/sessions', { method: 'POST', token: t, json: { ...base, client_request_id: id(7201), size: 3 } }));
    const q = s.data.questions.find((x: any) => x.question_type === 'SINGLE_MCQ');
    const optionId = q.options[1].id;
    const att = await req('/practice/attempts', {
      method: 'POST',
      token: t,
      json: { client_attempt_id: id(7202), question_id: q.id, session_id: s.data.session.id, response: { type: 'SINGLE_MCQ', option_id: optionId }, time_spent_ms: 4321 },
    });
    expect(att.status).toBe(201);
    const ab = await j(att);
    expect(AttemptResultSchema.parse(ab.data)).toMatchObject({ response: { type: 'SINGLE_MCQ', option_id: optionId }, time_spent_ms: 4321 });
    const detail = await j(await req(`/practice/sessions/${s.data.session.id}`, { token: t }));
    const item = detail.data.items.find((i: any) => i.question.id === q.id);
    expect(item.attempt).toMatchObject({ response: { type: 'SINGLE_MCQ', option_id: optionId }, time_spent_ms: 4321 });
    // time omitted -> null
    const q2 = s.data.questions.find((x: any) => x.id !== q.id && x.question_type === 'NUMERICAL');
    const a2 = await j(await req('/practice/attempts', { method: 'POST', token: t, json: { client_attempt_id: id(7203), question_id: q2.id, session_id: s.data.session.id, response: { type: 'NUMERICAL', value: '2.5' } } }));
    expect(a2.data).toMatchObject({ is_correct: true, response: { type: 'NUMERICAL', value: '2.5' }, time_spent_ms: null });
    // the practice question DTO (pre-attempt) is still free of answers
    const keys = allKeys(s.data.questions);
    for (const k of PRACTICE_FORBIDDEN_KEYS) expect(keys.has(k)).toBe(false);
    expect(keys.has('response')).toBe(false);
  });
});

describe('B3 GET /practice/sessions', () => {
  it('lists my sessions newest-first with status filter, refs and pagination; others see nothing', async () => {
    const { req, state } = memoryHarness();
    const t = await token(IDS.user);
    const mk = async (n: number, extra: Record<string, unknown> = {}) =>
      (await j(await req('/practice/sessions', { method: 'POST', token: t, json: { ...base, client_request_id: id(n), size: 1, ...extra } }))).data.session.id as string;
    const s1 = await mk(7301);
    state.sessions.find((s) => s.id === s1)!.last_activity_at = new Date('2026-11-14T08:00:00Z');
    const s2 = await mk(7302, { ui_mode: 'test', time_limit_sec: 120 });
    state.sessions.find((s) => s.id === s2)!.last_activity_at = new Date('2026-11-14T09:00:00Z');
    const s3 = await mk(7303, { mode: 'MIXED', chapter: undefined });
    state.sessions.find((s) => s.id === s3)!.last_activity_at = new Date('2026-11-14T10:00:00Z');
    await req(`/practice/sessions/${s1}/abandon`, { method: 'POST', token: t });

    const all = await req('/practice/sessions', { token: t });
    expect(all.headers.get('Cache-Control')).toBe('private, no-store');
    const ab = await j(all);
    expect(ab.data.map((x: any) => x.id)).toEqual([s3, s2, s1]);
    for (const x of ab.data) SessionListItemSchema.parse(x);
    expect(ab.data[1]).toMatchObject({ ui_mode: 'test', time_limit_sec: 120, status: 'ACTIVE', completed_at: null });
    expect(ab.data[1].exam.slug).toBe('jee-main');
    expect(ab.data[1].chapter.slug).toBe('jee-main-physics-kinematics');
    expect(ab.data[0].subject).toBeNull();

    const active = await j(await req('/practice/sessions?status=ACTIVE', { token: t }));
    expect(active.data.map((x: any) => x.id)).toEqual([s3, s2]);
    const multi = await j(await req('/practice/sessions?status=ACTIVE,ABANDONED', { token: t }));
    expect(multi.data).toHaveLength(3);
    expect((await req('/practice/sessions?status=BOGUS', { token: t })).status).toBe(400);

    const p1 = await j(await req('/practice/sessions?limit=2', { token: t }));
    expect(p1.data.map((x: any) => x.id)).toEqual([s3, s2]);
    expect(p1.meta.page.next_cursor).toBeTruthy();
    const p2 = await j(await req(`/practice/sessions?limit=2&cursor=${p1.meta.page.next_cursor}`, { token: t }));
    expect(p2.data.map((x: any) => x.id)).toEqual([s1]);
    expect(p2.meta.page.next_cursor).toBeNull();

    expect((await j(await req('/practice/sessions', { token: await token(IDS.user2) }))).data).toEqual([]);
    expect((await req('/practice/sessions')).status).toBe(401);
  });
});

describe('B5 POST /practice/sessions/:id/complete', () => {
  it('completes an active session, is idempotent, rejects abandoned, 404 for others', async () => {
    const { req } = memoryHarness();
    const t = await token(IDS.user);
    const s = await j(await req('/practice/sessions', { method: 'POST', token: t, json: { ...base, client_request_id: id(7401), size: 3 } }));
    const sid = s.data.session.id;
    const q = s.data.questions[0];
    await req('/practice/attempts', { method: 'POST', token: t, json: { client_attempt_id: id(7402), question_id: q.id, session_id: sid, response: q.question_type === 'NUMERICAL' ? { type: 'NUMERICAL', value: '2.5' } : q.question_type === 'SINGLE_MCQ' ? { type: 'SINGLE_MCQ', option_id: q.options[0].id } : { type: 'MULTI_MCQ', option_ids: [q.options[0].id] } } });

    const done = await req(`/practice/sessions/${sid}/complete`, { method: 'POST', token: t });
    expect(done.status).toBe(200);
    expect(done.headers.get('Cache-Control')).toBe('private, no-store');
    const db = await j(done);
    expect(db.data).toMatchObject({ id: sid, status: 'COMPLETED', attempted_count: 1, total: 3 });
    const again = await j(await req(`/practice/sessions/${sid}/complete`, { method: 'POST', token: t }));
    expect(again.data).toEqual(db.data);
    const detail = await j(await req(`/practice/sessions/${sid}`, { token: t }));
    expect(detail.data.session.completed_at).toBeTruthy();
    // attempts after completion are rejected
    const q1 = s.data.questions[1];
    const lateResponse = q1.question_type === 'NUMERICAL' ? { type: 'NUMERICAL', value: '1' } : q1.question_type === 'SINGLE_MCQ' ? { type: 'SINGLE_MCQ', option_id: q1.options[0].id } : { type: 'MULTI_MCQ', option_ids: [q1.options[0].id] };
    const late = await req('/practice/attempts', { method: 'POST', token: t, json: { client_attempt_id: id(7403), question_id: q1.id, session_id: sid, response: lateResponse } });
    expect(late.status).toBe(409);

    const ab = await j(await req('/practice/sessions', { method: 'POST', token: t, json: { ...base, client_request_id: id(7404), size: 2, filters: { exclude_correct: false } } }));
    await req(`/practice/sessions/${ab.data.session.id}/abandon`, { method: 'POST', token: t });
    const bad = await req(`/practice/sessions/${ab.data.session.id}/complete`, { method: 'POST', token: t });
    expect(bad.status).toBe(409);
    expect((await j(bad)).error.code).toBe('INVALID_STATE_TRANSITION');

    expect((await req(`/practice/sessions/${sid}/complete`, { method: 'POST', token: await token(IDS.user2) })).status).toBe(404);
    expect((await req(`/practice/sessions/${id(999)}/complete`, { method: 'POST', token: t })).status).toBe(404);
  });
});

describe('B6 GET /users/me/activity', () => {
  it('returns ascending per-day rows with time, honours from/to, defaults to 120 days, validates', async () => {
    const { req, state } = memoryHarness({ clock: () => new Date('2026-11-14T10:00:00Z') });
    const t = await token(IDS.user);
    const wrong = id(1001);
    await req('/practice/attempts', { method: 'POST', token: t, json: { client_attempt_id: id(7501), question_id: IDS.qSingle, response: { type: 'SINGLE_MCQ', option_id: wrong }, time_spent_ms: 1500 } });
    await req('/practice/attempts', { method: 'POST', token: t, json: { client_attempt_id: id(7502), question_id: IDS.qNum, response: { type: 'NUMERICAL', value: '2.5' }, time_spent_ms: 2500 } });
    // an older day, inserted directly
    state.daily.push({ user_id: IDS.user, activity_date: '2026-10-01', attempts_count: 4, correct_count: 3, total_time_ms: 9000 });
    state.daily.push({ user_id: IDS.user, activity_date: '2025-01-01', attempts_count: 1, correct_count: 1, total_time_ms: 100 });

    const r = await req('/users/me/activity', { token: t });
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    const rb = await j(r);
    for (const d of rb.data) ActivityDaySchema.parse(d);
    expect(rb.data).toEqual([
      { date: '2026-10-01', attempts: 4, correct: 3, total_time_ms: 9000 },
      { date: '2026-11-14', attempts: 2, correct: 1, total_time_ms: 4000 },
    ]);
    const ranged = await j(await req('/users/me/activity?from=2025-01-01&to=2025-06-30', { token: t }));
    expect(ranged.data).toEqual([{ date: '2025-01-01', attempts: 1, correct: 1, total_time_ms: 100 }]);

    expect((await req('/users/me/activity?from=2025-01-01&to=2026-11-14', { token: t })).status).toBe(400); // span > 400
    expect((await req('/users/me/activity?from=2026-11-14&to=2026-11-01', { token: t })).status).toBe(400); // inverted
    expect((await req('/users/me/activity?from=2026-02-31', { token: t })).status).toBe(400); // not a date
    expect((await req('/users/me/activity?from=yesterday', { token: t })).status).toBe(400);
    expect((await j(await req('/users/me/activity', { token: await token(IDS.user2) }))).data).toEqual([]);
    expect((await req('/users/me/activity')).status).toBe(401);
  });
});

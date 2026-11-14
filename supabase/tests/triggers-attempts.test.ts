import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asSuperuser, createTestDb, createTestUser, expectPgError, insertAttempt, makeQuestion, one } from './helpers';
import type { MadeQuestion, TestDb } from './helpers';

let db: TestDb;
let q1: MadeQuestion;
let q2: MadeQuestion;
let q3: MadeQuestion;

beforeAll(async () => {
  db = await createTestDb();
  q1 = await makeQuestion(db, { stage: 'PUBLISHED' });
  q2 = await makeQuestion(db, { stage: 'PUBLISHED', chapterSlug: 'jee-main-chemistry-atomic-structure' });
  q3 = await makeQuestion(db, { stage: 'PUBLISHED', chapterSlug: 'jee-main-mathematics-integral-calculus' });
});
afterAll(() => db.close());

const streakOf = (userId: string) =>
  one<{ current_streak: number; longest_streak: number; last_active_date: string }>(
    db,
    `select current_streak, longest_streak, last_active_date::text from streaks where user_id = $1`,
    [userId],
  );

describe('attempts_before_insert', () => {
  it('snapshots exam/subject/chapter/topic from the question', async () => {
    const u = await createTestUser(db);
    const id = await insertAttempt(db, { userId: u.id, questionId: q2.id, correct: true });
    const row = await one<Record<string, string>>(
      db,
      `select a.exam_id, a.subject_id, a.chapter_id, a.topic_id, q.exam_id qe, q.subject_id qs, q.chapter_id qc, q.topic_id qt
         from attempts a join questions q on q.id = a.question_id where a.id = $1`,
      [id],
    );
    expect([row.exam_id, row.subject_id, row.chapter_id, row.topic_id]).toEqual([row.qe, row.qs, row.qc, row.qt]);
  });

  it('overrides client-supplied snapshot values', async () => {
    const u = await createTestUser(db);
    const r = await asSuperuser<{ chapter_id: string; qc: string }>(
      db,
      `insert into attempts (user_id, question_id, client_attempt_id, request_hash, response, is_correct, score, exam_id, subject_id, chapter_id, activity_date)
       select $1, q.id, gen_random_uuid(), repeat('c',64), '{}', true, 4, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), date '2000-01-01'
         from questions q where q.id = $2
       returning chapter_id, (select chapter_id from questions where id = $2) qc`,
      [u.id, q1.id],
    );
    expect(r[0]!.chapter_id).toBe(r[0]!.qc);
  });

  it('rejects questions without subject/chapter (QUESTION_NOT_PRACTICABLE)', async () => {
    const u = await createTestUser(db);
    const nochap = await makeQuestion(db, { chapterNull: true });
    await expectPgError(insertAttempt(db, { userId: u.id, questionId: nochap.id, correct: true }), { message: 'QUESTION_NOT_PRACTICABLE' });
  });

  it('activity_date uses the user timezone: IST vs America/Los_Angeles boundary', async () => {
    const ist = await createTestUser(db, { timezone: 'Asia/Kolkata' });
    const la = await createTestUser(db, { timezone: 'America/Los_Angeles' });
    // 2026-03-10T20:00Z = 2026-03-11 01:30 IST = 2026-03-10 13:00 PDT
    for (const u of [ist, la]) await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: true, submittedAt: '2026-03-10T20:00:00Z' });
    const dates = async (id: string) => (await asSuperuser<{ d: string }>(db, `select activity_date::text d from attempts where user_id = $1`, [id]))[0]!.d;
    expect(await dates(ist.id)).toBe('2026-03-11');
    expect(await dates(la.id)).toBe('2026-03-10');

    // exact IST midnight boundary: 18:29:59Z is still the 10th in IST, 18:30:00Z is the 11th
    const edge = await createTestUser(db, { timezone: 'Asia/Kolkata' });
    await insertAttempt(db, { userId: edge.id, questionId: q1.id, correct: true, submittedAt: '2026-03-10T18:29:59Z' });
    await insertAttempt(db, { userId: edge.id, questionId: q2.id, correct: true, submittedAt: '2026-03-10T18:30:00Z' });
    const rows = await asSuperuser<{ d: string }>(db, `select activity_date::text d from attempts where user_id = $1 order by submitted_at`, [edge.id]);
    expect(rows.map((r) => r.d)).toEqual(['2026-03-10', '2026-03-11']);
  });

  it('a later timezone change does not rewrite past activity dates', async () => {
    const u = await createTestUser(db, { timezone: 'Asia/Kolkata' });
    await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: true, submittedAt: '2026-03-10T20:00:00Z' });
    await asSuperuser(db, `update profiles set timezone = 'America/Los_Angeles' where id = $1`, [u.id]);
    expect((await one<{ d: string }>(db, `select activity_date::text d from attempts where user_id = $1`, [u.id])).d).toBe('2026-03-11');
  });
});

describe('attempts immutability and uniqueness', () => {
  it('UPDATE raises ATTEMPT_IMMUTABLE even for the service role', async () => {
    const u = await createTestUser(db);
    const id = await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: false });
    await expectPgError(asSuperuser(db, `update attempts set is_correct = true where id = $1`, [id]), { message: 'ATTEMPT_IMMUTABLE' });
  });
  it('(user_id, client_attempt_id) and (session_id, question_id) are unique', async () => {
    const u = await createTestUser(db);
    const cid = '11111111-1111-4111-8111-111111111111';
    const ins = (cidv: string, sid: string | null = null) =>
      asSuperuser(
        db,
        `insert into attempts (user_id, question_id, session_id, client_attempt_id, request_hash, response, is_correct, score)
         values ($1, $2, $3, $4, repeat('d',64), '{}', true, 4)`,
        [u.id, q1.id, sid, cidv],
      );
    await ins(cid);
    await expectPgError(ins(cid), { code: '23505' });

    const exam = await one<{ id: string }>(db, `select id from exams where slug = 'jee-main'`);
    const s = await one<{ id: string }>(
      db,
      `insert into practice_sessions (user_id, client_request_id, mode, exam_id, question_ids) values ($1, gen_random_uuid(), 'MIXED', $2, array[$3::uuid, $4::uuid]) returning id`,
      [u.id, exam.id, q1.id, q2.id],
    );
    await ins('22222222-2222-4222-8222-222222222222', s.id);
    await expectPgError(ins('33333333-3333-4333-8333-333333333333', s.id), { code: '23505' });
  });
  it('deleting a user cascades attempts and derived rows', async () => {
    const u = await createTestUser(db);
    await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: false });
    await asSuperuser(db, `delete from auth.users where id = $1`, [u.id]);
    for (const t of ['attempts', 'mistakes', 'daily_activity', 'streaks', 'user_chapter_stats', 'profiles']) {
      const col = t === 'profiles' ? 'id' : 'user_id';
      expect(await asSuperuser(db, `select 1 from ${t} where ${col} = $1`, [u.id]), t).toHaveLength(0);
    }
  });
});

describe('daily_activity and user_chapter_stats aggregation', () => {
  it('aggregates counts, correctness and time per day and per chapter', async () => {
    const u = await createTestUser(db, { timezone: 'UTC' });
    await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: true, submittedAt: '2026-05-01T08:00:00Z', timeMs: 1000 });
    await insertAttempt(db, { userId: u.id, questionId: q2.id, correct: false, submittedAt: '2026-05-01T09:00:00Z', timeMs: 2000 });
    await insertAttempt(db, { userId: u.id, questionId: q3.id, correct: true, submittedAt: '2026-05-01T07:00:00Z', timeMs: 500 });
    const d = await one<{ attempts_count: number; correct_count: number; total_time_ms: string; first: string; last: string }>(
      db,
      `select attempts_count, correct_count, total_time_ms::text, first_attempt_at::text first, last_attempt_at::text last from daily_activity where user_id = $1`,
      [u.id],
    );
    expect(d.attempts_count).toBe(3);
    expect(d.correct_count).toBe(2);
    expect(d.total_time_ms).toBe('3500');
    expect(d.first).toContain('07:00:00');
    expect(d.last).toContain('09:00:00');
    const stats = await asSuperuser<{ attempts_count: number; correct_count: number }>(
      db,
      `select attempts_count, correct_count from user_chapter_stats where user_id = $1 order by chapter_id`,
      [u.id],
    );
    expect(stats).toHaveLength(3);
    expect(stats.reduce((n, s) => n + s.attempts_count, 0)).toBe(3);
  });
});

describe('streak sequences', () => {
  const day = (u: string, iso: string, q = q1) => insertAttempt(db, { userId: u, questionId: q.id, correct: true, submittedAt: `${iso}T12:00:00Z` });

  it('consecutive days increment; same-day attempts are a no-op', async () => {
    const u = await createTestUser(db, { timezone: 'UTC' });
    await day(u.id, '2026-06-01');
    expect(await streakOf(u.id)).toMatchObject({ current_streak: 1, longest_streak: 1, last_active_date: '2026-06-01' });
    await day(u.id, '2026-06-01', q2);
    await day(u.id, '2026-06-01', q3);
    expect(await streakOf(u.id)).toMatchObject({ current_streak: 1, longest_streak: 1 });
    await day(u.id, '2026-06-02');
    await day(u.id, '2026-06-03');
    expect(await streakOf(u.id)).toMatchObject({ current_streak: 3, longest_streak: 3, last_active_date: '2026-06-03' });
  });

  it('a gap resets current but keeps longest', async () => {
    const u = await createTestUser(db, { timezone: 'UTC' });
    for (const d of ['2026-06-01', '2026-06-02', '2026-06-03']) await day(u.id, d);
    await day(u.id, '2026-06-06');
    expect(await streakOf(u.id)).toMatchObject({ current_streak: 1, longest_streak: 3, last_active_date: '2026-06-06' });
  });

  it('backfill into a gap recomputes islands (gaps-and-islands)', async () => {
    const u = await createTestUser(db, { timezone: 'UTC' });
    for (const d of ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-06']) await day(u.id, d);
    // backfill 06-05: islands {1-3}=3, {5-6}=2 -> current 2 (island ending at last date), longest 3
    await day(u.id, '2026-06-05');
    expect(await streakOf(u.id)).toMatchObject({ current_streak: 2, longest_streak: 3, last_active_date: '2026-06-06' });
    // backfill 06-04: single island 1..6 = 6
    await day(u.id, '2026-06-04');
    expect(await streakOf(u.id)).toMatchObject({ current_streak: 6, longest_streak: 6, last_active_date: '2026-06-06' });
  });

  it('backfill before the first-ever day recomputes correctly', async () => {
    const u = await createTestUser(db, { timezone: 'UTC' });
    await day(u.id, '2026-07-10');
    await day(u.id, '2026-07-09');
    expect(await streakOf(u.id)).toMatchObject({ current_streak: 2, longest_streak: 2, last_active_date: '2026-07-10' });
  });

  it('streak days follow the user timezone, not UTC', async () => {
    const u = await createTestUser(db, { timezone: 'Asia/Kolkata' });
    // 20:00Z on the 1st and 02:00Z on the 3rd are the 2nd (01:30 IST) and the 3rd (07:30 IST): consecutive in IST, a 2-day gap in UTC
    await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: true, submittedAt: '2026-08-01T20:00:00Z' });
    await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: true, submittedAt: '2026-08-03T02:00:00Z' });
    expect(await streakOf(u.id)).toMatchObject({ current_streak: 2, last_active_date: '2026-08-03' });
  });

  it('get_streak: effective streak is 0 when the last active day is older than yesterday (user timezone)', async () => {
    const u = await createTestUser(db, { timezone: 'Asia/Kolkata' });
    const today = (await one<{ d: string }>(db, `select (now() at time zone 'Asia/Kolkata')::date::text d`)).d;
    await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: true, submittedAt: `${today}T00:00:00+05:30`.replace(/^(\d{4}-\d\d-\d\d)/, '$1') });
    const g = async () =>
      one<{ current_streak: number; longest_streak: number; last_active_date: string | null; today: string }>(
        db,
        `select current_streak, longest_streak, last_active_date::text, today::text from app_private.get_streak($1)`,
        [u.id],
      );
    expect(await g()).toMatchObject({ current_streak: 1, last_active_date: today, today });
    // pretend the streak is stale: last active 3 days ago
    await asSuperuser(db, `update streaks set last_active_date = (now() at time zone 'Asia/Kolkata')::date - 3, current_streak = 5, longest_streak = 5 where user_id = $1`, [u.id]);
    expect(await g()).toMatchObject({ current_streak: 0, longest_streak: 5 });
    // yesterday keeps it alive
    await asSuperuser(db, `update streaks set last_active_date = (now() at time zone 'Asia/Kolkata')::date - 1 where user_id = $1`, [u.id]);
    expect(await g()).toMatchObject({ current_streak: 5 });
  });

  it('get_streak for a user without activity returns zeros', async () => {
    const u = await createTestUser(db);
    const g = await one<{ current_streak: number; longest_streak: number; last_active_date: string | null }>(
      db,
      `select current_streak, longest_streak, last_active_date::text from app_private.get_streak($1)`,
      [u.id],
    );
    expect(g).toEqual({ current_streak: 0, longest_streak: 0, last_active_date: null });
  });
});

describe('mistakes lifecycle', () => {
  const mistake = (userId: string, qid: string) =>
    one<{ wrong_count: number; resolved_at: Date | null; last_attempt_id: string }>(
      db,
      `select wrong_count, resolved_at, last_attempt_id from mistakes where user_id = $1 and question_id = $2`,
      [userId, qid],
    );

  it('wrong creates, repeated wrong increments, correct resolves, wrong reopens', async () => {
    const u = await createTestUser(db);
    const a1 = await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: false, submittedAt: '2026-04-01T10:00:00Z' });
    let m = await mistake(u.id, q1.id);
    expect(m.wrong_count).toBe(1);
    expect(m.resolved_at).toBeNull();
    expect(m.last_attempt_id).toBe(a1);

    const a2 = await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: false, submittedAt: '2026-04-02T10:00:00Z' });
    m = await mistake(u.id, q1.id);
    expect(m.wrong_count).toBe(2);
    expect(m.last_attempt_id).toBe(a2);
    const times = await one<{ f: string; l: string }>(db, `select first_wrong_at::text f, last_wrong_at::text l from mistakes where user_id = $1`, [u.id]);
    expect(times.f).toContain('2026-04-01');
    expect(times.l).toContain('2026-04-02');

    const a3 = await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: true, submittedAt: '2026-04-03T10:00:00Z' });
    m = await mistake(u.id, q1.id);
    expect(m.resolved_at).not.toBeNull();
    expect(m.wrong_count).toBe(2);
    expect(m.last_attempt_id).toBe(a3);

    await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: false, submittedAt: '2026-04-04T10:00:00Z' });
    m = await mistake(u.id, q1.id);
    expect(m.wrong_count).toBe(3);
    expect(m.resolved_at).toBeNull();
  });

  it('a correct first attempt creates no mistake', async () => {
    const u = await createTestUser(db);
    await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: true });
    expect(await asSuperuser(db, `select 1 from mistakes where user_id = $1`, [u.id])).toHaveLength(0);
  });
});

describe('practice session auto-complete', () => {
  it('counts attempts/correct/score and completes at the last question', async () => {
    const u = await createTestUser(db);
    const exam = await one<{ id: string }>(db, `select id from exams where slug = 'jee-main'`);
    const s = await one<{ id: string }>(
      db,
      `insert into practice_sessions (user_id, client_request_id, mode, exam_id, question_ids)
       values ($1, gen_random_uuid(), 'MIXED', $2, array[$3::uuid, $4::uuid]) returning id`,
      [u.id, exam.id, q1.id, q2.id],
    );
    const state = () =>
      one<{ status: string; attempted_count: number; correct_count: number; score: string; completed_at: Date | null }>(
        db,
        `select status, attempted_count, correct_count, score::text, completed_at from practice_sessions where id = $1`,
        [s.id],
      );
    await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: true, sessionId: s.id });
    expect(await state()).toMatchObject({ status: 'ACTIVE', attempted_count: 1, correct_count: 1, score: '4.00', completed_at: null });
    await insertAttempt(db, { userId: u.id, questionId: q2.id, correct: false, sessionId: s.id });
    const done = await state();
    expect(done).toMatchObject({ status: 'COMPLETED', attempted_count: 2, correct_count: 1, score: '3.00' });
    expect(done.completed_at).not.toBeNull();
  });

  it('single-question session completes immediately', async () => {
    const u = await createTestUser(db);
    const exam = await one<{ id: string }>(db, `select id from exams where slug = 'jee-main'`);
    const s = await one<{ id: string }>(
      db,
      `insert into practice_sessions (user_id, client_request_id, mode, exam_id, question_ids) values ($1, gen_random_uuid(), 'MIXED', $2, array[$3::uuid]) returning id`,
      [u.id, exam.id, q1.id],
    );
    await insertAttempt(db, { userId: u.id, questionId: q1.id, correct: true, sessionId: s.id });
    expect((await one<{ status: string }>(db, `select status from practice_sessions where id = $1`, [s.id])).status).toBe('COMPLETED');
  });

  it('session constraints: 1..50 question ids, unique client_request_id per user', async () => {
    const u = await createTestUser(db);
    const exam = await one<{ id: string }>(db, `select id from exams where slug = 'jee-main'`);
    await expectPgError(
      asSuperuser(db, `insert into practice_sessions (user_id, client_request_id, mode, exam_id, question_ids) values ($1, gen_random_uuid(), 'MIXED', $2, '{}')`, [u.id, exam.id]),
      { code: '23514' },
    );
    const rid = '44444444-4444-4444-8444-444444444444';
    const ins = () =>
      asSuperuser(db, `insert into practice_sessions (user_id, client_request_id, mode, exam_id, question_ids) values ($1, $2, 'MIXED', $3, array[$4::uuid])`, [u.id, rid, exam.id, q1.id]);
    await ins();
    await expectPgError(ins(), { code: '23505' });
  });
});

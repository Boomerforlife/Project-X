import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asSuperuser, createTestDb, createTestUser, expectPgError, insertAttempt, makeQuestion, one } from './helpers';
import type { MadeQuestion, TestDb, TestUser } from './helpers';

let db: TestDb;
let a: TestUser;
let b: TestUser;
let published: MadeQuestion;
let draft: MadeQuestion;

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  a = await createTestUser(db, { displayName: 'Alice' });
  b = await createTestUser(db, { displayName: 'Bob' });
  published = await makeQuestion(db, { stage: 'PUBLISHED' });
  draft = await makeQuestion(db, { stage: 'DRAFT' });
});
afterAll(() => db.close());

/** Student tables the owner may only read (writes come from the server). */
const SERVER_WRITTEN = ['attempts', 'practice_sessions', 'daily_activity', 'streaks', 'user_chapter_stats', 'user_uploads', 'doubts'] as const;

describe('new user bootstrap', () => {
  it('creates profile (with display name) and streak row via trigger', async () => {
    const p = await one<{ display_name: string; timezone: string }>(db, `select display_name, timezone from profiles where id = $1`, [a.id]);
    expect(p).toEqual({ display_name: 'Alice', timezone: 'Asia/Kolkata' });
    const s = await one<{ current_streak: number }>(db, `select current_streak from streaks where user_id = $1`, [a.id]);
    expect(s.current_streak).toBe(0);
  });
  it('honours a valid timezone from metadata and falls back on an invalid one', async () => {
    const la = await createTestUser(db, { timezone: 'America/Los_Angeles' });
    expect((await one<{ timezone: string }>(db, `select timezone from profiles where id = $1`, [la.id])).timezone).toBe('America/Los_Angeles');
    const bad = await createTestUser(db, { timezone: 'Mars/Phobos' });
    expect((await one<{ timezone: string }>(db, `select timezone from profiles where id = $1`, [bad.id])).timezone).toBe('Asia/Kolkata');
  });
});

describe('profiles', () => {
  it('user reads only their own profile', async () => {
    const r = await db.withUser(a.claims, (tx) => tx.query<{ id: string }>('select id from profiles'));
    expect(r.rows.map((x) => x.id)).toEqual([a.id]);
  });
  it("user cannot update another user's profile (0 rows)", async () => {
    const r = await db.withUser(a.claims, (tx) => tx.query(`update profiles set display_name = 'hacked' where id = $1`, [b.id]));
    expect(r.rowCount).toBe(0);
    expect((await one<{ display_name: string }>(db, `select display_name from profiles where id = $1`, [b.id])).display_name).toBe('Bob');
  });
  it('user can update allowed columns of own profile', async () => {
    const r = await db.withUser(a.claims, (tx) =>
      tx.query(`update profiles set display_name = 'Alice 2', timezone = 'America/Los_Angeles', daily_goal_attempts = 20 where id = $1`, [a.id]),
    );
    expect(r.rowCount).toBe(1);
    await db.withUser(a.claims, (tx) => tx.query(`update profiles set timezone = 'Asia/Kolkata' where id = $1`, [a.id]));
  });
  it('column grants: cannot update id or created_at (42501)', async () => {
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`update profiles set id = gen_random_uuid() where id = $1`, [a.id])), { code: '42501' });
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`update profiles set created_at = now() where id = $1`, [a.id])), { code: '42501' });
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`update profiles set updated_at = now() where id = $1`, [a.id])), { code: '42501' });
  });
  it('cannot insert or delete profiles (42501)', async () => {
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`insert into profiles (id) values (gen_random_uuid())`)), { code: '42501' });
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`delete from profiles`)), { code: '42501' });
  });
  it('invalid timezone is rejected by trigger', async () => {
    await expectPgError(
      db.withUser(a.claims, (tx) => tx.query(`update profiles set timezone = 'Not/AZone' where id = $1`, [a.id])),
      { message: 'INVALID_TIMEZONE' },
    );
  });
  it('profile range checks hold', async () => {
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`update profiles set daily_goal_attempts = 0 where id = $1`, [a.id])), { code: '23514' });
  });
});

describe('bookmarks', () => {
  it('user can bookmark a published question and read/update note/delete it', async () => {
    const ins = await db.withUser(a.claims, (tx) =>
      tx.query(`insert into bookmarks (user_id, question_id, note) values ($1, $2, 'n')`, [a.id, published.id]),
    );
    expect(ins.rowCount).toBe(1);
    const upd = await db.withUser(a.claims, (tx) => tx.query(`update bookmarks set note = 'changed' where question_id = $1`, [published.id]));
    expect(upd.rowCount).toBe(1);
    const sel = await db.withUser(a.claims, (tx) => tx.query<{ note: string }>(`select note from bookmarks`));
    expect(sel.rows).toEqual([{ note: 'changed' }]);
  });
  it('bookmark of an unpublished question is rejected (RLS violation 42501)', async () => {
    await expectPgError(
      db.withUser(a.claims, (tx) => tx.query(`insert into bookmarks (user_id, question_id) values ($1, $2)`, [a.id, draft.id])),
      { code: '42501' },
    );
  });
  it('bookmark of a non-existent question is rejected', async () => {
    await expectPgError(
      db.withUser(a.claims, (tx) => tx.query(`insert into bookmarks (user_id, question_id) values ($1, gen_random_uuid())`, [a.id])),
      { code: '42501' },
    );
  });
  it('cannot insert a bookmark on behalf of another user (42501)', async () => {
    await expectPgError(
      db.withUser(a.claims, (tx) => tx.query(`insert into bookmarks (user_id, question_id) values ($1, $2)`, [b.id, published.id])),
      { code: '42501' },
    );
  });
  it("user B cannot see, update or delete A's bookmark", async () => {
    const sel = await db.withUser(b.claims, (tx) => tx.query(`select * from bookmarks`));
    expect(sel.rows).toEqual([]);
    const upd = await db.withUser(b.claims, (tx) => tx.query(`update bookmarks set note = 'x'`));
    expect(upd.rowCount).toBe(0);
    const del = await db.withUser(b.claims, (tx) => tx.query(`delete from bookmarks`));
    expect(del.rowCount).toBe(0);
    expect(await asSuperuser(db, `select 1 from bookmarks where user_id = $1`, [a.id])).toHaveLength(1);
  });
  it('only the note column is updatable (42501 for question_id/user_id)', async () => {
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`update bookmarks set question_id = $1`, [draft.id])), { code: '42501' });
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`update bookmarks set user_id = $1`, [b.id])), { code: '42501' });
  });
  it('owner can delete own bookmark', async () => {
    const del = await db.withUser(a.claims, (tx) => tx.query(`delete from bookmarks where question_id = $1`, [published.id]));
    expect(del.rowCount).toBe(1);
  });
});

describe('user_exam_preferences and goals (owner CRUD)', () => {
  it('owner CRUD works and is isolated per user', async () => {
    const exam = await one<{ id: string }>(db, `select id from exams where slug = 'jee-main'`);
    await db.withUser(a.claims, (tx) => tx.query(`insert into user_exam_preferences (user_id, exam_id, is_primary) values ($1, $2, true)`, [a.id, exam.id]));
    await db.withUser(a.claims, (tx) => tx.query(`insert into goals (user_id, kind, target_value) values ($1, 'DAILY_ATTEMPTS', 15)`, [a.id]));
    expect((await db.withUser(b.claims, (tx) => tx.query(`select * from user_exam_preferences`))).rows).toEqual([]);
    expect((await db.withUser(b.claims, (tx) => tx.query(`select * from goals`))).rows).toEqual([]);
    expect((await db.withUser(b.claims, (tx) => tx.query(`update goals set target_value = 1`))).rowCount).toBe(0);
    expect((await db.withUser(b.claims, (tx) => tx.query(`delete from user_exam_preferences`))).rowCount).toBe(0);
    const upd = await db.withUser(a.claims, (tx) => tx.query(`update goals set target_value = 20 where user_id = $1`, [a.id]));
    expect(upd.rowCount).toBe(1);
    expect((await db.withUser(a.claims, (tx) => tx.query(`delete from goals`))).rowCount).toBe(1);
  });
  it('cannot write rows owned by someone else (42501)', async () => {
    const exam = await one<{ id: string }>(db, `select id from exams where slug = 'jee-main'`);
    await expectPgError(
      db.withUser(b.claims, (tx) => tx.query(`insert into user_exam_preferences (user_id, exam_id) values ($1, $2)`, [a.id, exam.id])),
      { code: '42501' },
    );
    await expectPgError(
      db.withUser(b.claims, (tx) => tx.query(`insert into goals (user_id, kind, target_value) values ($1, 'DAILY_ATTEMPTS', 5)`, [a.id])),
      { code: '42501' },
    );
  });
  it('cannot move own row to another user via UPDATE (42501)', async () => {
    const exam = await one<{ id: string }>(db, `select id from exams where slug = 'jee-main'`);
    await db.withUser(b.claims, (tx) => tx.query(`insert into goals (user_id, kind, target_value) values ($1, 'DAILY_ATTEMPTS', 5)`, [b.id]));
    await expectPgError(db.withUser(b.claims, (tx) => tx.query(`update goals set user_id = $1`, [a.id])), { code: '42501' });
    expect(exam.id).toBeTruthy();
  });
});

describe('server-written student tables', () => {
  let sessionId: string;
  beforeAll(async () => {
    const exam = await one<{ id: string }>(db, `select id from exams where slug = 'jee-main'`);
    const s = await asSuperuser<{ id: string }>(
      db,
      `insert into practice_sessions (user_id, client_request_id, mode, exam_id, question_ids)
       values ($1, gen_random_uuid(), 'MIXED', $2, array[$3::uuid]) returning id`,
      [a.id, exam.id, published.id],
    );
    sessionId = s[0]!.id;
    await insertAttempt(db, { userId: a.id, questionId: published.id, correct: false, sessionId });
    await asSuperuser(db, `insert into user_uploads (user_id, purpose, r2_key, mime_type, bytes, sha256) values ($1::uuid, 'DOUBT_ATTACHMENT', 'u/' || $1::text || '/x.png', 'image/png', 10, repeat('b', 64))`, [a.id]);
    await asSuperuser(db, `insert into doubts (user_id, body) values ($1, 'why?')`, [a.id]);
  });

  it.each(SERVER_WRITTEN)('owner can SELECT own rows from %s but not other users rows', async (table) => {
    const mine = await db.withUser(a.claims, (tx) => tx.query(`select * from ${table}`));
    expect(mine.rows.length, `${table} rows for owner`).toBeGreaterThan(0);
    const theirs = await db.withUser(b.claims, (tx) => tx.query(`select * from ${table} where user_id = $1`, [a.id]));
    expect(theirs.rows).toEqual([]);
    const own = await db.withUser(b.claims, (tx) => tx.query<{ user_id: string }>(`select user_id from ${table}`));
    expect(own.rows.every((r) => r.user_id === b.id)).toBe(true);
  });

  it.each(SERVER_WRITTEN)('authenticated cannot INSERT/UPDATE/DELETE %s (42501)', async (table) => {
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`insert into ${table} default values`)), { code: '42501' });
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`delete from ${table}`)), { code: '42501' });
  });

  it('cannot forge attempts, daily_activity, streaks, mistakes or sessions explicitly (42501)', async () => {
    await expectPgError(
      db.withUser(a.claims, (tx) =>
        tx.query(
          `insert into attempts (user_id, question_id, client_attempt_id, request_hash, response, is_correct, score)
           values ($1, $2, gen_random_uuid(), repeat('a',64), '{}', true, 4)`,
          [a.id, published.id],
        ),
      ),
      { code: '42501' },
    );
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`update streaks set current_streak = 999 where user_id = $1`, [a.id])), { code: '42501' });
    await expectPgError(
      db.withUser(a.claims, (tx) => tx.query(`insert into daily_activity (user_id, activity_date, first_attempt_at, last_attempt_at) values ($1, current_date, now(), now())`, [a.id])),
      { code: '42501' },
    );
    await expectPgError(
      db.withUser(a.claims, (tx) => tx.query(`insert into mistakes (user_id, question_id, subject_id, chapter_id, first_wrong_at, last_wrong_at) values ($1, $2, gen_random_uuid(), gen_random_uuid(), now(), now())`, [a.id, published.id])),
      { code: '42501' },
    );
    await expectPgError(
      db.withUser(a.claims, (tx) => tx.query(`insert into doubts (user_id, body) values ($1, 'x')`, [a.id])),
      { code: '42501' },
    );
    expect(sessionId).toBeTruthy();
  });
});

describe('mistakes (read + dismiss)', () => {
  it('owner reads and may delete own mistakes; others cannot', async () => {
    // a has a mistake from the beforeAll above (wrong attempt on `published`)
    expect((await db.withUser(a.claims, (tx) => tx.query(`select * from mistakes`))).rows).toHaveLength(1);
    expect((await db.withUser(b.claims, (tx) => tx.query(`select * from mistakes`))).rows).toHaveLength(0);
    expect((await db.withUser(b.claims, (tx) => tx.query(`delete from mistakes`))).rowCount).toBe(0);
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`update mistakes set wrong_count = 0`)), { code: '42501' });
    expect((await db.withUser(a.claims, (tx) => tx.query(`delete from mistakes`))).rowCount).toBe(1);
  });
});

describe('user_roles', () => {
  it('a user sees only their own roles and cannot grant themselves any', async () => {
    const admin = await createTestUser(db, { roles: ['ADMIN'] });
    expect((await db.withUser(admin.claims, (tx) => tx.query<{ role: string }>(`select role from user_roles`))).rows).toEqual([{ role: 'ADMIN' }]);
    expect((await db.withUser(a.claims, (tx) => tx.query(`select * from user_roles`))).rows).toEqual([]);
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`insert into user_roles (user_id, role) values ($1, 'ADMIN')`, [a.id])), { code: '42501' });
    await expectPgError(db.withUser(a.claims, (tx) => tx.query(`update user_roles set role = 'ADMIN'`)), { code: '42501' });
  });
  it('is_staff reflects roles (ADMIN covers REVIEWER)', async () => {
    const rev = await createTestUser(db, { roles: ['REVIEWER'] });
    const adm = await createTestUser(db, { roles: ['ADMIN'] });
    const q = (u: string, role: string | null) =>
      one<{ r: boolean }>(db, `select app_private.is_staff($1, $2::app_role) as r`, [u, role]);
    expect((await q(rev.id, 'REVIEWER')).r).toBe(true);
    expect((await q(rev.id, 'ADMIN')).r).toBe(false);
    expect((await q(adm.id, 'REVIEWER')).r).toBe(true);
    expect((await q(a.id, null)).r).toBe(false);
    expect((await q(rev.id, null)).r).toBe(true);
  });
});

describe('anonymous Supabase users are ordinary authenticated role', () => {
  it('is_anonymous user still cannot touch content tables', async () => {
    const anonUser = await createTestUser(db, { isAnonymous: true });
    await expectPgError(db.withUser(anonUser.claims, (tx) => tx.query(`select * from questions`)), { code: '42501' });
  });
});

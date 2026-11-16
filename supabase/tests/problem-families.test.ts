import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asSuperuser, createTestDb, createTestUser, insertAttempt, makeQuestion, one } from './helpers';
import type { TestDb } from './helpers';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.close());

const fam = async (id: string) =>
  (await one<{ family_id: string | null }>(db, `select family_id from questions where id = $1`, [id])).family_id;
const family = async (id: string) =>
  one<{ number: number; title: string; attempts: number; attempters: number; solvers: number }>(
    db, `select number, title, attempts, attempters, solvers from question_families where id = $1`, [id]);
const status = async (userId: string, familyId: string) =>
  (await asSuperuser<{ attempts: number; solved_at: string | null }>(
    db, `select attempts, solved_at from user_family_status where user_id = $1 and family_id = $2`, [userId, familyId]))[0];

describe('0022: problem families', () => {
  it('variants that differ only in numbers share one family; a different question gets its own', async () => {
    const a = await makeQuestion(db, { text: 'A car accelerates from rest at 2 m/s^2 for 10 s. Find the distance travelled.' });
    const b = await makeQuestion(db, { text: 'A car accelerates from rest at 3 m/s^2 for 12 s. Find the distance travelled.' });
    const c = await makeQuestion(db, { text: 'Define the term displacement and explain how it differs from the path length covered.' });
    const fa = await fam(a.id);
    expect(fa).toBeTruthy();
    expect(await fam(b.id)).toBe(fa);
    expect(await fam(c.id)).not.toBe(fa);
    const f = await family(fa!);
    expect(f.number).toBeGreaterThan(0);
    expect(f.title.startsWith('A car accelerates from rest')).toBe(true);
  });

  it('a question with no chapter gets no family until it is classified', async () => {
    const d = await makeQuestion(db, { chapterNull: true, text: 'An unclassified draft question about something entirely new 77' });
    expect(await fam(d.id)).toBeNull();
  });

  it('attempts keep problem counters and each student status current', async () => {
    const q1 = await makeQuestion(db, { text: 'A ball is thrown up at 20 m/s. Find the maximum height reached by the ball.' });
    const q2 = await makeQuestion(db, { text: 'A ball is thrown up at 30 m/s. Find the maximum height reached by the ball.' });
    const f = (await fam(q1.id))!;
    expect(await fam(q2.id)).toBe(f);
    const u1 = await createTestUser(db);
    const u2 = await createTestUser(db);

    await insertAttempt(db, { userId: u1.id, questionId: q1.id, correct: false });
    await insertAttempt(db, { userId: u1.id, questionId: q2.id, correct: true }); // solved via another variant
    await insertAttempt(db, { userId: u1.id, questionId: q1.id, correct: true }); // already solved: no extra solver
    await insertAttempt(db, { userId: u2.id, questionId: q2.id, correct: false });

    const s = await family(f);
    expect(s.attempts).toBe(4);
    expect(s.attempters).toBe(2);
    expect(s.solvers).toBe(1);
    expect((await status(u1.id, f))!.attempts).toBe(3);
    expect((await status(u1.id, f))!.solved_at).toBeTruthy();
    expect((await status(u2.id, f))!.solved_at).toBeNull();
  });

  it('families and student status are closed to browser roles', async () => {
    const u = await createTestUser(db);
    await expect(db.withUser(u.claims, (tx) => tx.query('select * from question_families'))).rejects.toThrow();
    await expect(db.withUser(u.claims, (tx) => tx.query('select * from user_family_status'))).rejects.toThrow();
    await expect(db.withAnon((tx) => tx.query('select * from question_families'))).rejects.toThrow();
  });
});

describe('0023: problem titles', () => {
  it('drop LaTeX spacing escapes and keep escaped symbols readable', async () => {
    const r = await one<{ t: string }>(db, String.raw`select app_private.problem_title('A ball moves at $20\,\text{m s}^{-1}$ with 50\% loss. Find it.') as t`);
    expect(r.t.includes(String.fromCharCode(92))).toBe(false); // no backslash left
    expect(r.t).toContain('50%');
    expect(r.t.startsWith('A ball moves at 20')).toBe(true);
  });
});

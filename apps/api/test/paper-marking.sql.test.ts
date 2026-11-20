import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, createTestUser, type TestDb } from '@projectx/db/testing';

/**
 * Migration 0029: per-paper marking rules. A paper's numerical negative mark is applied to its numerical questions,
 * and in a PYQ_PAPER session only the best N numerical scores per subject count towards the session score.
 */
let db: TestDb;
const sql = async <T = Record<string, unknown>>(q: string, p: unknown[] = []) => db.withService(async (tx) => (await tx.query<T>(q, p)).rows);
const hash = '0'.repeat(64);

let user: string;
let exam: string;
let subjects: { id: string; chapter: string }[];
let paper: string;

async function question(subjectIdx: number, type: 'NUMERICAL' | 'SINGLE_MCQ', n: number): Promise<string> {
  const s = subjects[subjectIdx]!;
  const [r] = await sql<{ id: string }>(
    `insert into public.questions (slug, exam_id, subject_id, chapter_id, paper_id, origin, question_type, question_text, structured_content)
     values ($1, $2, $3, $4, $5, 'EDITORIAL', $6::public.question_type, 'Q', '[]'::jsonb) returning id`,
    [`pm-${type.toLowerCase().replace("_", "-")}-${subjectIdx}-${n}-${crypto.randomUUID().slice(0, 8)}`, exam, s.id, s.chapter, paper, type],
  );
  return r!.id;
}

beforeAll(async () => {
  db = await createTestDb();
  user = (await createTestUser(db)).id;
  exam = (await sql<{ id: string }>(`select id from public.exams where slug='jee-main'`))[0]!.id;
  subjects = await sql<{ id: string; chapter: string }>(
    `select s.id, (select c.id from public.chapters c where c.subject_id = s.id order by c.sort_order limit 1) as chapter
       from public.subjects s where s.exam_id = $1 order by s.sort_order limit 2`,
    [exam],
  );
  paper = (await sql<{ id: string }>(
    `insert into public.exam_papers (exam_id, slug, title, year, numerical_negative_marks, numerical_counted_per_subject)
     values ($1, 'jee-main-2021-test-paper', 'Test paper', 2021, 0, 2) returning id`,
    [exam],
  ))[0]!.id;
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe('paper marking rules (0029)', () => {
  it("applies the paper's numerical negative mark to its numerical questions only", async () => {
    const num = await question(0, 'NUMERICAL', 99);
    const mcq = await question(0, 'SINGLE_MCQ', 99);
    const rows = await sql<{ id: string; n: string }>(`select id, negative_marks::text as n from public.questions where id in ($1, $2)`, [num, mcq]);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.n]))).toEqual({ [num]: '0.00', [mcq]: '1.00' });
  });

  it('counts only the best N numerical scores per subject in a paper session', async () => {
    // Subject 0: numericals scoring 4, 4, 4, -1 (cap 2 -> 8) and an MCQ scoring -1 (always counts).
    // Subject 1: numericals scoring 4, 0 (cap 2 -> 4). Expected session score: 8 - 1 + 4 = 11 (uncapped would be 18).
    const plan: [number, 'NUMERICAL' | 'SINGLE_MCQ', number][] = [
      [0, 'NUMERICAL', 4], [0, 'NUMERICAL', 4], [0, 'NUMERICAL', 4], [0, 'NUMERICAL', -1], [0, 'SINGLE_MCQ', -1],
      [1, 'NUMERICAL', 4], [1, 'NUMERICAL', 0],
    ];
    const qs = await Promise.all(plan.map(([s, t], i) => question(s, t, i)));
    const [sess] = await sql<{ id: string }>(
      `insert into public.practice_sessions (user_id, client_request_id, mode, exam_id, paper_id, filters, question_ids, status, started_at, ui_mode)
       values ($1, $2, 'PYQ_PAPER', $3, $4, '{}'::jsonb, $5::uuid[], 'ACTIVE', now(), 'test') returning id`,
      [user, crypto.randomUUID(), exam, paper, `{${qs.join(',')}}`],
    );
    for (const [i, q] of qs.entries()) {
      const score = plan[i]![2];
      await sql(
        `insert into public.attempts (user_id, question_id, session_id, client_attempt_id, request_hash, response, is_correct, score)
         values ($1, $2, $3, $4, $5, '{}'::jsonb, $6, $7)`,
        [user, q, sess!.id, crypto.randomUUID(), hash, score > 0, score],
      );
    }
    const [s] = await sql<{ score: string; attempted_count: number }>(`select score::text as score, attempted_count from public.practice_sessions where id=$1`, [sess!.id]);
    expect(s).toEqual({ score: '11.00', attempted_count: 7 });
  });

  it('leaves a session without the rule (or not a paper) summing every attempt', async () => {
    const qs = [await question(0, 'NUMERICAL', 50), await question(0, 'NUMERICAL', 51), await question(0, 'NUMERICAL', 52)];
    const [sess] = await sql<{ id: string }>(
      `insert into public.practice_sessions (user_id, client_request_id, mode, exam_id, filters, question_ids, status, started_at, ui_mode)
       values ($1, $2, 'MIXED', $3, '{}'::jsonb, $4::uuid[], 'ACTIVE', now(), 'test') returning id`,
      [user, crypto.randomUUID(), exam, `{${qs.join(',')}}`],
    );
    for (const q of qs) {
      await sql(
        `insert into public.attempts (user_id, question_id, session_id, client_attempt_id, request_hash, response, is_correct, score)
         values ($1, $2, $3, $4, $5, '{}'::jsonb, true, 4)`,
        [user, q, sess!.id, crypto.randomUUID(), hash],
      );
    }
    expect((await sql<{ score: string }>(`select score::text as score from public.practice_sessions where id=$1`, [sess!.id]))[0]!.score).toBe('12.00');
  });
});

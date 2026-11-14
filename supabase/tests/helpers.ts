import { expect } from 'vitest';
import { asSuperuser, createTestDb, createTestUser } from '@projectx/db/testing';
import type { TestDb, TestUser } from '@projectx/db/testing';
import type { Db } from '@projectx/db';

export { asSuperuser, createTestDb, createTestUser };
export type { TestDb, TestUser };

/** Asserts that `p` rejects with a Postgres error; optionally checks SQLSTATE and/or message. */
export async function expectPgError(p: Promise<unknown>, opts: { code?: string; message?: RegExp | string } = {}): Promise<void> {
  let error: unknown;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(error, 'expected the statement to fail').toBeDefined();
  const err = error as { code?: string; message?: string };
  if (opts.code) expect(err.code, `SQLSTATE (message: ${err.message})`).toBe(opts.code);
  if (opts.message) {
    if (typeof opts.message === 'string') expect(err.message).toContain(opts.message);
    else expect(err.message).toMatch(opts.message);
  }
}

export const IDS = {
  exam: "(select id from exams where slug = 'jee-main')",
};

export async function one<T = Record<string, unknown>>(db: Db, sql: string, params: readonly unknown[] = []): Promise<T> {
  const rows = await asSuperuser<T>(db, sql, params);
  expect(rows.length, `expected exactly one row for: ${sql}`).toBe(1);
  return rows[0] as T;
}

export interface NewQuestion {
  slug?: string | null;
  type?: 'SINGLE_MCQ' | 'MULTI_MCQ' | 'NUMERICAL';
  chapterSlug?: string;
  text?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | null;
  year?: number | null;
  /** 'DRAFT' (default) leaves a bare draft; 'READY' adds options + APPROVED solution + HUMAN_VERIFIED but stays DRAFT; 'PUBLISHED' also publishes. */
  stage?: 'DRAFT' | 'READY' | 'PUBLISHED';
  chapterNull?: boolean;
}

export interface MadeQuestion {
  id: string;
  slug: string;
  optionIds: string[];
  solutionId: string | null;
}

/**
 * Creates a synthetic EDITORIAL question through plain SQL (service role), going through every trigger.
 * MCQ gets 4 options, correct = option A (or A,B for MULTI). NUMERICAL gets range 5..5.
 */
export async function makeQuestion(db: Db, o: NewQuestion = {}): Promise<MadeQuestion> {
  const type = o.type ?? 'SINGLE_MCQ';
  const stage = o.stage ?? 'DRAFT';
  const chapterSlug = o.chapterSlug ?? 'jee-main-physics-kinematics';
  return db.withService(async (tx) => {
    const ch = (await tx.query<{ id: string; subject_id: string; exam_id: string }>(
      `select c.id, c.subject_id, s.exam_id from chapters c join subjects s on s.id = c.subject_id where c.slug = $1`,
      [chapterSlug],
    )).rows[0];
    if (!ch) throw new Error(`unknown chapter ${chapterSlug}`);
    const src = (await tx.query<{ id: string }>(`select id from sources where code = 'PROJECTX_EDITORIAL'`)).rows[0]!;
    const text = o.text ?? 'A synthetic test question about uniform motion of a particle on a line';
    const q = (await tx.query<{ id: string; slug: string }>(
      `insert into questions (slug, exam_id, subject_id, chapter_id, origin, question_type, difficulty, question_text,
                              structured_content, source_id, year)
       values ($1, $2, $3, $4, 'EDITORIAL', $5::question_type, $6::difficulty, $7, $8::jsonb, $9, $10)
       returning id, slug`,
      [
        o.slug === undefined ? null : o.slug,
        ch.exam_id,
        ch.subject_id,
        o.chapterNull ? null : ch.id,
        type,
        o.difficulty === undefined ? 'EASY' : o.difficulty,
        text,
        JSON.stringify([{ type: 'paragraph', text }]),
        src.id,
        o.year ?? null,
      ],
    )).rows[0]!;
    const optionIds: string[] = [];
    if (type !== 'NUMERICAL') {
      for (const [i, label] of ['A', 'B', 'C', 'D'].entries()) {
        const r = await tx.query<{ id: string }>(
          `insert into question_options (question_id, label, sort_order, content, content_text)
           values ($1, $2, $3, $4::jsonb, $5) returning id`,
          [q.id, label, i, JSON.stringify([{ type: 'paragraph', text: `Option ${label}` }]), `Option ${label}`],
        );
        optionIds.push(r.rows[0]!.id);
      }
    }
    if (stage === 'DRAFT') return { id: q.id, slug: q.slug, optionIds, solutionId: null };

    const key =
      type === 'NUMERICAL'
        ? { type, accepted_ranges: [{ min: '5', max: '5' }], display_value: '5' }
        : { type, correct_option_ids: type === 'MULTI_MCQ' ? [optionIds[0], optionIds[1]].sort() : [optionIds[0]] };
    await tx.query(`update questions set answer_key = $2::jsonb, answer_key_source = 'HUMAN' where id = $1`, [q.id, JSON.stringify(key)]);
    const sol = await tx.query<{ id: string }>(
      `insert into solution_versions (question_id, final_answer, steps, provenance, review_status)
       values ($1, $2::jsonb, '[]'::jsonb, 'HUMAN_AUTHORED', 'APPROVED') returning id`,
      [q.id, JSON.stringify(key)],
    );
    const sid = sol.rows[0]!.id;
    await tx.query(`update questions set current_solution_id = $2, verification_status = 'HUMAN_VERIFIED' where id = $1`, [q.id, sid]);
    if (stage === 'PUBLISHED') {
      await tx.query(`update questions set publication_status = 'PUBLISHED' where id = $1`, [q.id]);
    }
    return { id: q.id, slug: q.slug, optionIds, solutionId: sid };
  });
}

/** Inserts an attempt as the service role (what the API does). */
export async function insertAttempt(
  db: Db,
  a: { userId: string; questionId: string; correct: boolean; submittedAt?: string; sessionId?: string | null; timeMs?: number },
): Promise<string> {
  const r = await asSuperuser<{ id: string }>(
    db,
    `insert into attempts (user_id, question_id, session_id, client_attempt_id, request_hash, response, is_correct, score, time_spent_ms, submitted_at)
     values ($1, $2, $3, gen_random_uuid(), repeat('a', 64), '{"type":"NUMERICAL","value":"5"}'::jsonb, $4, $5, $6, coalesce($7::timestamptz, now()))
     returning id`,
    [a.userId, a.questionId, a.sessionId ?? null, a.correct, a.correct ? 4 : -1, a.timeMs ?? 1000, a.submittedAt ?? null],
  );
  return r[0]!.id;
}

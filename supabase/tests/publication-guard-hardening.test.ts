import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asSuperuser, createTestDb, createTestUser, expectPgError, insertAttempt, makeQuestion, one } from './helpers';
import type { TestDb } from './helpers';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.close());

const GUARD = /PUBLISH_REQUIREMENTS_NOT_MET/;
const status = async (id: string) => (await one<{ publication_status: string }>(db, `select publication_status from questions where id = $1`, [id])).publication_status;

describe('H1: guard runs on INSERT and on any UPDATE of a PUBLISHED row', () => {
  it('INSERT with publication_status PUBLISHED and no requirements raises', async () => {
    await expectPgError(
      asSuperuser(
        db,
        `insert into questions (exam_id, subject_id, chapter_id, origin, question_type, difficulty, question_text, structured_content, publication_status)
         select s.exam_id, s.id, c.id, 'EDITORIAL', 'NUMERICAL', 'EASY', 'direct published insert', '[]'::jsonb, 'PUBLISHED'
           from chapters c join subjects s on s.id = c.subject_id where c.slug = 'jee-main-physics-kinematics'`,
      ),
      { message: GUARD },
    );
  });

  it('changing question_type or chapter on a published question raises', async () => {
    const m = await makeQuestion(db, { stage: 'PUBLISHED', type: 'NUMERICAL' });
    await expectPgError(asSuperuser(db, `update questions set question_type = 'SINGLE_MCQ' where id = $1`, [m.id]), { message: GUARD });
    await expectPgError(asSuperuser(db, `update questions set chapter_id = null where id = $1`, [m.id]), { message: GUARD });
    await expectPgError(asSuperuser(db, `update questions set difficulty = null where id = $1`, [m.id]), { message: GUARD });
    expect(await status(m.id)).toBe('PUBLISHED');
  });

  it('rejecting the live solution of a published question raises', async () => {
    const m = await makeQuestion(db, { stage: 'PUBLISHED' });
    await expectPgError(asSuperuser(db, `update solution_versions set review_status = 'REJECTED' where id = $1`, [m.solutionId]), { message: GUARD });
    expect((await one<{ review_status: string }>(db, `select review_status from solution_versions where id = $1`, [m.solutionId])).review_status).toBe('APPROVED');
  });

  it('deleting or adding options of a published MCQ raises', async () => {
    const m = await makeQuestion(db, { stage: 'PUBLISHED' });
    await expectPgError(asSuperuser(db, `delete from question_options where question_id = $1`, [m.id]), { message: GUARD });
    await expectPgError(asSuperuser(db, `delete from question_options where id = $1`, [m.optionIds[0]]), { message: GUARD });
    expect((await one<{ n: number }>(db, `select count(*)::int n from question_options where question_id = $1`, [m.id])).n).toBe(4);
    const n = await makeQuestion(db, { stage: 'PUBLISHED', type: 'NUMERICAL' });
    await expectPgError(
      asSuperuser(db, `insert into question_options (question_id, label, sort_order, content, content_text) values ($1, 'A', 0, '[]'::jsonb, 'x')`, [n.id]),
      { message: GUARD },
    );
  });

  it('legitimate flows still work: unpublish then edit dependents, republish; delete of a published question', async () => {
    const m = await makeQuestion(db, { stage: 'PUBLISHED' });
    await asSuperuser(db, `update questions set publication_status = 'DRAFT' where id = $1`, [m.id]);
    await asSuperuser(db, `delete from question_options where id = $1`, [m.optionIds[3]]);
    await asSuperuser(db, `update questions set publication_status = 'PUBLISHED' where id = $1`, [m.id]);
    expect(await status(m.id)).toBe('PUBLISHED');
    await asSuperuser(db, `delete from questions where id = $1`, [m.id]);
  });

  it('DISPUTED still auto-unpublishes', async () => {
    const m = await makeQuestion(db, { stage: 'PUBLISHED' });
    await asSuperuser(db, `update questions set verification_status = 'DISPUTED' where id = $1`, [m.id]);
    expect(await status(m.id)).toBe('DRAFT');
  });
});

describe('H4: NUMERICAL answer key comparison is semantic', () => {
  const numeric = (min: string, max: string, display: string) => ({ type: 'NUMERICAL', accepted_ranges: [{ min, max }], display_value: display });

  it("solution '5' vs question key '5.0' (different display) publishes", async () => {
    const m = await makeQuestion(db, { stage: 'READY', type: 'NUMERICAL' });
    await db.withService(async (tx) => {
      await tx.query(`update questions set answer_key = $2::jsonb where id = $1`, [m.id, JSON.stringify(numeric('5.0', '5.00', '5.0'))]);
    });
    await asSuperuser(db, `update questions set publication_status = 'PUBLISHED' where id = $1`, [m.id]);
    expect(await status(m.id)).toBe('PUBLISHED');
  });

  it('a different numeric value still fails', async () => {
    const m = await makeQuestion(db, { stage: 'READY', type: 'NUMERICAL' });
    await asSuperuser(db, `update questions set answer_key = $2::jsonb where id = $1`, [m.id, JSON.stringify(numeric('6', '6', '5'))]);
    await expectPgError(asSuperuser(db, `update questions set publication_status = 'PUBLISHED' where id = $1`, [m.id]), { message: GUARD });
  });

  it('answer_keys_equivalent: numeric, malformed and MCQ-order cases', async () => {
    const r = await one<Record<string, boolean>>(
      db,
      `select app_private.answer_keys_equivalent('{"type":"NUMERICAL","accepted_ranges":[{"min":"5","max":"5"}]}', '{"type":"NUMERICAL","accepted_ranges":[{"min":"5.0","max":"5.00"}],"display_value":"x"}') as eq,
              app_private.answer_keys_equivalent('{"type":"NUMERICAL","accepted_ranges":[{"min":"abc","max":"5"}]}', '{"type":"NUMERICAL","accepted_ranges":[{"min":"5","max":"5"}]}') as bad,
              app_private.answer_keys_equivalent('{"type":"MULTI_MCQ","correct_option_ids":["b","a"]}', '{"type":"MULTI_MCQ","correct_option_ids":["a","b"]}') as mcq,
              app_private.answer_keys_equivalent('{"type":"SINGLE_MCQ","correct_option_ids":["a"]}', '{"type":"SINGLE_MCQ","correct_option_ids":["b"]}') as mcq_ne`,
    );
    expect(r).toEqual({ eq: true, bad: false, mcq: true, mcq_ne: false });
  });
});

describe('LOW fixes', () => {
  it('attempts.session_id must belong to the same user', async () => {
    const a = await createTestUser(db);
    const b = await createTestUser(db);
    const m2 = await makeQuestion(db, { stage: 'PUBLISHED' });
    const m = await makeQuestion(db, { stage: 'PUBLISHED' });
    const ex = await one<{ id: string }>(db, `select id from exams where slug = 'jee-main'`);
    const s = await one<{ id: string }>(
      db,
      `insert into practice_sessions (user_id, client_request_id, mode, exam_id, question_ids) values ($1, gen_random_uuid(), 'MIXED', $2, array[$3::uuid]) returning id`,
      [a.id, ex.id, m.id],
    );
    await insertAttempt(db, { userId: a.id, questionId: m.id, correct: true, sessionId: s.id });
    await expectPgError(insertAttempt(db, { userId: b.id, questionId: m2.id, correct: true, sessionId: s.id }), { code: '23503' });
  });

  it('default privileges on future functions exclude anon/authenticated', async () => {
    await asSuperuser(db, `create function app_private.zz_probe() returns int language sql as 'select 1'`);
    const r = await one<{ anon: boolean; auth: boolean }>(
      db,
      `select has_function_privilege('anon', 'app_private.zz_probe()', 'execute') anon, has_function_privilege('authenticated', 'app_private.zz_probe()', 'execute') auth`,
    );
    expect(r).toEqual({ anon: false, auth: false });
  });

  describe('promote_source_question re-checks source approval', () => {
    const hash = (c: string) => c.repeat(64);
    const mkSq = async (sourceCode: string, tag: string) => {
      const examId = (await one<{ id: string }>(db, `select id from exams where slug = 'jee-main'`)).id;
      const doc = await one<{ id: string }>(
        db,
        `insert into source_documents (source_id, kind, r2_key, original_filename, mime_type, bytes, sha256)
         select id, 'QUESTION_PAPER', $2, 'p.pdf', 'application/pdf', 10, $3 from sources where code = $1 returning id`,
        [sourceCode, `sources/${sourceCode}/hardening-${tag}.pdf`, hash(tag)],
      );
      const normalized = {
        schema_version: 1, question_number: '1', external_question_id: null, section_hint: 'PHYSICS', question_type_guess: null,
        content: [{ type: 'paragraph', text: `Hardening promote ${tag}` }], options: [], assets: [], page_start: 1, page_end: 1,
        question_text: `Hardening promote ${tag}`, normalized_text: `hardening promote ${tag}`, content_hash: hash(tag),
      };
      const sq = await one<{ id: string }>(
        db,
        `insert into source_questions (source_document_id, question_number, page_start, page_end, status, normalized, normalized_text, content_hash, extraction_method)
         values ($1, '1', 1, 1, 'NORMALIZED', $2::jsonb, $3, $4, 'TEXT') returning id`,
        [doc.id, JSON.stringify(normalized), normalized.normalized_text, hash(tag)],
      );
      return { examId, sqId: sq.id };
    };

    it('raises when the source was un-approved after ingestion; NTA stays blocked; editorial source works', async () => {
      const ok = await mkSq('PROJECTX_EDITORIAL', '1');
      const bad = await mkSq('PROJECTX_EDITORIAL', '2');
      await asSuperuser(db, `insert into sources (code, name, kind, reuse_permitted, approved_at) values ('HARDTEST', 'Hard test', 'OFFICIAL_EXAM_BODY', true, now())`);
      const revoked = await mkSq('HARDTEST', '3');
      await asSuperuser(db, `update sources set reuse_permitted = false, approved_at = null where code = 'HARDTEST'`);
      await expectPgError(asSuperuser(db, `select app_private.promote_source_question($1, $2)`, [revoked.sqId, revoked.examId]), { message: 'SOURCE_NOT_APPROVED' });

      const nta = await one<{ reuse_permitted: boolean; approved_at: Date | null }>(db, `select reuse_permitted, approved_at from sources where code = 'NTA'`);
      expect(nta).toEqual({ reuse_permitted: false, approved_at: null });
      await expectPgError(
        asSuperuser(db, `insert into source_documents (source_id, kind, r2_key, original_filename, mime_type, bytes, sha256)
                         select id, 'QUESTION_PAPER', 'sources/NTA/x.pdf', 'p.pdf', 'application/pdf', 10, repeat('c', 64) from sources where code = 'NTA'`),
        {},
      );

      const r = await one<{ id: string }>(db, `select app_private.promote_source_question($1, $2) as id`, [ok.sqId, ok.examId]);
      expect(r.id).toBeTruthy();
      // idempotent for an already-promoted question even though it exists
      const again = await one<{ id: string }>(db, `select app_private.promote_source_question($1, $2) as id`, [ok.sqId, ok.examId]);
      expect(again.id).toBe(r.id);
      void bad;
    });
  });
});

describe('0021: AI-checked questions are practice-only', () => {
  const asAiChecked = (id: string, extra = '') =>
    asSuperuser(db, `update questions set origin = 'AI_GENERATED', verification_status = 'AUTOMATED_CHECKS_PASSED'${extra} where id = $1`, [id]);

  it('refuses to publish an AI-checked question that could be indexed or listed in the sitemap', async () => {
    const m = await makeQuestion(db, { stage: 'READY' });
    await asAiChecked(m.id, `, indexability = 'AUTO', sitemap_include = false`);
    await expectPgError(asSuperuser(db, `update questions set publication_status = 'PUBLISHED' where id = $1`, [m.id]), { message: GUARD });
    await asAiChecked(m.id, `, indexability = 'NOINDEX', sitemap_include = true`);
    await expectPgError(asSuperuser(db, `update questions set publication_status = 'PUBLISHED' where id = $1`, [m.id]), { message: GUARD });
  });

  it('publishes when NOINDEX and out of the sitemap, and blocks later flipping it to indexable', async () => {
    const m = await makeQuestion(db, { stage: 'READY' });
    await asAiChecked(m.id, `, indexability = 'NOINDEX', sitemap_include = false`);
    await asSuperuser(db, `update questions set publication_status = 'PUBLISHED' where id = $1`, [m.id]);
    expect(await status(m.id)).toBe('PUBLISHED');
    await expectPgError(asSuperuser(db, `update questions set indexability = 'AUTO' where id = $1`, [m.id]), { message: GUARD });
  });

  it('a human-verified AI question may still be indexed', async () => {
    const m = await makeQuestion(db, { stage: 'READY' });
    await asSuperuser(db, `update questions set origin = 'AI_GENERATED', verification_status = 'HUMAN_VERIFIED', indexability = 'AUTO' where id = $1`, [m.id]);
    await asSuperuser(db, `update questions set publication_status = 'PUBLISHED' where id = $1`, [m.id]);
    expect(await status(m.id)).toBe('PUBLISHED');
  });
});

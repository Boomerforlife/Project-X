import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asSuperuser, createTestDb, createTestUser, expectPgError, makeQuestion, one } from './helpers';
import type { TestDb } from './helpers';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.close());

let keySeq = 0;
const enqueue = async (kind: string, opts: { key?: string; priority?: number; runAfter?: string; payload?: unknown; questionId?: string | null } = {}) =>
  (
    await one<{ id: string }>(
      db,
      `select app_private.enqueue_pipeline_job($1::job_kind, $2, $3::jsonb, $4, coalesce($5::timestamptz, now()), $6::uuid) as id`,
      [kind, opts.key ?? `k-${(keySeq += 1)}-${Math.random()}`, JSON.stringify(opts.payload ?? {}), opts.priority ?? 100, opts.runAfter ?? null, opts.questionId ?? null],
    )
  ).id;
const claim = (worker: string, kinds: string[] | null = null, lease = 600) =>
  asSuperuser<{ id: string; status: string; attempts: number; locked_by: string; lease_expires_at: Date }>(
    db,
    `select * from app_private.claim_pipeline_job($1, $2::job_kind[], $3)`,
    [worker, kinds, lease],
  );
const job = (id: string) =>
  one<{ status: string; attempts: number; locked_by: string | null; last_error: string | null; run_after_s: number; result: unknown; finished_at: Date | null }>(
    db,
    `select status, attempts, locked_by, last_error, extract(epoch from (run_after - now()))::float8 as run_after_s, result, finished_at from pipeline_jobs where id = $1`,
    [id],
  );
const clearQueue = () => asSuperuser(db, `delete from pipeline_jobs`);

describe('enqueue_pipeline_job', () => {
  it('is idempotent on idempotency_key (returns the existing id, keeps the first payload)', async () => {
    const a = await enqueue('AI_SOLVE', { key: 'same-key', payload: { v: 1 } });
    const b = await enqueue('AI_SOLVE', { key: 'same-key', payload: { v: 2 } });
    expect(b).toBe(a);
    const rows = await asSuperuser<{ payload: { v: number } }>(db, `select payload from pipeline_jobs where idempotency_key = 'same-key'`);
    expect(rows).toEqual([{ payload: { v: 1 } }]);
  });
  it('defaults: QUEUED, priority 100, attempts 0, max_attempts 5', async () => {
    const id = await enqueue('PROCESS_DOCUMENT');
    const r = await one<Record<string, unknown>>(db, `select status, priority, attempts, max_attempts from pipeline_jobs where id = $1`, [id]);
    expect(r).toEqual({ status: 'QUEUED', priority: 100, attempts: 0, max_attempts: 5 });
  });
  it('is not callable via client roles (revoked)', async () => {
    const u = await createTestUser(db);
    await expectPgError(db.withUser(u.claims, (tx) => tx.query(`select app_private.enqueue_pipeline_job('AI_SOLVE', 'x')`)), { code: '42501' });
  });
});

describe('claim_pipeline_job', () => {
  it('claims the best job: priority, then run_after, then created order; honours kinds filter', async () => {
    await clearQueue();
    const low = await enqueue('AI_SOLVE', { priority: 200 });
    const high = await enqueue('AI_SOLVE', { priority: 10 });
    const other = await enqueue('AI_CLASSIFY', { priority: 1 });
    const first = await claim('w1', ['AI_SOLVE']);
    expect(first.map((r) => r.id)).toEqual([high]);
    expect(first[0]).toMatchObject({ status: 'RUNNING', attempts: 1, locked_by: 'w1' });
    expect(first[0]!.lease_expires_at).toBeInstanceOf(Date);
    const second = await claim('w1', ['AI_SOLVE']);
    expect(second.map((r) => r.id)).toEqual([low]);
    expect(await claim('w1', ['AI_SOLVE'])).toEqual([]);
    const any = await claim('w2', null);
    expect(any.map((r) => r.id)).toEqual([other]);
  });
  it('does not claim jobs scheduled in the future', async () => {
    await clearQueue();
    const id = await enqueue('AI_VERIFY', { runAfter: '2999-01-01T00:00:00Z' });
    expect(await claim('w1', ['AI_VERIFY'])).toEqual([]);
    await asSuperuser(db, `update pipeline_jobs set run_after = now() - interval '1 second' where id = $1`, [id]);
    expect((await claim('w1', ['AI_VERIFY'])).map((r) => r.id)).toEqual([id]);
  });
  it('re-claims a RUNNING job after its lease expired (attempts incremented, new owner)', async () => {
    await clearQueue();
    const id = await enqueue('AI_SEO');
    await claim('w1', ['AI_SEO']);
    expect(await claim('w2', ['AI_SEO'])).toEqual([]); // lease still valid
    await asSuperuser(db, `update pipeline_jobs set lease_expires_at = now() - interval '1 minute' where id = $1`, [id]);
    const re = await claim('w2', ['AI_SEO']);
    expect(re.map((r) => r.id)).toEqual([id]);
    expect(re[0]).toMatchObject({ attempts: 2, locked_by: 'w2', status: 'RUNNING' });
    // the previous owner lost the lease
    expect((await one<{ ok: boolean }>(db, `select app_private.heartbeat_pipeline_job($1, 'w1') as ok`, [id])).ok).toBe(false);
    expect((await one<{ ok: boolean }>(db, `select app_private.complete_pipeline_job($1, 'w1', '{}') as ok`, [id])).ok).toBe(false);
    expect((await one<{ ok: boolean }>(db, `select app_private.complete_pipeline_job($1, 'w2', '{"done":true}') as ok`, [id])).ok).toBe(true);
  });
  it('marks a job DEAD instead of claiming it once max_attempts is exhausted, then moves on to the next job', async () => {
    await clearQueue();
    const dead = await enqueue('AI_CLASSIFY', { priority: 1 });
    const next = await enqueue('AI_CLASSIFY', { priority: 50 });
    await asSuperuser(db, `update pipeline_jobs set attempts = max_attempts where id = $1`, [dead]);
    const got = await claim('w1', ['AI_CLASSIFY']);
    expect(got.map((r) => r.id)).toEqual([next]);
    const d = await job(dead);
    expect(d.status).toBe('DEAD');
    expect(d.finished_at).not.toBeNull();
    expect(d.last_error).toContain('max attempts');
  });
  it('a lease-expired job at max attempts also goes DEAD', async () => {
    await clearQueue();
    const id = await enqueue('AI_CLASSIFY');
    await claim('w1', ['AI_CLASSIFY']);
    await asSuperuser(db, `update pipeline_jobs set attempts = max_attempts, lease_expires_at = now() - interval '1 second' where id = $1`, [id]);
    expect(await claim('w2', ['AI_CLASSIFY'])).toEqual([]);
    expect((await job(id)).status).toBe('DEAD');
  });
});

describe('heartbeat / complete / fail', () => {
  it('heartbeat extends the lease for the owner only', async () => {
    await clearQueue();
    const id = await enqueue('AI_SOLVE');
    await claim('w1', ['AI_SOLVE'], 60);
    await asSuperuser(db, `update pipeline_jobs set lease_expires_at = now() + interval '5 seconds' where id = $1`, [id]);
    expect((await one<{ ok: boolean }>(db, `select app_private.heartbeat_pipeline_job($1, 'w1', 900) as ok`, [id])).ok).toBe(true);
    const lease = await one<{ s: number }>(db, `select extract(epoch from (lease_expires_at - now()))::float8 s from pipeline_jobs where id = $1`, [id]);
    expect(lease.s).toBeGreaterThan(800);
    expect((await one<{ ok: boolean }>(db, `select app_private.heartbeat_pipeline_job($1, 'intruder') as ok`, [id])).ok).toBe(false);
  });
  it('complete: only RUNNING + owner; stores result; cannot complete twice', async () => {
    await clearQueue();
    const id = await enqueue('AI_SOLVE');
    expect((await one<{ ok: boolean }>(db, `select app_private.complete_pipeline_job($1, 'w1', '{}') as ok`, [id])).ok).toBe(false); // still QUEUED
    await claim('w1', ['AI_SOLVE']);
    expect((await one<{ ok: boolean }>(db, `select app_private.complete_pipeline_job($1, 'other', '{}') as ok`, [id])).ok).toBe(false);
    expect((await one<{ ok: boolean }>(db, `select app_private.complete_pipeline_job($1, 'w1', '{"n":3}') as ok`, [id])).ok).toBe(true);
    expect(await job(id)).toMatchObject({ status: 'SUCCEEDED', result: { n: 3 } });
    expect((await one<{ ok: boolean }>(db, `select app_private.complete_pipeline_job($1, 'w1', '{}') as ok`, [id])).ok).toBe(false);
  });
  it('fail (retryable) requeues with exponential backoff 30 * 2^(attempts-1), capped at 3600s', async () => {
    await clearQueue();
    const id = await enqueue('AI_SOLVE');
    await asSuperuser(db, `update pipeline_jobs set max_attempts = 20 where id = $1`, [id]);
    const expectations: [number, number][] = [[1, 30], [2, 60], [3, 120], [7, 1920], [8, 3600], [12, 3600]];
    for (const [attempts, seconds] of expectations) {
      await asSuperuser(db, `update pipeline_jobs set status = 'RUNNING', locked_by = 'w1', attempts = $2 where id = $1`, [id, attempts]);
      const st = await one<{ s: string }>(db, `select app_private.fail_pipeline_job($1, 'w1', 'boom') as s`, [id]);
      expect(st.s).toBe('QUEUED');
      const j = await job(id);
      expect(j.run_after_s, `attempts=${attempts}`).toBeGreaterThan(seconds - 3);
      expect(j.run_after_s, `attempts=${attempts}`).toBeLessThanOrEqual(seconds + 1);
      expect(j.locked_by).toBeNull();
      expect(j.last_error).toBe('boom');
    }
  });
  it('a backed-off job is not claimable until run_after passes', async () => {
    await clearQueue();
    const id = await enqueue('AI_SOLVE');
    await claim('w1', ['AI_SOLVE']);
    await asSuperuser(db, `select app_private.fail_pipeline_job($1, 'w1', 'x')`, [id]);
    expect(await claim('w1', ['AI_SOLVE'])).toEqual([]);
    await asSuperuser(db, `update pipeline_jobs set run_after = now() where id = $1`, [id]);
    expect((await claim('w1', ['AI_SOLVE']))[0]).toMatchObject({ id, attempts: 2 });
  });
  it('fail goes DEAD when attempts are exhausted, when not retryable, and truncates the error', async () => {
    await clearQueue();
    const a = await enqueue('AI_SOLVE');
    await claim('w1', ['AI_SOLVE']);
    await asSuperuser(db, `update pipeline_jobs set attempts = max_attempts where id = $1`, [a]);
    expect((await one<{ s: string }>(db, `select app_private.fail_pipeline_job($1, 'w1', $2) as s`, [a, 'e'.repeat(5000)])).s).toBe('DEAD');
    const ja = await one<{ len: number; finished: boolean }>(db, `select length(last_error) len, finished_at is not null finished from pipeline_jobs where id = $1`, [a]);
    expect(ja).toEqual({ len: 4000, finished: true });

    const b = await enqueue('AI_SOLVE');
    await claim('w1', ['AI_SOLVE']);
    expect((await one<{ s: string }>(db, `select app_private.fail_pipeline_job($1, 'w1', 'fatal', false) as s`, [b])).s).toBe('DEAD');
  });
  it('fail by a non-owner is ignored and reports the current status', async () => {
    await clearQueue();
    const id = await enqueue('AI_SOLVE');
    await claim('w1', ['AI_SOLVE']);
    expect((await one<{ s: string }>(db, `select app_private.fail_pipeline_job($1, 'intruder', 'x') as s`, [id])).s).toBe('RUNNING');
    expect((await job(id)).locked_by).toBe('w1');
    expect((await one<{ s: string | null }>(db, `select app_private.fail_pipeline_job(gen_random_uuid(), 'w1', 'x') as s`)).s).toBeNull();
  });
});

describe('append-only tables', () => {
  it('pipeline_job_events: insertable via log function, immutable, cascades with the job', async () => {
    const id = await enqueue('AI_SOLVE');
    await asSuperuser(db, `select app_private.log_pipeline_job_event($1, 'INFO', 'stage1', 'hello', '{"a":1}')`, [id]);
    const ev = await one<{ id: string }>(db, `select id::text from pipeline_job_events where job_id = $1`, [id]);
    await expectPgError(asSuperuser(db, `update pipeline_job_events set message = 'x' where id = $1`, [ev.id]), { code: 'P0001', message: 'append-only table' });
    await expectPgError(asSuperuser(db, `delete from pipeline_job_events where id = $1`, [ev.id]), { code: 'P0001', message: 'append-only table' });
    await asSuperuser(db, `delete from pipeline_jobs where id = $1`, [id]);
    expect(await asSuperuser(db, `select 1 from pipeline_job_events where job_id = $1`, [id])).toHaveLength(0);
  });
  it('log function truncates overlong messages to the 2000 char limit', async () => {
    const id = await enqueue('AI_SOLVE');
    await asSuperuser(db, `select app_private.log_pipeline_job_event($1, 'WARN', null, repeat('x', 3000))`, [id]);
    expect((await one<{ n: number }>(db, `select length(message) n from pipeline_job_events where job_id = $1`, [id])).n).toBe(2000);
  });
  it('review_events: immutable, but cascade from question deletion and actor deletion (set null) work', async () => {
    const m = await makeQuestion(db);
    const actor = await createTestUser(db);
    await asSuperuser(db, `insert into review_events (question_id, actor_id, action) values ($1, $2, 'APPROVE')`, [m.id, actor.id]);
    const ev = await one<{ id: string }>(db, `select id::text from review_events where question_id = $1`, [m.id]);
    await expectPgError(asSuperuser(db, `update review_events set note = 'x' where id = $1`, [ev.id]), { message: 'append-only table' });
    await expectPgError(asSuperuser(db, `delete from review_events where id = $1`, [ev.id]), { message: 'append-only table' });
    await asSuperuser(db, `delete from auth.users where id = $1`, [actor.id]);
    expect((await one<{ actor_id: string | null }>(db, `select actor_id from review_events where id = $1`, [ev.id])).actor_id).toBeNull();
    await asSuperuser(db, `delete from questions where id = $1`, [m.id]);
    expect(await asSuperuser(db, `select 1 from review_events where question_id = $1`, [m.id])).toHaveLength(0);
  });
  it('audit_log: immutable', async () => {
    await asSuperuser(db, `insert into audit_log (actor_type, action, entity_type) values ('SYSTEM', 'TEST', 'question')`);
    await expectPgError(asSuperuser(db, `update audit_log set action = 'X'`), { message: 'append-only table' });
    await expectPgError(asSuperuser(db, `delete from audit_log`), { message: 'append-only table' });
    await expectPgError(asSuperuser(db, `insert into audit_log (actor_type, action, entity_type) values ('HACKER', 'a', 'b')`), { code: '23514' });
  });
});

describe('source approval guard', () => {
  const docSql = `insert into source_documents (source_id, kind, r2_key, original_filename, mime_type, bytes, sha256)
                  select id, 'QUESTION_PAPER', $2, 'paper.pdf', 'application/pdf', 100, $3 from sources where code = $1 returning id`;
  it('blocks documents for unapproved sources (NTA seed) with SOURCE_NOT_APPROVED', async () => {
    const nta = await one<{ reuse_permitted: boolean; approved_at: Date | null }>(db, `select reuse_permitted, approved_at from sources where code = 'NTA'`);
    expect(nta).toEqual({ reuse_permitted: false, approved_at: null });
    await expectPgError(asSuperuser(db, docSql, ['NTA', 'sources/NTA/2099/a.pdf', 'a'.repeat(64)]), { message: 'SOURCE_NOT_APPROVED' });
  });
  it('allows documents for approved sources (PROJECTX_EDITORIAL)', async () => {
    const r = await asSuperuser(db, docSql, ['PROJECTX_EDITORIAL', 'sources/PROJECTX_EDITORIAL/2099/b.pdf', 'b'.repeat(64)]);
    expect(r).toHaveLength(1);
  });
  it('approval requires reuse_permitted (check constraint) and unlocks ingestion once recorded', async () => {
    await expectPgError(asSuperuser(db, `update sources set approved_at = now() where code = 'NTA'`), { code: '23514' });
    await asSuperuser(db, `update sources set reuse_permitted = true, approved_at = now(), license_name = 'test licence' where code = 'NTA'`);
    const r = await asSuperuser(db, docSql, ['NTA', 'sources/NTA/2099/c.pdf', 'c'.repeat(64)]);
    expect(r).toHaveLength(1);
    // revoking approval blocks again
    await asSuperuser(db, `update sources set approved_at = null, reuse_permitted = false where code = 'NTA'`);
    await expectPgError(asSuperuser(db, docSql, ['NTA', 'sources/NTA/2099/d.pdf', 'd'.repeat(64)]), { message: 'SOURCE_NOT_APPROVED' });
  });
  it('source_documents constraints: sha256 unique/format, bucket fixed, mime allow-list, bytes > 0', async () => {
    await expectPgError(asSuperuser(db, docSql, ['PROJECTX_EDITORIAL', 'x/1.pdf', 'b'.repeat(64)]), { code: '23505' });
    await expectPgError(asSuperuser(db, docSql, ['PROJECTX_EDITORIAL', 'x/2.pdf', 'NOTHEX']), { code: '23514' });
    await expectPgError(
      asSuperuser(db, `insert into source_documents (source_id, kind, bucket, r2_key, original_filename, mime_type, bytes, sha256) select id, 'OTHER', 'PUBLIC_ASSETS', 'k', 'f', 'application/pdf', 1, $1 from sources where code = 'PROJECTX_EDITORIAL'`, ['e'.repeat(64)]),
      { code: '23514' },
    );
    await expectPgError(
      asSuperuser(db, `insert into source_documents (source_id, kind, r2_key, original_filename, mime_type, bytes, sha256) select id, 'OTHER', 'k2', 'f', 'image/svg+xml', 1, $1 from sources where code = 'PROJECTX_EDITORIAL'`, ['f'.repeat(64)]),
      { code: '23514' },
    );
  });
  it('exam_papers: unique (exam, date, shift, paper_code, language) with NULLs treated as equal', async () => {
    const ins = (slug: string) =>
      asSuperuser(db, `insert into exam_papers (exam_id, slug, title, year) select id, $1, 't', 2099 from exams where slug = 'jee-main'`, [slug]);
    await ins('jee-main-2099-a');
    await expectPgError(ins('jee-main-2099-b'), { code: '23505' });
    await expectPgError(ins('Bad Slug'), { code: '23514' });
  });
});

describe('ai_runs / verification', () => {
  const run = (task: string, hash: string, status: string) =>
    asSuperuser(db, `insert into ai_runs (task, provider, model, prompt_id, prompt_version, input_hash, status) values ($1::ai_task, 'mock', 'm', 'p', 'v1', $2, $3::ai_run_status)`, [task, hash, status]);
  it('allows only one SUCCEEDED run per (task, input_hash) but any number of failures', async () => {
    const h = '1'.repeat(64);
    await run('SOLVE', h, 'SUCCEEDED');
    await expectPgError(run('SOLVE', h, 'SUCCEEDED'), { code: '23505' });
    await run('SOLVE', h, 'FAILED');
    await run('SOLVE', h, 'FAILED');
    await run('ANSWER', h, 'SUCCEEDED');
  });
  it('verification_checks are unique per (run, kind); runs cascade from questions', async () => {
    const m = await makeQuestion(db);
    const vr = await one<{ id: string }>(db, `insert into verification_runs (question_id, rules_version) values ($1, 'v1') returning id`, [m.id]);
    await asSuperuser(db, `insert into verification_checks (verification_run_id, kind, result) values ($1, 'SYMPY_CHECK', 'PASS')`, [vr.id]);
    await expectPgError(asSuperuser(db, `insert into verification_checks (verification_run_id, kind, result) values ($1, 'SYMPY_CHECK', 'FAIL')`, [vr.id]), { code: '23505' });
    await asSuperuser(db, `delete from questions where id = $1`, [m.id]);
    expect(await asSuperuser(db, `select 1 from verification_checks where verification_run_id = $1`, [vr.id])).toHaveLength(0);
  });
  it('usage_counters metric names are validated', async () => {
    await asSuperuser(db, `insert into usage_counters (day, metric, value) values (current_date, 'ai.cost_usd_micros', 5)`);
    await expectPgError(asSuperuser(db, `insert into usage_counters (day, metric, value) values (current_date, 'Bad Metric', 1)`), { code: '23514' });
  });
});

describe('promote_source_question / link_official_answer_keys / find_near_duplicates', () => {
  let paperId: string;
  let docId: string;
  let examId: string;
  const sqIds: Record<string, string> = {};
  const sha = (c: string) => c.repeat(64);

  const normalized = (n: string, extra: Record<string, unknown>) => ({
    schema_version: 1,
    question_number: n,
    external_question_id: null,
    section_hint: 'PHYSICS',
    question_type_guess: null,
    content: [{ type: 'paragraph', text: `Synthetic promoted question number ${n}` }],
    options: [],
    assets: [],
    page_start: 1,
    page_end: 1,
    question_text: `Synthetic promoted question number ${n}`,
    normalized_text: `synthetic promoted question number ${n}`,
    content_hash: sha(String(n)),
    extraction: { method: 'TEXT', ocr_engine: null, mean_confidence: null, warnings: [] },
    ...extra,
  });
  const opts4 = (prefix: string) => ['A', 'B', 'C', 'D'].map((l, i) => ({ label: l, external_option_id: `${prefix}${i + 1}`, content: [{ type: 'paragraph', text: `opt ${l}` }] }));

  beforeAll(async () => {
    examId = (await one<{ id: string }>(db, `select id from exams where slug = 'jee-main'`)).id;
    paperId = (
      await one<{ id: string }>(
        db,
        `insert into exam_papers (exam_id, slug, title, year, session_label, exam_date, shift) values ($1, 'jee-main-2099-synthetic-shift-1', 'Synthetic', 2099, 'January', '2099-01-27', 1) returning id`,
        [examId],
      )
    ).id;
    docId = (
      await one<{ id: string }>(
        db,
        `insert into source_documents (source_id, paper_id, kind, r2_key, original_filename, mime_type, bytes, sha256)
         select id, $1, 'QUESTION_PAPER', 'sources/PROJECTX_EDITORIAL/2099/promote.pdf', 'p.pdf', 'application/pdf', 10, $2 from sources where code = 'PROJECTX_EDITORIAL' returning id`,
        [paperId, sha('9')],
      )
    ).id;
    const mk = async (key: string, num: string, ext: string | null, n: Record<string, unknown>, status = 'NORMALIZED') => {
      const r = await one<{ id: string }>(
        db,
        `insert into source_questions (source_document_id, question_number, external_question_id, page_start, page_end, status, normalized, normalized_text, content_hash, extraction_method)
         values ($1, $2, $3, 1, 1, $4::source_question_status, $5::jsonb, $6, $7, 'TEXT') returning id`,
        [docId, num, ext, status, JSON.stringify(n), String(n.normalized_text), String(n.content_hash)],
      );
      sqIds[key] = r.id;
    };
    // Q1: SINGLE_MCQ (guess), external ids, one figure referenced by asset_ref
    await mk('q1', '1', '9001', normalized('1', { external_question_id: '9001', question_type_guess: 'SINGLE_MCQ', options: opts4('900'),
      content: [{ type: 'paragraph', text: 'See figure' }, { type: 'image', asset_ref: 'q1-fig1', alt: 'a figure' }],
      assets: [{ asset_ref: 'q1-fig1', asset_id: null, kind: 'DIAGRAM', page: 1, bbox: [0, 0, 1, 1], sha256: sha('f'), mime_type: 'image/png', width: 10, height: 10, r2_key: 'derived/x/crops/q1-1.png' }] }));
    await asSuperuser(
      db,
      `insert into question_assets (source_question_id, kind, bucket, r2_key, mime_type, sha256, alt_text) values ($1, 'DIAGRAM', 'SOURCE_DOCS', 'derived/x/crops/q1-1.png', 'image/png', $2, 'a figure')`,
      [sqIds.q1, sha('f')],
    );
    // Q2: MULTI via guess, labels key
    await mk('q2', '2', null, normalized('2', { question_type_guess: 'MULTI_MCQ', options: opts4('') .map((o) => ({ ...o, external_option_id: null })) }));
    // Q3: numerical, no options, no guess
    await mk('q3', '3', null, normalized('3', { section_hint: 'MATHEMATICS' }));
    // Q4: dropped
    await mk('q4', '4', null, normalized('4', { options: opts4('').map((o) => ({ ...o, external_option_id: null })) }));
    // Q5: a duplicate (not promotable)
    await mk('q5', '5', null, normalized('5', {}), 'DUPLICATE');
    // official keys (inserted before promotion: promote links its own key)
    const key = (qn: string | null, ext: string | null, raw: string, ans: unknown, dropped = false) =>
      asSuperuser(
        db,
        `insert into official_answer_keys (source_document_id, paper_id, question_number, external_question_id, raw_answer, normalized_answer, is_dropped)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [docId, paperId, qn, ext, raw, JSON.stringify(ans), dropped],
      );
    await key(null, '9001', '900 2', { kind: 'EXTERNAL_OPTION_IDS', ids: ['9002'] });
    await key('2', null, '1,3', { kind: 'OPTION_LABELS', labels: ['A', 'C'] });
    await key('3', null, '2.4 to 2.6', { kind: 'NUMERIC', accepted_ranges: [{ min: '2.4', max: '2.6' }] });
    await key('4', null, 'Drop', { kind: 'DROPPED' }, true);
  });

  it('refuses non-NORMALIZED / duplicate / missing source questions', async () => {
    await expectPgError(asSuperuser(db, `select app_private.promote_source_question($1, $2)`, [sqIds.q5, examId]), { message: 'SOURCE_QUESTION_NOT_PROMOTABLE' });
    await expectPgError(asSuperuser(db, `select app_private.promote_source_question(gen_random_uuid(), $1)`, [examId]), { message: 'SOURCE_QUESTION_NOT_FOUND' });
  });

  it('promotes an MCQ: question, options (ext ids), resolved image asset, paper attribution, PROMOTED status, AI_CLASSIFY job', async () => {
    const r = await one<{ id: string }>(db, `select app_private.promote_source_question($1, $2) as id`, [sqIds.q1, examId]);
    const q = await one<Record<string, unknown>>(
      db,
      `select origin, question_type, publication_status, verification_status, ingestion_status, year, shift, session_label, question_number, slug,
              (select slug from subjects where id = subject_id) subject, content_hash, dedupe_text, source_question_id, structured_content, paper_id
         from questions where id = $1`,
      [r.id],
    );
    expect(q).toMatchObject({
      origin: 'EDITORIAL', question_type: 'SINGLE_MCQ', publication_status: 'DRAFT', verification_status: 'PENDING', ingestion_status: 'IMPORTED',
      year: 2099, shift: 1, session_label: 'January', question_number: '1', subject: 'jee-main-physics', content_hash: sha('1'),
      dedupe_text: 'synthetic promoted question number 1', source_question_id: sqIds.q1, paper_id: paperId,
    });
    expect(String(q.slug)).toContain('jee-main-2099');
    const opts = await asSuperuser<{ label: string; external_option_id: string; content_text: string }>(
      db, `select label, external_option_id, content_text from question_options where question_id = $1 order by sort_order`, [r.id]);
    expect(opts.map((o) => [o.label, o.external_option_id, o.content_text])).toEqual([['A', '9001', 'opt A'], ['B', '9002', 'opt B'], ['C', '9003', 'opt C'], ['D', '9004', 'opt D']]);
    const asset = await one<{ id: string; question_id: string }>(db, `select id, question_id from question_assets where source_question_id = $1`, [sqIds.q1]);
    expect(asset.question_id).toBe(r.id);
    const blocks = q.structured_content as { type: string; asset_id?: string; asset_ref?: string; alt?: string }[];
    expect(blocks[1]).toEqual({ type: 'image', asset_id: asset.id, alt: 'a figure' });
    expect(JSON.stringify(blocks)).not.toContain('asset_ref');
    const sq = await one<{ status: string; promoted_question_id: string }>(db, `select status, promoted_question_id from source_questions where id = $1`, [sqIds.q1]);
    expect(sq).toEqual({ status: 'PROMOTED', promoted_question_id: r.id });
    const jobRow = await one<{ kind: string; status: string; idempotency_key: string; question_id: string }>(
      db, `select kind, status, idempotency_key, question_id from pipeline_jobs where question_id = $1`, [r.id]);
    expect(jobRow).toEqual({ kind: 'AI_CLASSIFY', status: 'QUEUED', idempotency_key: `AI_CLASSIFY:${r.id}:${sha('1')}`, question_id: r.id });
  });

  it('is idempotent: promoting again returns the same question and no second job', async () => {
    const a = await one<{ id: string }>(db, `select app_private.promote_source_question($1, $2) as id`, [sqIds.q1, examId]);
    const b = await one<{ id: string }>(db, `select app_private.promote_source_question($1, $2) as id`, [sqIds.q1, examId]);
    expect(b.id).toBe(a.id);
    expect(await asSuperuser(db, `select 1 from questions where source_question_id = $1`, [sqIds.q1])).toHaveLength(1);
    expect(await asSuperuser(db, `select 1 from pipeline_jobs where question_id = $1`, [a.id])).toHaveLength(1);
  });

  it('links official keys during promotion: external option ids, labels, numeric ranges', async () => {
    const q1 = await one<{ answer_key: { type: string; correct_option_ids: string[] }; answer_key_source: string; opt_b: string }>(
      db,
      `select answer_key, answer_key_source, (select id from question_options where question_id = q.id and label = 'B') opt_b from questions q where source_question_id = $1`,
      [sqIds.q1],
    );
    expect(q1.answer_key).toEqual({ type: 'SINGLE_MCQ', correct_option_ids: [q1.opt_b] });
    expect(q1.answer_key_source).toBe('OFFICIAL');

    await asSuperuser(db, `select app_private.promote_source_question($1, $2)`, [sqIds.q2, examId]);
    const q2 = await one<{ answer_key: { type: string; correct_option_ids: string[] }; ids: string[]; qt: string }>(
      db,
      `select answer_key, array(select id::text from question_options where question_id = q.id and label in ('A','C') order by id::text) ids, question_type qt from questions q where source_question_id = $1`,
      [sqIds.q2],
    );
    expect(q2.qt).toBe('MULTI_MCQ');
    expect(q2.answer_key.type).toBe('MULTI_MCQ');
    expect([...q2.answer_key.correct_option_ids].sort()).toEqual(q2.ids);

    await asSuperuser(db, `select app_private.promote_source_question($1, $2)`, [sqIds.q3, examId]);
    const q3 = await one<{ question_type: string; answer_key: unknown; subject: string; answer_key_source: string }>(
      db,
      `select question_type, answer_key, (select slug from subjects where id = q.subject_id) subject, answer_key_source from questions q where source_question_id = $1`,
      [sqIds.q3],
    );
    expect(q3).toMatchObject({
      question_type: 'NUMERICAL', subject: 'jee-main-mathematics', answer_key_source: 'OFFICIAL',
      answer_key: { type: 'NUMERICAL', accepted_ranges: [{ min: '2.4', max: '2.6' }], display_value: '2.5' },
    });
  });

  it('a DROPPED official answer sets HUMAN_REVIEW_REQUIRED and leaves no key', async () => {
    await asSuperuser(db, `select app_private.promote_source_question($1, $2)`, [sqIds.q4, examId]);
    const q4 = await one<{ answer_key: unknown; verification_status: string }>(db, `select answer_key, verification_status from questions where source_question_id = $1`, [sqIds.q4]);
    expect(q4).toEqual({ answer_key: null, verification_status: 'HUMAN_REVIEW_REQUIRED' });
    const k = await one<{ question_id: string }>(db, `select question_id from official_answer_keys where paper_id = $1 and question_number = '4'`, [paperId]);
    expect(k.question_id).toBeTruthy();
  });

  it('link_official_answer_keys returns rows updated, is repeatable, and never overrides HUMAN keys', async () => {
    const n = await one<{ n: number }>(db, `select app_private.link_official_answer_keys($1) as n`, [paperId]);
    expect(n.n).toBe(4);
    await asSuperuser(db, `update questions set answer_key = '{"type":"MULTI_MCQ","correct_option_ids":[]}', answer_key_source = 'HUMAN' where source_question_id = $1`, [sqIds.q2]);
    const n2 = await one<{ n: number }>(db, `select app_private.link_official_answer_keys($1) as n`, [paperId]);
    expect(n2.n).toBe(3);
    const q2 = await one<{ answer_key_source: string }>(db, `select answer_key_source from questions where source_question_id = $1`, [sqIds.q2]);
    expect(q2.answer_key_source).toBe('HUMAN');
  });

  it('0024: a re-import that drops a key clears the stale OFFICIAL answer and asks for review', async () => {
    const before = await one<{ answer_key_source: string | null }>(db, `select answer_key_source from questions where source_question_id = $1`, [sqIds.q3]);
    expect(before.answer_key_source).toBe('OFFICIAL');
    await asSuperuser(db, `update official_answer_keys set normalized_answer = '{"kind":"DROPPED"}', is_dropped = true, raw_answer = 'Dropped' where paper_id = $1 and question_number = '3'`, [paperId]);
    await asSuperuser(db, `select app_private.link_official_answer_keys($1)`, [paperId]);
    const after = await one<{ answer_key: unknown; answer_key_source: string | null; verification_status: string }>(
      db, `select answer_key, answer_key_source, verification_status from questions where source_question_id = $1`, [sqIds.q3]);
    expect(after).toEqual({ answer_key: null, answer_key_source: null, verification_status: 'HUMAN_REVIEW_REQUIRED' });
    // A HUMAN answer is still never touched (q2 was set to HUMAN in the previous test).
    const q2 = await one<{ answer_key_source: string }>(db, `select answer_key_source from questions where source_question_id = $1`, [sqIds.q2]);
    expect(q2.answer_key_source).toBe('HUMAN');
  });

  it('official_answer_keys needs a question identifier and is unique per paper/number', async () => {
    await expectPgError(
      asSuperuser(db, `insert into official_answer_keys (source_document_id, paper_id, raw_answer, normalized_answer) values ($1, $2, 'x', '{}')`, [docId, paperId]),
      { code: '23514' },
    );
    await expectPgError(
      asSuperuser(db, `insert into official_answer_keys (source_document_id, paper_id, question_number, raw_answer, normalized_answer) values ($1, $2, '2', 'x', '{}')`, [docId, paperId]),
      { code: '23505' },
    );
  });

  it('origin follows the source kind (OFFICIAL_EXAM_BODY -> PYQ, AI_GENERATION -> AI_GENERATED)', async () => {
    const mkDoc = async (sourceCode: string, kind: string, hashChar: string) => {
      if (sourceCode === 'TESTBODY') {
        await asSuperuser(db, `insert into sources (code, name, kind, reuse_permitted, approved_at) values ('TESTBODY', 'Test body', 'OFFICIAL_EXAM_BODY', true, now())`);
      }
      const d = await one<{ id: string }>(
        db,
        `insert into source_documents (source_id, kind, r2_key, original_filename, mime_type, bytes, sha256)
         select id, 'QUESTION_PAPER', $2, 'f.pdf', 'application/pdf', 1, $3 from sources where code = $1 returning id`,
        [sourceCode, `k/${sourceCode}/${hashChar}.pdf`, sha(hashChar)],
      );
      const n = normalized('1', { content_hash: sha(hashChar), normalized_text: `origin test ${hashChar}`, question_text: `Origin test ${hashChar}` });
      const s = await one<{ id: string }>(
        db,
        `insert into source_questions (source_document_id, question_number, page_start, page_end, status, normalized, normalized_text, content_hash, extraction_method)
         values ($1, '1', 1, 1, 'NORMALIZED', $2::jsonb, $3, $4, 'TEXT') returning id`,
        [d.id, JSON.stringify(n), String(n.normalized_text), sha(hashChar)],
      );
      expect(kind).toBeTruthy();
      return (await one<{ id: string }>(db, `select app_private.promote_source_question($1, $2) as id`, [s.id, examId])).id;
    };
    const pyq = await mkDoc('TESTBODY', 'PYQ', '7');
    const ai = await mkDoc('PROJECTX_AI', 'AI', '8');
    expect((await one<{ origin: string }>(db, `select origin from questions where id = $1`, [pyq])).origin).toBe('PYQ');
    expect((await one<{ origin: string }>(db, `select origin from questions where id = $1`, [ai])).origin).toBe('AI_GENERATED');
  });

  it('find_near_duplicates uses trigram similarity with threshold and limit', async () => {
    const m = await makeQuestion(db, { text: 'Near duplicate base' });
    await asSuperuser(db, `update questions set dedupe_text = 'a particle starts from rest with constant acceleration find the distance covered in three seconds' where id = $1`, [m.id]);
    const near = await asSuperuser<{ question_id: string; similarity: number }>(
      db,
      `select * from app_private.find_near_duplicates('a particle starts from rest with constant acceleration find distance covered in 3 seconds', 0.6)`,
    );
    expect(near.map((r) => r.question_id)).toContain(m.id);
    expect(near.find((r) => r.question_id === m.id)!.similarity).toBeGreaterThan(0.6);
    const exact = await asSuperuser(db, `select * from app_private.find_near_duplicates('a particle starts from rest with constant acceleration find the distance covered in three seconds', 0.99)`);
    expect(exact.map((r) => (r as { question_id: string }).question_id)).toEqual([m.id]);
    const none = await asSuperuser(db, `select * from app_private.find_near_duplicates('completely unrelated chemistry statement about benzene rings', 0.5)`);
    expect(none).toEqual([]);
    const limited = await asSuperuser(db, `select * from app_private.find_near_duplicates('a particle starts from rest', 0.0, 1)`);
    expect(limited.length).toBeLessThanOrEqual(1);
  });
});

describe('seed data', () => {
  it('has the documented taxonomy: 3 exams (only JEE_MAIN active), 10 subjects, 54 chapters (20/20/14), 28 topics', async () => {
    const exams = await asSuperuser<{ code: string; slug: string; is_active: boolean }>(db, `select code, slug, is_active from exams order by sort_order`);
    expect(exams).toEqual([
      { code: 'JEE_MAIN', slug: 'jee-main', is_active: true },
      { code: 'JEE_ADVANCED', slug: 'jee-advanced', is_active: false },
      { code: 'NEET_UG', slug: 'neet-ug', is_active: false },
    ]);
    expect((await one<{ n: string }>(db, `select count(*) n from subjects`)).n).toBe('10');
    const per = await asSuperuser<{ slug: string; n: string }>(db, `select s.slug, count(c.id) n from subjects s left join chapters c on c.subject_id = s.id group by s.slug order by s.slug`);
    expect(Object.fromEntries(per.map((r) => [r.slug, r.n]))).toMatchObject({ 'jee-main-physics': '20', 'jee-main-chemistry': '20', 'jee-main-mathematics': '14', 'neet-ug-botany': '0' });
    expect((await one<{ n: string }>(db, `select count(*) n from topics`)).n).toBe('28');
  });
  it('chapter names/segments/slugs follow the documented derivation', async () => {
    const r = await asSuperuser<{ slug: string; segment: string; unit_number: number }>(
      db,
      `select slug, segment, unit_number from chapters where slug in ('jee-main-chemistry-d-and-f-block-elements','jee-main-physics-work-energy-and-power','jee-main-mathematics-co-ordinate-geometry') order by slug`,
    );
    expect(r).toEqual([
      { slug: 'jee-main-chemistry-d-and-f-block-elements', segment: 'd-and-f-block-elements', unit_number: 11 },
      { slug: 'jee-main-mathematics-co-ordinate-geometry', segment: 'co-ordinate-geometry', unit_number: 10 },
      { slug: 'jee-main-physics-work-energy-and-power', segment: 'work-energy-and-power', unit_number: 4 },
    ]);
    expect((await one<{ slug: string }>(db, `select slug from topics where slug like '%newton-s-laws%'`)).slug).toBe('jee-main-physics-laws-of-motion-newton-s-laws-of-motion');
  });
  it('sources: NTA unapproved; editorial and AI approved', async () => {
    const rows = await asSuperuser<{ code: string; reuse_permitted: boolean; approved: boolean }>(
      db,
      `select code, reuse_permitted, approved_at is not null as approved from sources where code in ('NTA','PROJECTX_EDITORIAL','PROJECTX_AI') order by code`,
    );
    expect(rows).toEqual([
      { code: 'NTA', reuse_permitted: false, approved: false },
      { code: 'PROJECTX_AI', reuse_permitted: true, approved: true },
      { code: 'PROJECTX_EDITORIAL', reuse_permitted: true, approved: true },
    ]);
  });
  it('seeds are idempotent: re-running keeps counts, activation flags and recorded approvals', async () => {
    const { seed } = await import('@projectx/db');
    await asSuperuser(db, `update exams set is_active = true where slug = 'neet-ug'`);
    await asSuperuser(db, `update sources set reuse_permitted = true, approved_at = now() where code = 'NTA'`);
    const before = await one<{ c: string; t: string; s: string }>(db, `select (select count(*) from chapters) c, (select count(*) from topics) t, (select count(*) from sources) s`);
    await seed(db);
    await seed(db);
    const after = await one<{ c: string; t: string; s: string }>(db, `select (select count(*) from chapters) c, (select count(*) from topics) t, (select count(*) from sources) s`);
    expect(after).toEqual(before);
    expect((await one<{ is_active: boolean }>(db, `select is_active from exams where slug = 'neet-ug'`)).is_active).toBe(true);
    expect((await one<{ a: boolean }>(db, `select approved_at is not null a from sources where code = 'NTA'`)).a).toBe(true);
  });
});

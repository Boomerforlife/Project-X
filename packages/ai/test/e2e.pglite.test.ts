import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '@projectx/db/testing';
import { METRIC_CALLS, withBudget } from '../src/gemini/budget.js';
import { createMockGeminiClient } from '../src/gemini/mock.js';
import { runWorker } from '../src/pipeline/runner.js';
import { createSqlAiRepository } from '../src/repo/sql-repo.js';
import { createMockSympyChecker } from '../src/verify/sympy.js';
import type { AiRepository } from '../src/repo/types.js';
import type { HandlerDeps } from '../src/pipeline/handlers/common.js';

let db: TestDb;
let repo: AiRepository;
let deps: HandlerDeps;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return db.withService(async (tx) => {
    const { rows } = await tx.query<T>(sql, params);
    return rows[0] as T;
  });
}
const idOf = (slug: string): Promise<string> => one<{ id: string }>('select id from questions where slug = $1', [slug]).then((r) => r.id);

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  repo = createSqlAiRepository(db);
  deps = {
    repo,
    client: withBudget(createMockGeminiClient(), repo, { dailyBudgetUsd: 1, maxCallsPerRun: 200 }),
    sympy: createMockSympyChecker(),
  };
}, 120000);
afterAll(async () => {
  await db.close();
});

describe('AI pipeline end-to-end on PGlite with dev fixtures (mock provider)', () => {
  it('classify -> solve -> verify -> seo for the fixture DRAFT question', async () => {
    const qid = await idOf('demo-draft-unreviewed-question');
    await repo.enqueueJob({ kind: 'AI_CLASSIFY', idempotencyKey: `AI_CLASSIFY:${qid}:e2e`, payload: { question_id: qid }, questionId: qid });
    const summary = await runWorker({ deps, workerId: 'e2e', once: true, maxJobs: 10 });
    expect(summary).toMatchObject({ processed: 4, succeeded: 4, dead: 0, retried: 0 });

    const q = await one<{ verification_status: string; ingestion_status: string; difficulty: string; answer_key: unknown; publication_status: string; seo_title: string | null; current_solution_id: string | null }>(
      'select verification_status::text, ingestion_status::text, difficulty::text, answer_key, publication_status::text, seo_title, current_solution_id from questions where id = $1',
      [qid],
    );
    expect(q.verification_status).toBe('AUTOMATED_CHECKS_PASSED');
    expect(q.ingestion_status).toBe('CHECKED');
    expect(q.difficulty).toBe('MEDIUM');
    expect(q.answer_key).toBeNull();
    expect(q.publication_status).toBe('DRAFT');
    expect(q.current_solution_id).toBeNull();
    expect(q.seo_title).toBeTruthy();

    const sol = await one<{ version: number; provenance: string; review_status: string; ai_run_id: string; n: number }>(
      `select version, provenance::text, review_status::text, ai_run_id, (select count(*)::int from solution_versions where question_id = $1) as n
         from solution_versions where question_id = $1`,
      [qid],
    );
    expect(sol).toMatchObject({ version: 1, provenance: 'AI_GENERATED', review_status: 'PENDING', n: 1 });
    expect(sol.ai_run_id).toBeTruthy();

    const vr = await one<{ id: string; outcome: string; resulting_status: string; rules_version: string; checks: number }>(
      `select id, outcome::text, resulting_status::text, rules_version, (select count(*)::int from verification_checks c where c.verification_run_id = r.id) as checks
         from verification_runs r where question_id = $1`,
      [qid],
    );
    expect(vr).toMatchObject({ outcome: 'PASSED', resulting_status: 'AUTOMATED_CHECKS_PASSED', rules_version: 'v1', checks: 6 });

    const jobs = await db.withService((tx) =>
      tx.query<{ kind: string; status: string }>(`select kind::text, status::text from pipeline_jobs where question_id = $1 order by created_at, kind`, [qid]),
    );
    expect(jobs.rows.map((j) => j.status)).toEqual(['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED']);

    const runs = await one<{ n: number; succeeded: number }>(
      `select count(*)::int as n, count(*) filter (where status = 'SUCCEEDED')::int as succeeded from ai_runs where question_id = $1`,
      [qid],
    );
    expect(runs.n).toBe(runs.succeeded);
    expect(runs.n).toBeGreaterThanOrEqual(6);

    const audit = await one<{ n: number }>(`select count(*)::int as n from audit_log where actor_type = 'WORKER' and entity_id = $1`, [qid]);
    expect(audit.n).toBeGreaterThanOrEqual(2);
    const calls = await repo.getUsage(new Date().toISOString().slice(0, 10), METRIC_CALLS);
    expect(calls).toBeGreaterThanOrEqual(6);
  });

  it('re-running with a new job key reuses every AI run (no new ai_runs rows) and adds solution v1 only once per ai run', async () => {
    const qid = await idOf('demo-draft-unreviewed-question');
    const before = await one<{ n: number }>('select count(*)::int as n from ai_runs');
    await repo.enqueueJob({ kind: 'AI_CLASSIFY', idempotencyKey: `AI_CLASSIFY:${qid}:e2e:force-1`, payload: { question_id: qid }, questionId: qid });
    await runWorker({ deps, workerId: 'e2e', once: true, maxJobs: 10 });
    const after = await one<{ n: number }>('select count(*)::int as n from ai_runs');
    expect(after.n).toBe(before.n);
    const sols = await one<{ n: number }>('select count(*)::int as n from solution_versions where question_id = $1', [qid]);
    expect(sols.n).toBe(1);
  });

  it('HUMAN_VERIFIED + PUBLISHED fixture is only re-recorded, never changed', async () => {
    const qid = await idOf('demo-constant-acceleration-distance');
    await repo.enqueueJob({ kind: 'AI_CLASSIFY', idempotencyKey: `AI_CLASSIFY:${qid}:e2e`, payload: { question_id: qid }, questionId: qid });
    const summary = await runWorker({ deps, workerId: 'e2e', once: true, maxJobs: 10 });
    expect(summary.dead).toBe(0);
    const q = await one<{ verification_status: string; publication_status: string; current_solution_id: string; answer_key_source: string }>(
      'select verification_status::text, publication_status::text, current_solution_id, answer_key_source::text from questions where id = $1',
      [qid],
    );
    expect(q.verification_status).toBe('HUMAN_VERIFIED');
    expect(q.publication_status).toBe('PUBLISHED');
    expect(q.answer_key_source).toBe('HUMAN');
    const runs = await db.withService((tx) =>
      tx.query<{ resulting_status: string }>('select resulting_status::text from verification_runs where question_id = $1', [qid]),
    );
    expect(runs.rows.length).toBeGreaterThanOrEqual(1);
    expect(runs.rows.every((r) => r.resulting_status === 'HUMAN_VERIFIED')).toBe(true);
  });

  it('a PUBLISHED question that fails re-verification is returned to DRAFT instead of tripping the publication guard', async () => {
    const qid = await idOf('demo-vector-quantities');
    // Simulate a regression: downgrade to an officially keyed question whose key the (default mock) solver will not match.
    await db.withService(async (tx) => {
      await tx.query(`update questions set verification_status = 'OFFICIAL_KEY_MATCHED' where id = $1`, [qid]);
    });
    await repo.recordVerification({
      questionId: qid,
      solutionVersionId: null,
      jobId: null,
      rulesVersion: 'v1',
      outcome: 'FAILED',
      resultingStatus: 'HUMAN_REVIEW_REQUIRED',
      ingestionStatus: 'CHECKED',
      reasons: ['TEST'],
      startedAt: new Date(),
      checks: [],
    });
    const q = await one<{ verification_status: string; publication_status: string }>('select verification_status::text, publication_status::text from questions where id = $1', [qid]);
    expect(q).toEqual({ verification_status: 'HUMAN_REVIEW_REQUIRED', publication_status: 'DRAFT' });
  });

  const staleRun = (qid: string) => ({
    questionId: qid,
    solutionVersionId: null,
    jobId: null,
    rulesVersion: 'v1',
    outcome: 'PASSED' as const,
    resultingStatus: 'AUTOMATED_CHECKS_PASSED' as const,
    ingestionStatus: 'CHECKED' as const,
    reasons: ['TEST'],
    startedAt: new Date(),
    checks: [],
  });
  const statusOf = (qid: string) => one<{ verification_status: string }>('select verification_status::text from questions where id = $1', [qid]);

  it('a human approval landing between read and write is not overwritten', async () => {
    const qid = await idOf('demo-draft-unreviewed-question');
    await db.withService((tx) => tx.query(`update questions set verification_status = 'HUMAN_REVIEW_REQUIRED' where id = $1`, [qid])); // what the handler read
    await db.withService((tx) => tx.query(`update questions set verification_status = 'HUMAN_VERIFIED' where id = $1`, [qid])); // human lands
    const res = await repo.recordVerification(staleRun(qid));
    expect(res.statusApplied).toBe(false);
    expect(res.skippedProtectedStatus).toBe('HUMAN_VERIFIED');
    expect((await statusOf(qid)).verification_status).toBe('HUMAN_VERIFIED');
    const r = await one<{ resulting_status: string }>('select resulting_status::text from verification_runs where id = $1', [res.id]);
    expect(r.resulting_status).toBe('HUMAN_VERIFIED');
  });

  it('DISPUTED stays DISPUTED after AI re-verify and after a pipeline error', async () => {
    const qid = await idOf('demo-draft-unreviewed-question');
    await db.withService((tx) => tx.query(`update questions set verification_status = 'DISPUTED' where id = $1`, [qid]));
    const res = await repo.recordVerification(staleRun(qid));
    expect(res.skippedProtectedStatus).toBe('DISPUTED');
    expect((await statusOf(qid)).verification_status).toBe('DISPUTED');
    await repo.markPipelineError(qid, 'AI_SOLVE', null, 'boom');
    expect((await statusOf(qid)).verification_status).toBe('DISPUTED');
  });

  it('budget deferral persists: job returns to QUEUED without consuming an attempt', async () => {
    const qid = await idOf('demo-roots-of-minus-one');
    const tight: HandlerDeps = { ...deps, client: withBudget(createMockGeminiClient(), repo, { dailyBudgetUsd: 1, maxCallsPerRun: 0 }) };
    await repo.enqueueJob({ kind: 'AI_CLASSIFY', idempotencyKey: `AI_CLASSIFY:${qid}:budget`, payload: { question_id: qid }, questionId: qid });
    const s = await runWorker({ deps: tight, workerId: 'e2e', once: true, maxJobs: 5, now: () => new Date('2026-11-14T23:00:00Z') });
    expect(s.budgetExhausted).toBe(true);
    const job = await one<{ status: string; attempts: number; run_after: Date; locked_by: string | null }>(
      `select status::text, attempts, run_after, locked_by from pipeline_jobs where idempotency_key = $1`,
      [`AI_CLASSIFY:${qid}:budget`],
    );
    expect(job.status).toBe('QUEUED');
    expect(job.attempts).toBe(0);
    expect(job.locked_by).toBeNull();
    expect(new Date(job.run_after).toISOString()).toBe('2026-11-15T00:00:00.000Z');
  });
});

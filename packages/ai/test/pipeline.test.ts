import { describe, expect, it } from 'vitest';
import { withBudget } from '../src/gemini/budget.js';
import { createMockGeminiClient } from '../src/gemini/mock.js';
import { classify } from '../src/modules/classify.js';
import { handleClassify } from '../src/pipeline/handlers/classify.js';
import { JobError } from '../src/pipeline/handlers/common.js';
import { runStage, runWorker } from '../src/pipeline/runner.js';
import { createMockSympyChecker } from '../src/verify/sympy.js';
import type { HandlerDeps } from '../src/pipeline/handlers/common.js';
import type { MemoryAiRepository } from '../src/repo/memory-repo.js';
import { makeDeps, makeQuestion, OPT, Q_ID, TAXONOMY } from './helpers.js';

const classifyJob = (repo: MemoryAiRepository) =>
  repo.enqueueJob({ kind: 'AI_CLASSIFY', idempotencyKey: `AI_CLASSIFY:${Q_ID}:hash-1`, payload: { question_id: Q_ID }, questionId: Q_ID });

async function drain(deps: HandlerDeps & { repo: MemoryAiRepository }, max = 20) {
  await classifyJob(deps.repo);
  return runWorker({ deps, workerId: 't', once: true, maxJobs: max, leaseSeconds: 3600 });
}

const sym = {
  kind: 'NUMERIC_EVAL' as const,
  expression: '2*3',
  compare_to: '6',
  variables: [],
};
const answerB = { kind: 'OPTIONS', labels: ['B'], value: null };
const solveHandler = (answer: unknown, sympy_checks: unknown[] = []) => () => ({
  answer,
  summary: 's',
  steps: [{ title: null, text: 'step', display_math: null }],
  formulas: [],
  concepts: [],
  shortcuts: [],
  common_mistakes: [],
  sympy_checks,
});
const blind = (answer: unknown, confidence = 0.9) => () => ({ answer, confidence, brief_reasoning: '' });
const critic = (verdict: 'CORRECT' | 'INCORRECT' | 'UNSURE', issues: unknown[] = []) => () => ({ verdict, recomputed_answer: null, issues });

describe('stage chaining on the default mock (no official key)', () => {
  it('classify -> solve -> verify -> seo; AI alone yields AUTOMATED_CHECKS_PASSED, never HUMAN_VERIFIED', async () => {
    const deps = makeDeps();
    const summary = await drain(deps);
    expect(summary).toMatchObject({ processed: 4, succeeded: 4, dead: 0 });
    expect(deps.repo.jobs.map((j) => j.kind)).toEqual(['AI_CLASSIFY', 'AI_SOLVE', 'AI_VERIFY', 'AI_SEO']);

    const q = deps.repo.questions.get(Q_ID);
    expect(q?.verificationStatus).toBe('AUTOMATED_CHECKS_PASSED');
    expect(q?.ingestionStatus).toBe('CHECKED');
    expect(q?.chapterId).toBe('ch-kin');
    expect(q?.subjectId).toBe('subj-phy');
    expect(q?.difficulty).toBe('MEDIUM');
    expect(q?.answerKey).toBeNull(); // AI_CONSENSUS keys stay on the solution only
    expect(q?.seoTitle).toBeTruthy();

    expect([...deps.repo.solutions.values()]).toHaveLength(1);
    const run = deps.repo.verificationRuns[0];
    expect(run?.rulesVersion).toBe('v1');
    expect(run?.outcome).toBe('PASSED');
    expect(run?.checks.map((c) => c.kind).sort()).toEqual(
      ['AI_CRITIQUE', 'CLASSIFICATION_CONFIDENCE', 'CONTENT_COMPLETENESS', 'INDEPENDENT_ANSWER_AGREEMENT', 'OFFICIAL_KEY_MATCH', 'SYMPY_CHECK'],
    );
    expect(run?.checks.find((c) => c.kind === 'OFFICIAL_KEY_MATCH')?.result).toBe('SKIPPED');
  });

  it('is idempotent: re-enqueueing the same keys creates no new jobs and AI runs are reused by input_hash', async () => {
    const deps = makeDeps();
    await drain(deps);
    const jobs = deps.repo.jobs.length;
    const runs = deps.repo.runs.length;
    // Same job via a force-style fresh key: stages rerun but every AI call is served from ai_runs.
    const again = await handleClassify(deps, { id: null, kind: 'AI_CLASSIFY', payload: { question_id: Q_ID }, questionId: Q_ID });
    expect(again.result.stage).toBe('classify');
    expect(deps.repo.runs.length).toBe(runs);
    await classifyJob(deps.repo);
    expect(deps.repo.jobs.length).toBe(jobs);
  });

  it('counts model calls: a second identical module call is not sent to the client', async () => {
    let calls = 0;
    const deps = makeDeps({ mock: { handlers: { CLASSIFY: () => (calls++, { subject_code: 'PHYSICS', chapter_slug: 'jee-main-physics-kinematics', topic_slug: null, difficulty: 'EASY', question_type: 'SINGLE_MCQ', confidence: 0.8, rationale: 'r' }) } } });
    const q = makeQuestion();
    const ctx = { client: deps.client, repo: deps.repo };
    const first = await classify(ctx, q, TAXONOMY);
    const second = await classify(ctx, q, TAXONOMY);
    expect(first.ok && second.ok).toBe(true);
    expect(second.ok && second.reused).toBe(true);
    expect(calls).toBe(1);
  });

  it('classification fills only null columns and never overwrites', async () => {
    const deps = makeDeps({ question: makeQuestion({ chapterId: 'ch-lom', subjectId: 'subj-phy', difficulty: 'HARD' }) });
    await drain(deps);
    const q = deps.repo.questions.get(Q_ID);
    expect(q?.chapterId).toBe('ch-lom');
    expect(q?.difficulty).toBe('HARD');
  });
});

describe('official key paths', () => {
  const keyA = { answerKey: { type: 'SINGLE_MCQ' as const, correct_option_ids: [OPT.A] }, answerKeySource: 'OFFICIAL' as const };

  it('solver sees the official answer; ANSWER and CRITIQUE never do', async () => {
    const prompts: Record<string, string> = {};
    const capture = (task: string, out: unknown) => (req: { prompt: string }) => ((prompts[task] = req.prompt), out);
    const deps = makeDeps({
      question: makeQuestion(keyA),
      mock: {
        handlers: {
          SOLVE: capture('SOLVE', solveHandler({ kind: 'OPTIONS', labels: ['A'], value: null })()),
          ANSWER: capture('ANSWER', blind({ kind: 'OPTIONS', labels: ['A'], value: null })()),
          CRITIQUE: capture('CRITIQUE', critic('CORRECT')()),
        },
      },
    });
    await drain(deps);
    expect(prompts.SOLVE).toContain('The official answer is A.');
    expect(prompts.ANSWER).not.toMatch(/official/i);
    expect(prompts.CRITIQUE).not.toMatch(/official/i);
    expect(prompts.CRITIQUE).toContain('Step 0');
    expect(prompts.CRITIQUE).not.toMatch(/final answer/i);
    expect(deps.repo.questions.get(Q_ID)?.verificationStatus).toBe('OFFICIAL_KEY_MATCHED');
  });

  it('mismatch -> HUMAN_REVIEW_REQUIRED (no SEO job)', async () => {
    const deps = makeDeps({
      question: makeQuestion(keyA),
      mock: { handlers: { SOLVE: solveHandler(answerB), ANSWER: blind({ kind: 'OPTIONS', labels: ['A'], value: null }), CRITIQUE: critic('CORRECT') } },
    });
    await drain(deps);
    const q = deps.repo.questions.get(Q_ID);
    expect(q?.verificationStatus).toBe('HUMAN_REVIEW_REQUIRED');
    expect(deps.repo.verificationRuns[0]?.reasons).toContain('OFFICIAL_KEY_MISMATCH');
    expect(deps.repo.jobs.some((j) => j.kind === 'AI_SEO')).toBe(false);
  });

  it('strong conflict (solver and blind agree against the key, sympy passes) -> DISPUTED', async () => {
    const deps = makeDeps({
      question: makeQuestion(keyA),
      mock: { handlers: { SOLVE: solveHandler(answerB, [sym]), ANSWER: blind(answerB), CRITIQUE: critic('CORRECT') } },
    });
    await drain(deps);
    expect(deps.repo.questions.get(Q_ID)?.verificationStatus).toBe('DISPUTED');
    expect(deps.repo.verificationRuns[0]?.reasons).toContain('KEY_CONFLICT_STRONG');
  });

  it('strong conflict is downgraded to review when sympy fails', async () => {
    const deps = makeDeps({
      question: makeQuestion(keyA),
      sympy: createMockSympyChecker({ 'sc-0': 'FAIL' }),
      mock: { handlers: { SOLVE: solveHandler(answerB, [sym]), ANSWER: blind(answerB), CRITIQUE: critic('CORRECT') } },
    });
    await drain(deps);
    expect(deps.repo.questions.get(Q_ID)?.verificationStatus).toBe('HUMAN_REVIEW_REQUIRED');
  });

  it('dropped questions go to review regardless of checks', async () => {
    const deps = makeDeps({ question: makeQuestion({ officialKeyDropped: true }) });
    await drain(deps);
    const q = deps.repo.questions.get(Q_ID);
    expect(q?.verificationStatus).toBe('HUMAN_REVIEW_REQUIRED');
    expect(deps.repo.verificationRuns[0]?.reasons).toContain('DROPPED_BY_EXAM_BODY');
  });
});

describe('automatic path negatives', () => {
  it('critique INCORRECT -> review, no SEO', async () => {
    const deps = makeDeps({ mock: { handlers: { CRITIQUE: critic('INCORRECT') } } });
    await drain(deps);
    expect(deps.repo.questions.get(Q_ID)?.verificationStatus).toBe('HUMAN_REVIEW_REQUIRED');
    expect(deps.repo.jobs.some((j) => j.kind === 'AI_SEO')).toBe(false);
  });

  it('a MAJOR critique issue fails the check even when the verdict is CORRECT', async () => {
    const deps = makeDeps({ mock: { handlers: { CRITIQUE: critic('CORRECT', [{ severity: 'MAJOR', step_index: 0, description: 'bad' }]) } } });
    await drain(deps);
    expect(deps.repo.verificationRuns[0]?.checks.find((c) => c.kind === 'AI_CRITIQUE')?.result).toBe('FAIL');
  });

  it('blind answer disagreement -> FAILED review', async () => {
    const deps = makeDeps({ mock: { handlers: { SOLVE: solveHandler({ kind: 'OPTIONS', labels: ['A'], value: null }), ANSWER: blind({ kind: 'OPTIONS', labels: ['C'], value: null }) } } });
    await drain(deps);
    const run = deps.repo.verificationRuns[0];
    expect(run?.outcome).toBe('FAILED');
    expect(run?.checks.find((c) => c.kind === 'INDEPENDENT_ANSWER_AGREEMENT')?.result).toBe('FAIL');
  });

  it('low blind confidence is INCONCLUSIVE -> NEEDS_REVIEW', async () => {
    const deps = makeDeps({ mock: { handlers: { SOLVE: solveHandler(answerB), ANSWER: blind(answerB, 0.3) } } });
    await drain(deps);
    expect(deps.repo.verificationRuns[0]?.outcome).toBe('NEEDS_REVIEW');
  });

  it('low classification confidence blocks automatic passing but the pipeline still proceeds', async () => {
    const deps = makeDeps({
      mock: { handlers: { CLASSIFY: () => ({ subject_code: 'PHYSICS', chapter_slug: 'jee-main-physics-kinematics', topic_slug: null, difficulty: 'EASY', question_type: 'SINGLE_MCQ', confidence: 0.2, rationale: 'r' }) } },
    });
    await drain(deps);
    expect(deps.repo.questions.get(Q_ID)?.verificationStatus).toBe('HUMAN_REVIEW_REQUIRED');
    expect(deps.repo.verificationRuns[0]?.checks.find((c) => c.kind === 'CLASSIFICATION_CONFIDENCE')?.result).toBe('FAIL');
  });

  it('a failing sympy check blocks automatic passing', async () => {
    const deps = makeDeps({ sympy: createMockSympyChecker({ 'sc-0': 'FAIL' }), mock: { handlers: { SOLVE: solveHandler(answerB, [sym]), ANSWER: blind(answerB) } } });
    await drain(deps);
    expect(deps.repo.verificationRuns[0]?.checks.find((c) => c.kind === 'SYMPY_CHECK')?.result).toBe('FAIL');
    expect(deps.repo.questions.get(Q_ID)?.verificationStatus).toBe('HUMAN_REVIEW_REQUIRED');
  });

  it('schema-invalid blind answer is recorded as an ERROR check, not a crash', async () => {
    const deps = makeDeps({ mock: { handlers: { ANSWER: () => ({ nonsense: true }) } } });
    const summary = await drain(deps);
    expect(summary.dead).toBe(0);
    expect(deps.repo.verificationRuns[0]?.checks.find((c) => c.kind === 'INDEPENDENT_ANSWER_AGREEMENT')?.result).toBe('ERROR');
    expect(deps.repo.questions.get(Q_ID)?.verificationStatus).toBe('HUMAN_REVIEW_REQUIRED');
    expect(deps.repo.runs.some((r) => r.status === 'SCHEMA_INVALID')).toBe(true);
  });

  it('incomplete content stops the chain and flags NEEDS_ATTENTION', async () => {
    const deps = makeDeps({ mock: { handlers: { QUALITY: () => ({ is_complete: false, is_ambiguous: false, ocr_errors_suspected: false, missing_figure: true, issues: ['figure missing'] }) } } });
    const summary = await drain(deps);
    expect(summary.processed).toBe(1);
    expect(deps.repo.questions.get(Q_ID)?.ingestionStatus).toBe('NEEDS_ATTENTION');
    expect(deps.repo.jobs.some((j) => j.kind === 'AI_SOLVE')).toBe(false);
  });

  it('structurally broken MCQ (1 option) fails CONTENT_COMPLETENESS -> NEEDS_ATTENTION', async () => {
    const deps = makeDeps({ question: makeQuestion({ options: [{ id: OPT.A, label: 'A', text: 'only' }] }) });
    await drain(deps);
    const q = deps.repo.questions.get(Q_ID);
    expect(q?.ingestionStatus).toBe('NEEDS_ATTENTION');
    expect(deps.repo.verificationRuns[0]?.reasons).toContain('CONTENT_INCOMPLETE');
  });

  it('unresolved asset refs fail CONTENT_COMPLETENESS', async () => {
    const deps = makeDeps({ question: makeQuestion({ referencedAssetIds: ['missing-asset'] }) });
    await drain(deps);
    expect(deps.repo.verificationRuns[0]?.reasons).toContain('CONTENT_INCOMPLETE');
  });
});

describe('HUMAN_VERIFIED immutability through the pipeline', () => {
  it('records the run, keeps HUMAN_VERIFIED, and flags REVERIFY_REGRESSION without enqueuing SEO', async () => {
    const deps = makeDeps({
      question: makeQuestion({ verificationStatus: 'HUMAN_VERIFIED', answerKey: { type: 'SINGLE_MCQ', correct_option_ids: [OPT.A] }, answerKeySource: 'OFFICIAL' }),
      mock: { handlers: { SOLVE: solveHandler(answerB), ANSWER: blind(answerB), CRITIQUE: critic('CORRECT') } },
    });
    await drain(deps);
    expect(deps.repo.questions.get(Q_ID)?.verificationStatus).toBe('HUMAN_VERIFIED');
    const run = deps.repo.verificationRuns[0];
    expect(run?.resultingStatus).toBe('HUMAN_VERIFIED');
    expect(run?.reasons).toContain('REVERIFY_REGRESSION');
    expect(deps.repo.jobs.some((j) => j.kind === 'AI_SEO')).toBe(false);
  });

  it('a pipeline error never changes HUMAN_VERIFIED', async () => {
    const deps = makeDeps({ question: makeQuestion({ verificationStatus: 'HUMAN_VERIFIED' }) });
    await deps.repo.markPipelineError(Q_ID, 'AI_SOLVE', null, 'x');
    expect(deps.repo.questions.get(Q_ID)?.verificationStatus).toBe('HUMAN_VERIFIED');
  });

  it('DISPUTED stays DISPUTED after AI re-verify and after a pipeline error', async () => {
    const deps = makeDeps({ question: makeQuestion({ verificationStatus: 'DISPUTED' }) });
    await drain(deps);
    expect(deps.repo.questions.get(Q_ID)?.verificationStatus).toBe('DISPUTED');
    expect(deps.repo.verificationRuns[0]?.resultingStatus).toBe('DISPUTED');
    await deps.repo.markPipelineError(Q_ID, 'AI_SOLVE', null, 'x');
    expect(deps.repo.questions.get(Q_ID)?.verificationStatus).toBe('DISPUTED');
  });
});

describe('runner failure handling', () => {
  it('retryable transport failures are re-queued, then DEAD -> PIPELINE_ERROR / NEEDS_ATTENTION', async () => {
    const deps = makeDeps({
      mock: {
        handlers: {
          SOLVE: () => {
            throw new Error('network down');
          },
        },
      },
    });
    await classifyJob(deps.repo);
    for (const j of deps.repo.jobs) j.maxAttempts = 2;
    let now = Date.now();
    const clockDeps = deps;
    const first = await runWorker({ deps: clockDeps, workerId: 't', once: true, now: () => new Date(now) });
    expect(first.succeeded).toBe(1); // classify
    const solveJob = deps.repo.jobs.find((j) => j.kind === 'AI_SOLVE');
    expect(solveJob?.status).toBe('QUEUED');
    expect(solveJob?.attempts).toBe(1);
    solveJob!.maxAttempts = 2;
    now += 3_600_000;
    deps.repo.jobs.forEach((j) => (j.runAfter = new Date(0)));
    const second = await runWorker({ deps: clockDeps, workerId: 't', once: true });
    expect(second.dead).toBe(1);
    expect(deps.repo.jobs.find((j) => j.kind === 'AI_SOLVE')?.status).toBe('DEAD');
    expect(deps.repo.pipelineErrors).toHaveLength(1);
    expect(deps.repo.questions.get(Q_ID)).toMatchObject({ verificationStatus: 'HUMAN_REVIEW_REQUIRED', ingestionStatus: 'NEEDS_ATTENTION' });
  });

  it('non-retryable errors die immediately', async () => {
    const deps = makeDeps({ mock: { handlers: { SOLVE: solveHandler({ kind: 'OPTIONS', labels: ['E'], value: null }) } } });
    const summary = await drain(deps);
    expect(summary.dead).toBe(1);
    expect(deps.repo.pipelineErrors[0]?.jobKind).toBe('AI_SOLVE');
    expect(deps.repo.jobs.find((j) => j.kind === 'AI_SOLVE')?.lastError).toMatch(/label E/);
  });

  it('budget exhaustion defers the job to the next UTC day and stops the worker', async () => {
    const base = makeDeps();
    const deps: HandlerDeps & { repo: MemoryAiRepository } = {
      ...base,
      client: withBudget(createMockGeminiClient(), base.repo, { dailyBudgetUsd: 1, maxCallsPerRun: 0 }),
    };
    const now = new Date('2026-11-14T22:00:00Z');
    await classifyJob(deps.repo);
    const summary = await runWorker({ deps, workerId: 't', once: true, now: () => now });
    expect(summary).toMatchObject({ budgetExhausted: true, deferred: 1, succeeded: 0 });
    const job = deps.repo.jobs[0];
    expect(job?.status).toBe('QUEUED');
    expect(job?.attempts).toBe(0);
    expect(job?.runAfter.toISOString()).toBe('2026-11-15T00:00:00.000Z');
  });

  it('runStage runs one handler inline without a queue', async () => {
    const deps = makeDeps();
    const out = await runStage(deps, 'AI_CLASSIFY', Q_ID);
    expect(out.next[0]?.kind).toBe('AI_SOLVE');
    expect(deps.repo.jobs).toHaveLength(0);
  });

  it('JobError carries retryability', () => {
    expect(new JobError('x', false).retryable).toBe(false);
  });
});

import { answer } from '../../modules/answer.js';
import { critique } from '../../modules/critique.js';
import { quality } from '../../modules/quality.js';
import { AnswerOutputSchema } from '../../schemas/answer.js';
import { ClassificationOutputSchema } from '../../schemas/classification.js';
import { aiAnswerMatchesKey, keyToAiAnswer } from '../../verify/answers.js';
import {
  aiCritique,
  classificationConfidence,
  contentCompleteness,
  independentAgreement,
  officialKeyMatch,
  sympyCheck,
  type CheckOutcome,
} from '../../verify/checks.js';
import { decideVerification } from '../../verify/rules.js';
import { CHECK_KINDS, RULES_VERSION, type CheckKind, type CheckResult } from '../../types.js';
import type { TaskResult } from '../../modules/run.js';
import { qualityNotes } from './classify.js';
import {
  BudgetExceededError,
  JobError,
  moduleCtx,
  requireQuestion,
  type HandlerDeps,
  type HandlerOutcome,
  type JobInput,
} from './common.js';

/** Hard failures abort the job (retry/budget); soft ones (schema-invalid, blocked) become ERROR checks. */
function soft<T>(r: TaskResult<T>): { ok: true; value: T; runId: string } | { ok: false; message: string } {
  if (r.ok) return r;
  if (r.kind === 'BUDGET_EXCEEDED') throw new BudgetExceededError(r.message);
  if (r.retryable) throw new JobError(`${r.kind}: ${r.message}`, true);
  return { ok: false, message: `${r.kind}: ${r.message}` };
}

/** AI_VERIFY: run the six checks, apply decideVerification, record run + checks, chain AI_SEO on PASSED. */
export async function handleVerify(deps: HandlerDeps, job: JobInput): Promise<HandlerOutcome> {
  const q = await requireQuestion(deps, job);
  const solutionId = typeof job.payload.solution_version_id === 'string' ? job.payload.solution_version_id : null;
  if (!solutionId) throw new JobError('AI_VERIFY payload needs solution_version_id', false);
  const solution = await deps.repo.getSolution(solutionId);
  if (!solution || solution.questionId !== q.id) throw new JobError(`solution ${solutionId} not found for question`, false);
  const ctx = moduleCtx(deps, job.id);
  const startedAt = new Date();

  // CLASSIFICATION_CONFIDENCE (latest classification) and the quality notes derived from it.
  const clsRun = await deps.repo.findLatestSucceededRun(q.id, 'CLASSIFY');
  const clsParsed = clsRun ? ClassificationOutputSchema.safeParse(clsRun.output) : null;
  const cls = clsRun && clsParsed?.success ? { out: clsParsed.data, runId: clsRun.id } : null;

  const ql = soft(await quality(ctx, q, qualityNotes(q, cls?.out ?? null)));
  const solutionAnswer = keyToAiAnswer(q, solution.finalAnswer);
  const blindRes = soft(await answer(ctx, q));
  const critiqueRes = soft(await critique(ctx, q, solution));

  const blind = blindRes.ok ? AnswerOutputSchema.parse(blindRes.value) : null;
  const outcomes: CheckOutcome[] = [
    contentCompleteness(q, ql.ok ? { out: ql.value, runId: ql.runId } : null),
    classificationConfidence(q, cls ? { confidence: cls.out.confidence, runId: cls.runId } : null),
    officialKeyMatch(q, solution),
    solutionAnswer
      ? independentAgreement(q, solutionAnswer, blind && blindRes.ok ? { answer: blind.answer, confidence: blind.confidence, runId: blindRes.runId } : null, blindRes.ok ? undefined : blindRes.message)
      : { kind: 'INDEPENDENT_ANSWER_AGREEMENT', result: 'ERROR', details: { error: 'solution answer references unknown option' }, aiRunId: null },
    await sympyCheck(solution, deps.sympy),
    aiCritique(critiqueRes.ok ? { out: critiqueRes.value, runId: critiqueRes.runId } : null, critiqueRes.ok ? undefined : critiqueRes.message),
  ];
  const byKind = Object.fromEntries(outcomes.map((o) => [o.kind, o])) as Record<CheckKind, CheckOutcome>;
  const results = Object.fromEntries(CHECK_KINDS.map((k) => [k, byKind[k].result])) as Record<CheckKind, CheckResult>;

  const officialKeyExists = q.answerKey !== null && q.answerKeySource === 'OFFICIAL';
  const decision = decideVerification({
    currentStatus: q.verificationStatus,
    officialKeyExists,
    officialKeyDropped: q.officialKeyDropped,
    checks: results,
    blindAnswerEqualsKey: officialKeyExists && blind && q.answerKey ? aiAnswerMatchesKey(q, blind.answer, q.answerKey) : null,
  });

  const runId = await deps.repo.recordVerification({
    questionId: q.id,
    solutionVersionId: solution.id,
    jobId: job.id,
    rulesVersion: RULES_VERSION,
    outcome: decision.outcome,
    resultingStatus: decision.status,
    ingestionStatus: decision.ingestionStatus,
    reasons: decision.reasons,
    startedAt,
    checks: outcomes.map((o) => ({ kind: o.kind, result: o.result, details: o.details, aiRunId: o.aiRunId })),
  });

  return {
    result: {
      stage: 'verify',
      verification_run_id: runId,
      outcome: decision.outcome,
      status: decision.status,
      previous_status: q.verificationStatus,
      reasons: decision.reasons,
      checks: results,
    },
    next:
      decision.outcome === 'PASSED'
        ? [
            {
              kind: 'AI_SEO',
              idempotencyKey: `AI_SEO:${q.id}:${solution.id}`,
              payload: { question_id: q.id, solution_version_id: solution.id },
              questionId: q.id,
            },
          ]
        : [],
  };
}

import { solve, toNewSolution } from '../../modules/solve.js';
import { RULES_VERSION } from '../../types.js';
import { JobError, moduleCtx, requireQuestion, unwrap, type HandlerDeps, type HandlerOutcome, type JobInput } from './common.js';

/** AI_SOLVE: official key (if any) is shown to the solver; result stored as solution_versions row (AI_GENERATED, PENDING). */
export async function handleSolve(deps: HandlerDeps, job: JobInput): Promise<HandlerOutcome> {
  const q = await requireQuestion(deps, job);
  const ctx = moduleCtx(deps, job.id);
  const sol = unwrap(await solve(ctx, q), 'solution');

  const mapped = toNewSolution(q, sol.value, sol.runId);
  if (!mapped.ok) throw new JobError(`solution answer cannot be mapped: ${mapped.reason}`, false);

  const existing = await deps.repo.findSolutionByAiRun(sol.runId);
  const solution = existing ?? (await deps.repo.insertSolution(mapped.value));
  await deps.repo.setIngestionStatus(q.id, 'SOLVED');

  return {
    result: { stage: 'solve', solution_version_id: solution.id, version: solution.version, ai_run_id: sol.runId, reused: existing !== null },
    next: [
      {
        kind: 'AI_VERIFY',
        idempotencyKey: `AI_VERIFY:${q.id}:${solution.id}:${RULES_VERSION}`,
        payload: { question_id: q.id, solution_version_id: solution.id },
        questionId: q.id,
      },
    ],
  };
}

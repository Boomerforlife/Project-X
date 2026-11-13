import type { GeminiClient } from '../../gemini/client.js';
import type { ImageLoader, ModuleContext, TaskResult } from '../../modules/run.js';
import type { AiRepository, EnqueueJob, QuestionRecord } from '../../repo/types.js';
import type { SympyChecker } from '../../verify/sympy.js';
import type { JobKind } from '../../types.js';
import { PIPELINE_VERSION } from '../../types.js';

export interface HandlerDeps {
  repo: AiRepository;
  client: GeminiClient;
  sympy: SympyChecker;
  imageLoader?: ImageLoader;
  models?: ModuleContext['models'];
  log?: (entry: Record<string, unknown>) => void;
}

export interface JobInput {
  id: string | null;
  kind: JobKind;
  payload: Record<string, unknown>;
  questionId: string | null;
}

export interface HandlerOutcome {
  result: Record<string, unknown>;
  /** Jobs to enqueue after this stage succeeded (idempotent keys). */
  next: EnqueueJob[];
}

export class JobError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'JobError';
  }
}

/** Thrown when the daily budget or per-run cap is hit; the runner defers the job to the next UTC day. */
export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export function moduleCtx(deps: HandlerDeps, jobId: string | null): ModuleContext {
  return {
    client: deps.client,
    repo: deps.repo,
    jobId,
    ...(deps.imageLoader ? { imageLoader: deps.imageLoader } : {}),
    ...(deps.models ? { models: deps.models } : {}),
  };
}

export function unwrap<T>(r: TaskResult<T>, what: string): { value: T; runId: string; reused: boolean } {
  if (r.ok) return r;
  if (r.kind === 'BUDGET_EXCEEDED') throw new BudgetExceededError(r.message);
  throw new JobError(`${what} failed (${r.kind}): ${r.message}`, r.retryable);
}

export async function requireQuestion(deps: HandlerDeps, job: JobInput): Promise<QuestionRecord> {
  const id = typeof job.payload.question_id === 'string' ? job.payload.question_id : job.questionId;
  if (!id) throw new JobError('job has no question_id', false);
  const q = await deps.repo.loadQuestion(id);
  if (!q) throw new JobError(`question ${id} not found`, false);
  return q;
}

export function contentHashOf(q: QuestionRecord): string {
  return q.contentHash ?? q.id;
}

export const SOLVE_VERSION = PIPELINE_VERSION;

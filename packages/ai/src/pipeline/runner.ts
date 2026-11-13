import { nextUtcDayStart } from '../gemini/budget.js';
import type { JobKind } from '../types.js';
import { BudgetExceededError, JobError, type HandlerDeps, type HandlerOutcome } from './handlers/common.js';
import { HANDLERS } from './handlers/index.js';

export const AI_JOB_KINDS: JobKind[] = ['AI_CLASSIFY', 'AI_SOLVE', 'AI_VERIFY', 'AI_SEO'];

export interface RunnerOptions {
  deps: HandlerDeps;
  workerId: string;
  kinds?: JobKind[];
  maxJobs?: number;
  leaseSeconds?: number;
  /** Stop when the queue is empty instead of polling. */
  once?: boolean;
  pollMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunnerSummary {
  processed: number;
  succeeded: number;
  retried: number;
  dead: number;
  deferred: number;
  budgetExhausted: boolean;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Claim -> heartbeat -> handler -> enqueue next -> complete/fail. One job at a time. */
export async function runWorker(opts: RunnerOptions): Promise<RunnerSummary> {
  const { deps, workerId } = opts;
  const kinds = opts.kinds ?? AI_JOB_KINDS;
  const maxJobs = opts.maxJobs ?? 50;
  const lease = opts.leaseSeconds ?? 600;
  const now = opts.now ?? ((): Date => new Date());
  const sleep = opts.sleep ?? defaultSleep;
  const log = deps.log ?? ((): void => undefined);
  const summary: RunnerSummary = { processed: 0, succeeded: 0, retried: 0, dead: 0, deferred: 0, budgetExhausted: false };

  while (summary.processed < maxJobs && !summary.budgetExhausted) {
    const job = await deps.repo.claimJob(workerId, kinds, lease);
    if (!job) {
      if (opts.once) break;
      await sleep(opts.pollMs ?? 5000);
      continue;
    }
    summary.processed += 1;
    log({ event: 'job.claimed', job_id: job.id, kind: job.kind, attempts: job.attempts });
    const heartbeat = setInterval(() => {
      deps.repo.heartbeatJob(job.id, workerId, lease).catch((e: unknown) => log({ event: 'job.heartbeat_failed', job_id: job.id, error: String(e) }));
    }, Math.max(1000, (lease * 1000) / 3));

    try {
      const outcome = await HANDLERS[job.kind](deps, {
        id: job.id,
        kind: job.kind,
        payload: job.payload,
        questionId: job.questionId,
      });
      for (const next of outcome.next) await deps.repo.enqueueJob(next);
      await deps.repo.completeJob(job.id, workerId, outcome.result);
      await deps.repo.logJobEvent(job.id, 'INFO', job.kind, 'completed', outcome.result).catch(() => undefined);
      summary.succeeded += 1;
      log({ event: 'job.succeeded', job_id: job.id, kind: job.kind, result: outcome.result });
    } catch (e) {
      if (e instanceof BudgetExceededError) {
        await deps.repo.deferJob(job.id, workerId, nextUtcDayStart(now()), e.message);
        summary.deferred += 1;
        summary.budgetExhausted = true;
        log({ event: 'job.deferred', job_id: job.id, kind: job.kind, reason: e.message });
      } else {
        const retryable = e instanceof JobError ? e.retryable : true;
        const message = e instanceof Error ? e.message : String(e);
        const state = await deps.repo.failJob(job.id, workerId, message, retryable);
        await deps.repo.logJobEvent(job.id, 'ERROR', job.kind, message.slice(0, 1900)).catch(() => undefined);
        if (state === 'DEAD') {
          summary.dead += 1;
          if (job.questionId) await deps.repo.markPipelineError(job.questionId, job.kind, job.id, message);
        } else {
          summary.retried += 1;
        }
        log({ event: 'job.failed', job_id: job.id, kind: job.kind, state, retryable, error: message });
      }
    } finally {
      clearInterval(heartbeat);
    }
  }
  return summary;
}

/** Runs one handler directly (CLI process-question): no claiming, caller decides how to chain. */
export function runStage(deps: HandlerDeps, kind: JobKind, questionId: string, payload: Record<string, unknown> = {}): Promise<HandlerOutcome> {
  return HANDLERS[kind](deps, { id: null, kind, payload: { question_id: questionId, ...payload }, questionId });
}

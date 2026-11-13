import { hostname } from 'node:os';
import { parseArgs } from 'node:util';
import { ConfigError, loadConfig, type AiConfig } from './config.js';
import { METRIC_CALLS, METRIC_COST, utcDay } from './gemini/budget.js';
import { BudgetExceededError, JobError, type HandlerDeps } from './pipeline/handlers/common.js';
import { AI_JOB_KINDS, runStage, runWorker } from './pipeline/runner.js';
import { DryRunAiRepository } from './repo/dry-run.js';
import { createSqlAiRepository } from './repo/sql-repo.js';
import type { AiRepository, EnqueueJob } from './repo/types.js';
import { buildHandlerDeps, openDb } from './runtime.js';
import { PIPELINE_VERSION, RULES_VERSION, type Db, type JobKind } from './types.js';

const EXIT = { OK: 0, OTHER: 1, CONFIG: 2, BUDGET: 3 } as const;
const STAGE_KIND: Record<string, JobKind> = { classify: 'AI_CLASSIFY', solve: 'AI_SOLVE', verify: 'AI_VERIFY', seo: 'AI_SEO' };

function log(entry: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
}

const USAGE = `usage: ai <command> [options]
  run-worker [--kinds AI_CLASSIFY,AI_SOLVE,AI_VERIFY,AI_SEO] [--max-jobs 50] [--worker-id ai-<host>] [--lease 600] [--once]
  process-question --id <uuid|slug> [--stages classify,solve,verify,seo]
  enqueue --kind AI_VERIFY --question <uuid|slug> [--force]
  budget
global: --db pglite|postgres  --provider mock|gemini  --dry-run`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      db: { type: 'string' },
      provider: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      kinds: { type: 'string' },
      'max-jobs': { type: 'string' },
      'worker-id': { type: 'string' },
      lease: { type: 'string' },
      once: { type: 'boolean', default: false },
      id: { type: 'string' },
      stages: { type: 'string' },
      kind: { type: 'string' },
      question: { type: 'string' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const command = positionals[0];
  if (!command || values.help) {
    process.stdout.write(`${USAGE}\n`);
    return command ? EXIT.OK : EXIT.CONFIG;
  }

  const loaded = loadConfig(process.env, { provider: values.provider, db: values.db });
  for (const w of loaded.warnings) log({ level: 'WARN', message: w });
  const config = loaded.config;

  const db = await openDb(config);
  try {
    let repo: AiRepository = createSqlAiRepository(db);
    if (values['dry-run']) repo = new DryRunAiRepository(repo);
    const deps = buildHandlerDeps(config, repo, log);

    switch (command) {
      case 'run-worker':
        return await cmdRunWorker(deps, values);
      case 'process-question':
        return await cmdProcess(deps, values.id, values.stages);
      case 'enqueue':
        return await cmdEnqueue(deps, values.kind, values.question, values.force === true);
      case 'budget':
        return await cmdBudget(deps.repo, config);
      default:
        process.stderr.write(`unknown command: ${command}\n${USAGE}\n`);
        return EXIT.CONFIG;
    }
  } finally {
    await db.close();
  }
}

async function cmdRunWorker(
  deps: HandlerDeps,
  v: { kinds?: string | undefined; 'max-jobs'?: string | undefined; 'worker-id'?: string | undefined; lease?: string | undefined; once?: boolean | undefined },
): Promise<number> {
  const kinds = (v.kinds ? v.kinds.split(',').map((k) => k.trim()) : AI_JOB_KINDS) as JobKind[];
  for (const k of kinds) if (!AI_JOB_KINDS.includes(k)) throw new ConfigError(`unsupported job kind: ${k}`);
  const summary = await runWorker({
    deps,
    kinds,
    workerId: v['worker-id'] ?? `ai-${hostname()}`,
    maxJobs: v['max-jobs'] ? Number(v['max-jobs']) : 50,
    leaseSeconds: v.lease ? Number(v.lease) : 600,
    once: v.once === true,
  });
  log({ event: 'run-worker.done', ...summary });
  return summary.budgetExhausted ? EXIT.BUDGET : EXIT.OK;
}

async function cmdProcess(deps: HandlerDeps, idArg: string | undefined, stagesArg: string | undefined): Promise<number> {
  if (!idArg) throw new ConfigError('process-question requires --id');
  const id = await deps.repo.resolveQuestionId(idArg);
  if (!id) throw new ConfigError(`question not found: ${idArg}`);
  const stages = (stagesArg ?? 'classify,solve,verify,seo').split(',').map((s) => s.trim());
  for (const s of stages) if (!(s in STAGE_KIND)) throw new ConfigError(`unknown stage: ${s}`);

  let carried: EnqueueJob[] = [];
  let stoppedAfter: string | null = null;
  for (const [i, stage] of stages.entries()) {
    const kind = STAGE_KIND[stage] as JobKind;
    let payload: Record<string, unknown> = {};
    if (i > 0) {
      const next = carried.find((j) => j.kind === kind);
      if (!next) {
        stoppedAfter = stages[i - 1] ?? null;
        break;
      }
      payload = next.payload;
    } else if (kind === 'AI_VERIFY' || kind === 'AI_SEO') {
      const sol = await deps.repo.findLatestSolution(id);
      if (!sol) throw new ConfigError('no solution exists yet; run the solve stage first');
      payload = { solution_version_id: sol.id };
    }
    const outcome = await runStage(deps, kind, id, payload);
    log({ event: 'stage.done', stage, result: outcome.result });
    carried = outcome.next;
  }

  const q = await deps.repo.loadQuestion(id);
  log({
    event: 'process-question.done',
    question_id: id,
    slug: q?.slug,
    ingestion_status: q?.ingestionStatus,
    verification_status: q?.verificationStatus,
    stopped_after: stoppedAfter,
  });
  process.stdout.write(`verification_status=${q?.verificationStatus ?? 'unknown'}\n`);
  return EXIT.OK;
}

async function cmdEnqueue(deps: HandlerDeps, kindArg: string | undefined, questionArg: string | undefined, force: boolean): Promise<number> {
  if (!kindArg || !questionArg) throw new ConfigError('enqueue requires --kind and --question');
  const kind = kindArg as JobKind;
  if (!AI_JOB_KINDS.includes(kind)) throw new ConfigError(`unsupported job kind: ${kindArg}`);
  const id = await deps.repo.resolveQuestionId(questionArg);
  if (!id) throw new ConfigError(`question not found: ${questionArg}`);
  const q = await deps.repo.loadQuestion(id);
  if (!q) throw new ConfigError(`question not found: ${questionArg}`);
  const hash = q.contentHash ?? q.id;
  const sol = kind === 'AI_VERIFY' || kind === 'AI_SEO' ? await deps.repo.findLatestSolution(id) : null;
  if ((kind === 'AI_VERIFY' || kind === 'AI_SEO') && !sol) throw new ConfigError('no solution exists yet; enqueue AI_SOLVE first');
  const keys: Record<string, string> = {
    AI_CLASSIFY: `AI_CLASSIFY:${id}:${hash}`,
    AI_SOLVE: `AI_SOLVE:${id}:${hash}:${PIPELINE_VERSION}`,
    AI_VERIFY: `AI_VERIFY:${id}:${sol?.id ?? ''}:${RULES_VERSION}`,
    AI_SEO: `AI_SEO:${id}:${sol?.id ?? ''}`,
  };
  const key = `${keys[kind]}${force ? `:force-${Math.floor(Date.now() / 1000)}` : ''}`;
  const jobId = await deps.repo.enqueueJob({
    kind,
    idempotencyKey: key,
    payload: { question_id: id, ...(sol ? { solution_version_id: sol.id } : {}) },
    questionId: id,
  });
  log({ event: 'enqueue.done', job_id: jobId, kind, idempotency_key: key });
  return EXIT.OK;
}

async function cmdBudget(repo: AiRepository, config: AiConfig): Promise<number> {
  const day = utcDay(new Date());
  const spent = await repo.getUsage(day, METRIC_COST);
  const calls = await repo.getUsage(day, METRIC_CALLS);
  const cap = Math.round(config.dailyBudgetUsd * 1_000_000);
  log({
    event: 'budget',
    day,
    spent_usd: spent / 1_000_000,
    cap_usd: config.dailyBudgetUsd,
    remaining_usd: Math.max(0, cap - spent) / 1_000_000,
    calls_today: calls,
    max_calls_per_run: config.maxCallsPerRun,
  });
  return spent >= cap ? EXIT.BUDGET : EXIT.OK;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    log({ level: 'ERROR', message });
    process.exitCode = e instanceof ConfigError ? EXIT.CONFIG : e instanceof BudgetExceededError ? EXIT.BUDGET : e instanceof JobError ? EXIT.OTHER : EXIT.OTHER;
  },
);

import { randomUUID } from 'node:crypto';
import type { AiTask, IngestionStatus } from '../types.js';
import type {
  AiRepository,
  AiRunRecord,
  ClassificationPatch,
  EnqueueJob,
  JobRecord,
  NewAiRun,
  NewSolution,
  NewVerificationRun,
  QuestionRecord,
  SolutionRecord,
  TaxonomyCandidates,
} from './types.js';

export interface MemoryJob extends JobRecord {
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'DEAD';
  runAfter: Date;
  result?: Record<string, unknown>;
  lastError?: string;
}

/** In-memory AiRepository for unit tests and --dry-run overlays. Mirrors the SQL semantics that matter. */
export class MemoryAiRepository implements AiRepository {
  questions = new Map<string, QuestionRecord>();
  taxonomy: TaxonomyCandidates = { subjects: [], chapters: [], topics: [] };
  runs: (AiRunRecord & { raw: NewAiRun })[] = [];
  solutions = new Map<string, SolutionRecord>();
  verificationRuns: (NewVerificationRun & { id: string })[] = [];
  jobs: MemoryJob[] = [];
  usage = new Map<string, number>();
  events: { jobId: string; level: string; message: string }[] = [];
  pipelineErrors: { questionId: string; jobKind: string; error: string }[] = [];
  seo = new Map<string, { title: string; description: string }>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  addQuestion(q: QuestionRecord): void {
    this.questions.set(q.id, structuredClone(q));
  }

  loadQuestion(id: string): Promise<QuestionRecord | null> {
    const q = this.questions.get(id);
    return Promise.resolve(q ? structuredClone(q) : null);
  }
  resolveQuestionId(idOrSlug: string): Promise<string | null> {
    if (this.questions.has(idOrSlug)) return Promise.resolve(idOrSlug);
    return Promise.resolve([...this.questions.values()].find((q) => q.slug === idOrSlug)?.id ?? null);
  }
  loadTaxonomy(_examId?: string): Promise<TaxonomyCandidates> {
    return Promise.resolve(this.taxonomy);
  }

  findSucceededRun(task: AiTask, inputHash: string): Promise<AiRunRecord | null> {
    return Promise.resolve(this.runs.find((r) => r.task === task && r.inputHash === inputHash && r.status === 'SUCCEEDED') ?? null);
  }
  findLatestSucceededRun(questionId: string, task: AiTask): Promise<AiRunRecord | null> {
    const list = this.runs.filter((r) => r.questionId === questionId && r.task === task && r.status === 'SUCCEEDED');
    return Promise.resolve(list[list.length - 1] ?? null);
  }
  insertAiRun(run: NewAiRun): Promise<AiRunRecord> {
    if (run.status === 'SUCCEEDED') {
      const dup = this.runs.find((r) => r.task === run.task && r.inputHash === run.inputHash && r.status === 'SUCCEEDED');
      if (dup) return Promise.resolve(dup);
    }
    const rec = {
      id: randomUUID(),
      task: run.task,
      questionId: run.questionId,
      inputHash: run.inputHash,
      status: run.status,
      output: run.output,
      model: run.model,
      raw: run,
    };
    this.runs.push(rec);
    return Promise.resolve(rec);
  }

  applyClassification(questionId: string, p: ClassificationPatch): Promise<void> {
    const q = this.questions.get(questionId);
    if (!q) return Promise.resolve();
    q.subjectId ??= p.subjectId;
    q.chapterId ??= p.chapterId;
    q.topicId ??= p.topicId;
    q.difficulty ??= p.difficulty;
    if (q.ingestionStatus === 'IMPORTED') q.ingestionStatus = 'CLASSIFIED';
    return Promise.resolve();
  }
  setIngestionStatus(questionId: string, status: IngestionStatus): Promise<void> {
    const q = this.questions.get(questionId);
    if (q) q.ingestionStatus = status;
    return Promise.resolve();
  }
  findSolutionByAiRun(aiRunId: string): Promise<SolutionRecord | null> {
    return Promise.resolve([...this.solutions.values()].find((s) => s.aiRunId === aiRunId) ?? null);
  }
  insertSolution(s: NewSolution): Promise<SolutionRecord> {
    const version = [...this.solutions.values()].filter((x) => x.questionId === s.questionId).length + 1;
    const rec: SolutionRecord = { ...s, id: randomUUID(), version };
    this.solutions.set(rec.id, rec);
    return Promise.resolve(rec);
  }
  getSolution(id: string): Promise<SolutionRecord | null> {
    return Promise.resolve(this.solutions.get(id) ?? null);
  }
  findLatestSolution(questionId: string): Promise<SolutionRecord | null> {
    const list = [...this.solutions.values()].filter((s) => s.questionId === questionId);
    return Promise.resolve(list.sort((a, b) => b.version - a.version)[0] ?? null);
  }
  applySeo(questionId: string, title: string, description: string): Promise<void> {
    const q = this.questions.get(questionId);
    if (q) {
      q.seoTitle ??= title;
      q.seoDescription ??= description;
    }
    this.seo.set(questionId, { title, description });
    return Promise.resolve();
  }
  recordVerification(run: NewVerificationRun): Promise<string> {
    const id = randomUUID();
    this.verificationRuns.push({ ...run, id });
    const q = this.questions.get(run.questionId);
    if (q) {
      q.verificationStatus = run.resultingStatus;
      q.ingestionStatus = run.ingestionStatus;
      if (q.publicationStatus === 'PUBLISHED' && !['OFFICIAL_KEY_MATCHED', 'HUMAN_VERIFIED'].includes(run.resultingStatus)) {
        q.publicationStatus = 'DRAFT';
      }
    }
    return Promise.resolve(id);
  }
  markPipelineError(questionId: string, jobKind: string, jobId: string | null, error: string): Promise<void> {
    this.pipelineErrors.push({ questionId, jobKind, error });
    const q = this.questions.get(questionId);
    if (q) {
      if (q.verificationStatus !== 'HUMAN_VERIFIED') q.verificationStatus = 'HUMAN_REVIEW_REQUIRED';
      q.ingestionStatus = 'NEEDS_ATTENTION';
    }
    return Promise.resolve();
  }

  enqueueJob(job: EnqueueJob): Promise<string> {
    const existing = this.jobs.find((j) => j.idempotencyKey === job.idempotencyKey);
    if (existing) return Promise.resolve(existing.id);
    const rec: MemoryJob = {
      id: randomUUID(),
      kind: job.kind,
      idempotencyKey: job.idempotencyKey,
      payload: job.payload,
      attempts: 0,
      maxAttempts: 5,
      questionId: job.questionId,
      status: 'QUEUED',
      runAfter: job.runAfter ?? this.clock(),
    };
    this.jobs.push(rec);
    return Promise.resolve(rec.id);
  }
  claimJob(workerId: string, kinds: string[]): Promise<JobRecord | null> {
    const job = this.jobs.find((j) => j.status === 'QUEUED' && kinds.includes(j.kind) && j.runAfter <= this.clock());
    if (!job) return Promise.resolve(null);
    job.status = 'RUNNING';
    job.attempts += 1;
    return Promise.resolve({ ...job });
  }
  heartbeatJob(): Promise<boolean> {
    return Promise.resolve(true);
  }
  completeJob(jobId: string, _workerId: string, result: Record<string, unknown>): Promise<boolean> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (job) {
      job.status = 'SUCCEEDED';
      job.result = result;
    }
    return Promise.resolve(Boolean(job));
  }
  failJob(jobId: string, _workerId: string, error: string, retryable: boolean): Promise<string> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) return Promise.resolve('DEAD');
    job.lastError = error;
    if (retryable && job.attempts < job.maxAttempts) {
      job.status = 'QUEUED';
      job.runAfter = new Date(this.clock().getTime() + 30_000 * 2 ** (job.attempts - 1));
      return Promise.resolve('QUEUED');
    }
    job.status = 'DEAD';
    return Promise.resolve('DEAD');
  }
  deferJob(jobId: string, _workerId: string, runAfter: Date): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (job) {
      job.status = 'QUEUED';
      job.attempts = Math.max(0, job.attempts - 1);
      job.runAfter = runAfter;
    }
    return Promise.resolve();
  }
  logJobEvent(jobId: string, level: string, _stage: string, message: string): Promise<void> {
    this.events.push({ jobId, level, message });
    return Promise.resolve();
  }

  getUsage(day: string, metric: string): Promise<number> {
    return Promise.resolve(this.usage.get(`${day}|${metric}`) ?? 0);
  }
  addUsage(day: string, metric: string, delta: number): Promise<void> {
    this.usage.set(`${day}|${metric}`, (this.usage.get(`${day}|${metric}`) ?? 0) + delta);
    return Promise.resolve();
  }
}

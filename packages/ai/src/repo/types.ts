import type { BudgetStore } from '../gemini/budget.js';
import type {
  AiTask,
  AnswerKey,
  CheckKind,
  CheckResult,
  Difficulty,
  IngestionStatus,
  JobKind,
  OptionLabel,
  PublicationStatus,
  QuestionType,
  VerificationOutcome,
  VerificationStatus,
} from '../types.js';

export interface QuestionOption {
  id: string;
  label: OptionLabel;
  text: string;
}
export interface QuestionAsset {
  id: string;
  bucket: 'SOURCE_DOCS' | 'PUBLIC_ASSETS';
  r2Key: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}
export interface QuestionRecord {
  id: string;
  slug: string;
  examId: string;
  examName: string;
  subjectId: string | null;
  subjectName: string | null;
  chapterId: string | null;
  chapterName: string | null;
  topicId: string | null;
  difficulty: Difficulty | null;
  questionType: QuestionType;
  questionText: string;
  structuredContent: unknown;
  options: QuestionOption[];
  /** Asset ids referenced by image blocks in the question and option content. */
  referencedAssetIds: string[];
  assets: QuestionAsset[];
  year: number | null;
  answerKey: AnswerKey | null;
  answerKeySource: 'OFFICIAL' | 'HUMAN' | 'AI_CONSENSUS' | null;
  /** An official_answer_keys row for this question exists and is_dropped. */
  officialKeyDropped: boolean;
  contentHash: string | null;
  ingestionStatus: IngestionStatus;
  verificationStatus: VerificationStatus;
  publicationStatus: PublicationStatus;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface TaxonomyCandidates {
  subjects: { id: string; code: string }[];
  chapters: { id: string; subjectId: string; subjectCode: string; slug: string; name: string }[];
  topics: { id: string; chapterId: string; chapterSlug: string; slug: string; name: string }[];
}

export interface AiRunRecord {
  id: string;
  task: AiTask;
  questionId: string | null;
  inputHash: string;
  status: 'SUCCEEDED' | 'FAILED' | 'SCHEMA_INVALID' | 'BLOCKED';
  output: unknown;
  model: string;
}
export interface NewAiRun {
  task: AiTask;
  questionId: string | null;
  solutionVersionId?: string | null;
  jobId: string | null;
  provider: 'gemini' | 'mock';
  model: string;
  promptId: string;
  promptVersion: string;
  inputHash: string;
  status: AiRunRecord['status'];
  output: unknown;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsdMicros: number;
  latencyMs: number | null;
}

export interface SolutionStep {
  index: number;
  title: string | null;
  blocks: ({ type: 'paragraph'; text: string } | { type: 'math'; latex: string })[];
}
export interface StoredSympyCheck {
  kind: 'NUMERIC_EVAL' | 'SYMBOLIC_EQUIV';
  expression: string;
  compare_to: string;
  variables: { name: string; value: string }[];
}
export interface NewSolution {
  questionId: string;
  finalAnswer: AnswerKey;
  summary: string;
  steps: SolutionStep[];
  formulas: { name: string; latex: string }[];
  concepts: string[];
  alternatives: { title: string; steps: SolutionStep[] }[];
  shortcuts: string[];
  commonMistakes: string[];
  sympyChecks: StoredSympyCheck[];
  aiRunId: string | null;
}
export interface SolutionRecord extends NewSolution {
  id: string;
  version: number;
}

export interface ClassificationPatch {
  subjectId: string | null;
  chapterId: string | null;
  topicId: string | null;
  difficulty: Difficulty | null;
}

export interface NewVerificationRun {
  questionId: string;
  solutionVersionId: string | null;
  jobId: string | null;
  rulesVersion: string;
  outcome: VerificationOutcome;
  resultingStatus: VerificationStatus;
  ingestionStatus: IngestionStatus;
  reasons: string[];
  startedAt: Date;
  checks: { kind: CheckKind; result: CheckResult; details: Record<string, unknown>; aiRunId: string | null }[];
}

export interface JobRecord {
  id: string;
  kind: JobKind;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  questionId: string | null;
}
export interface EnqueueJob {
  kind: JobKind;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  questionId: string | null;
  priority?: number;
  runAfter?: Date;
}

/** Everything the pipeline needs from storage. SQL impl: sql-repo.ts. In-memory impl: memory-repo.ts (tests). */
export interface AiRepository extends BudgetStore {
  loadQuestion(id: string): Promise<QuestionRecord | null>;
  /** Accepts a uuid or a slug. */
  resolveQuestionId(idOrSlug: string): Promise<string | null>;
  loadTaxonomy(examId: string): Promise<TaxonomyCandidates>;

  findSucceededRun(task: AiTask, inputHash: string): Promise<AiRunRecord | null>;
  findLatestSucceededRun(questionId: string, task: AiTask): Promise<AiRunRecord | null>;
  insertAiRun(run: NewAiRun): Promise<AiRunRecord>;

  /** Fills only columns that are currently null; moves IMPORTED -> CLASSIFIED. */
  applyClassification(questionId: string, patch: ClassificationPatch): Promise<void>;
  setIngestionStatus(questionId: string, status: IngestionStatus): Promise<void>;
  findSolutionByAiRun(aiRunId: string): Promise<SolutionRecord | null>;
  insertSolution(solution: NewSolution): Promise<SolutionRecord>;
  getSolution(id: string): Promise<SolutionRecord | null>;
  findLatestSolution(questionId: string): Promise<SolutionRecord | null>;
  /** Stores suggestions only where seo_title / seo_description are still null. */
  applySeo(questionId: string, title: string, description: string): Promise<void>;
  /** One transaction: verification_runs + checks, questions statuses, audit_log. */
  recordVerification(run: NewVerificationRun): Promise<string>;
  /** Pipeline error path (rule 6): never changes a HUMAN_VERIFIED question's verification_status. */
  markPipelineError(questionId: string, jobKind: JobKind, jobId: string | null, error: string): Promise<void>;

  enqueueJob(job: EnqueueJob): Promise<string>;
  claimJob(workerId: string, kinds: JobKind[], leaseSeconds: number): Promise<JobRecord | null>;
  heartbeatJob(jobId: string, workerId: string, leaseSeconds: number): Promise<boolean>;
  completeJob(jobId: string, workerId: string, result: Record<string, unknown>): Promise<boolean>;
  failJob(jobId: string, workerId: string, error: string, retryable: boolean): Promise<'QUEUED' | 'DEAD' | string>;
  /** Re-queue without consuming an attempt (budget exhausted). */
  deferJob(jobId: string, workerId: string, runAfter: Date, reason: string): Promise<void>;
  logJobEvent(jobId: string, level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', stage: string, message: string, data?: unknown): Promise<void>;
}

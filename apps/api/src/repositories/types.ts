import type {
  AnswerKey,
  AnswerKeySource,
  AnswerResponse,
  AppRole,
  AssetKind,
  CheckKind,
  CheckResult,
  ContentBlock,
  Difficulty,
  Indexability,
  IngestionStatus,
  JobEventLevel,
  JobKind,
  JobStatus,
  MarkingScheme,
  PracticeMode,
  PublicationStatus,
  QuestionOrigin,
  QuestionType,
  SessionStatus,
  SolutionProvenance,
  SolutionReviewStatus,
  SourceDocumentKind,
  SourceKind,
  SourceQuestionStatus,
  SubjectCode,
  VerificationOutcome,
  VerificationStatus,
  ReviewAction,
  AiTask,
  AiRunStatus,
  DoubtStatus,
} from '@projectx/contracts';
import type { JwtClaims } from '@projectx/db';

// ------------------------------------------------------------------ rows (snake_case = DB columns)
export interface ExamRow {
  id: string;
  code: string;
  slug: string;
  name: string;
  short_name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}
export interface SubjectRow {
  id: string;
  exam_id: string;
  code: SubjectCode;
  slug: string;
  segment: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}
export interface ChapterRow {
  id: string;
  subject_id: string;
  slug: string;
  segment: string;
  name: string;
  unit_number: number | null;
  class_level: number | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}
export interface TopicRow {
  id: string;
  chapter_id: string;
  slug: string;
  segment: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}
export interface Taxonomy {
  exams: ExamRow[];
  subjects: SubjectRow[];
  chapters: ChapterRow[];
  topics: TopicRow[];
}

export interface QuestionRow {
  id: string;
  slug: string;
  exam_id: string;
  subject_id: string | null;
  chapter_id: string | null;
  topic_id: string | null;
  paper_id: string | null;
  origin: QuestionOrigin;
  question_type: QuestionType;
  marking_scheme: MarkingScheme;
  difficulty: Difficulty | null;
  marks: string;
  negative_marks: string;
  year: number | null;
  shift: number | null;
  session_label: string | null;
  question_number: string | null;
  question_text: string;
  structured_content: ContentBlock[];
  answer_key: AnswerKey | null;
  answer_key_source: AnswerKeySource | null;
  source_id: string | null;
  source_question_id: string | null;
  content_hash: string | null;
  ingestion_status: IngestionStatus;
  verification_status: VerificationStatus;
  publication_status: PublicationStatus;
  indexability: Indexability;
  sitemap_include: boolean;
  current_solution_id: string | null;
  seo_title: string | null;
  seo_description: string | null;
  is_indexable: boolean;
  row_version: number;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  first_published_at: Date | null;
}
export interface OptionRow {
  id: string;
  question_id: string;
  label: 'A' | 'B' | 'C' | 'D' | 'E';
  sort_order: number;
  content: ContentBlock[];
  content_text: string;
  external_option_id: string | null;
}
export interface AssetRow {
  id: string;
  question_id: string | null;
  solution_version_id: string | null;
  source_question_id: string | null;
  kind: AssetKind;
  bucket: 'SOURCE_DOCS' | 'PUBLIC_ASSETS';
  r2_key: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  sha256: string;
  alt_text: string | null;
}
export interface SolutionRow {
  id: string;
  question_id: string;
  version: number;
  final_answer: AnswerKey;
  summary: string | null;
  steps: unknown[];
  formulas: unknown[];
  concepts: string[];
  alternatives: unknown[];
  shortcuts: string[];
  common_mistakes: string[];
  sympy_checks: unknown[];
  provenance: SolutionProvenance;
  ai_run_id: string | null;
  based_on_version_id: string | null;
  author_id: string | null;
  edit_note: string | null;
  review_status: SolutionReviewStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}
export interface PaperRow {
  id: string;
  exam_id: string;
  slug: string;
  title: string;
  year: number;
  session_label: string | null;
  exam_date: string | null;
  shift: number | null;
  paper_code: string | null;
}
export interface SourceRow {
  id: string;
  code: string;
  name: string;
  kind: SourceKind;
  publisher: string | null;
  homepage_url: string | null;
  license_name: string | null;
  license_url: string | null;
  reuse_permitted: boolean;
  attribution_text: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  notes: string | null;
  created_at: Date;
}

export interface SessionRow {
  id: string;
  user_id: string;
  client_request_id: string;
  mode: PracticeMode;
  exam_id: string;
  subject_id: string | null;
  chapter_id: string | null;
  topic_id: string | null;
  paper_id: string | null;
  filters: Record<string, unknown>;
  question_ids: string[];
  status: SessionStatus;
  attempted_count: number;
  correct_count: number;
  score: string;
  started_at: Date;
  completed_at: Date | null;
  last_activity_at: Date;
  ui_mode: 'learning' | 'test';
  time_limit_sec: number | null;
}
export interface AttemptRow {
  id: string;
  user_id: string;
  question_id: string;
  session_id: string | null;
  client_attempt_id: string;
  request_hash: string;
  response: AnswerResponse;
  is_correct: boolean;
  score: string;
  time_spent_ms: number | null;
  activity_date: string;
  submitted_at: Date;
}
export interface ProfileRow {
  id: string;
  display_name: string | null;
  timezone: string;
  target_exam_id: string | null;
  target_year: number | null;
  daily_goal_attempts: number;
  onboarding_completed_at: Date | null;
  class_level: '11' | '12' | 'dropper' | null;
  created_at: Date;
}
export interface PrefRow {
  exam_id: string;
  is_primary: boolean;
  target_year: number | null;
}
export interface BookmarkRow {
  question_id: string;
  note: string | null;
  created_at: Date;
}
export interface MistakeRow {
  question_id: string;
  subject_id: string;
  chapter_id: string;
  wrong_count: number;
  first_wrong_at: Date;
  last_wrong_at: Date;
  resolved_at: Date | null;
}
export interface ChapterStatRow {
  chapter_id: string;
  subject_id: string;
  exam_id: string;
  attempts_count: number;
  correct_count: number;
  total_time_ms: number;
  last_attempt_at: Date;
}
export interface StreakRow {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  today: string;
  timezone: string;
}
export interface DailyActivityRow {
  activity_date: string;
  attempts_count: number;
  correct_count: number;
}
/** daily_activity row with time spent (activity listing). */
export interface ActivityRow extends DailyActivityRow {
  total_time_ms: number;
}
export interface DoubtRow {
  id: string;
  user_id: string | null;
  question_id: string | null;
  body: string;
  upload_id: string | null;
  status: DoubtStatus;
  is_public: boolean;
  ip_hash: string | null;
  created_at: Date;
}
export interface UploadRow {
  id: string;
  user_id: string;
  purpose: 'DOUBT_ATTACHMENT';
  bucket: 'USER_UPLOADS';
  r2_key: string;
  mime_type: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: number;
  sha256: string;
  status: 'CONFIRMED' | 'REJECTED' | 'DELETED';
  created_at: Date;
}

export interface ReviewEventRow {
  id: number;
  question_id: string;
  solution_version_id: string | null;
  actor_id: string | null;
  action: ReviewAction;
  from_verification_status: VerificationStatus | null;
  to_verification_status: VerificationStatus | null;
  from_publication_status: PublicationStatus | null;
  to_publication_status: PublicationStatus | null;
  note: string | null;
  created_at: Date;
}
export interface VerificationRunRow {
  id: string;
  question_id: string;
  rules_version: string;
  outcome: VerificationOutcome | null;
  resulting_status: VerificationStatus | null;
  reasons: string[];
  started_at: Date;
  finished_at: Date | null;
}
export interface VerificationCheckRow {
  verification_run_id: string;
  kind: CheckKind;
  result: CheckResult;
  details: unknown;
  ai_run_id: string | null;
}
export interface AiRunRow {
  id: string;
  task: AiTask;
  provider: string;
  model: string;
  prompt_id: string;
  prompt_version: string;
  status: AiRunStatus;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd_micros: number;
  latency_ms: number | null;
  created_at: Date;
}
export interface JobRow {
  id: string;
  kind: JobKind;
  idempotency_key: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: Date;
  locked_by: string | null;
  last_error: string | null;
  question_id: string | null;
  source_document_id: string | null;
  created_at: Date;
  finished_at: Date | null;
}
export interface JobEventRow {
  level: JobEventLevel;
  stage: string | null;
  message: string;
  data: unknown;
  created_at: Date;
}
export interface IngestionDocRow {
  id: string;
  source_code: string;
  paper_slug: string | null;
  kind: SourceDocumentKind;
  original_filename: string;
  bytes: number;
  page_count: number | null;
  created_at: Date;
  latest_job: { id: string; status: JobStatus; attempts: number; last_error: string | null } | null;
  question_counts: Partial<Record<SourceQuestionStatus, number>>;
}
export interface SourceQuestionRow {
  id: string;
  question_number: string;
  status: SourceQuestionStatus;
  warnings: string[];
  extraction_method: 'TEXT' | 'OCR' | 'MIXED';
  ocr_mean_confidence: number | null;
  duplicate_of_question_id: string | null;
  possible_duplicate_of: string | null;
  duplicate_similarity: number | null;
  promoted_question_id: string | null;
}

// ------------------------------------------------------------------ paging
export interface PageCursor {
  k: (string | number | null)[];
  id: string;
}
/** A row plus its keyset key (full precision, as the repo would compare it). */
export type Keyed<T> = T & { _k: (string | number | null)[]; _id: string };

// ------------------------------------------------------------------ repos
export interface QuestionBundle {
  question: QuestionRow;
  options: OptionRow[];
  solution: SolutionRow | null;
  paper: PaperRow | null;
  source: SourceRow | null;
}

export interface PracticeFilter {
  examId: string;
  subjectId?: string | undefined;
  chapterId?: string | undefined;
  topicId?: string | undefined;
  difficulty?: Difficulty[] | undefined;
  types?: QuestionType[] | undefined;
  yearFrom?: number | undefined;
  yearTo?: number | undefined;
  origin?: QuestionOrigin | undefined;
}

export interface TaxonomyRepo {
  load(): Promise<Taxonomy>;
  publishedCounts(): Promise<{ chapter_id: string; topic_id: string | null; n: number }[]>;
}

export interface ContentRepo {
  getPublishedBySlug(slug: string): Promise<QuestionBundle | null>;
  getPublishedById(id: string): Promise<QuestionBundle | null>;
  /** Returns the *current* slug of the published question that `oldSlug` redirects to. */
  findRedirectTarget(oldSlug: string): Promise<string | null>;
  listRelated(q: QuestionRow, limit: number): Promise<QuestionRow[]>;
  countRelated(q: QuestionRow): Promise<number>;
  listForChapter(f: {
    chapterId: string;
    topicId?: string | undefined;
    difficulty?: Difficulty | undefined;
    type?: QuestionType | undefined;
    year?: number | undefined;
    after: PageCursor | null;
    limit: number;
  }): Promise<Keyed<QuestionRow>[]>;
  search(f: {
    q: string;
    examId?: string | undefined;
    subjectId?: string | undefined;
    chapterId?: string | undefined;
    after: PageCursor | null;
    limit: number;
  }): Promise<Keyed<QuestionRow & { rank: number }>[]>;
  sitemap(after: PageCursor | null, limit: number): Promise<Keyed<{ slug: string; exam_id: string; updated_at: Date }>[]>;
  listPractice(f: PracticeFilter, after: PageCursor | null, limit: number): Promise<Keyed<QuestionRow>[]>;
  optionsByQuestionIds(ids: string[]): Promise<OptionRow[]>;
  summaries(ids: string[]): Promise<QuestionRow[]>;
  assetsByIds(ids: string[]): Promise<AssetRow[]>;
  papersByIds(ids: string[]): Promise<PaperRow[]>;
  paperBySlug(slug: string): Promise<PaperRow | null>;
}

export interface SelectCriteria {
  mode: PracticeMode;
  userId: string;
  examId: string;
  subjectId?: string | undefined;
  chapterId?: string | undefined;
  topicId?: string | undefined;
  paperId?: string | undefined;
  difficulty?: Difficulty[] | undefined;
  types?: QuestionType[] | undefined;
  yearFrom?: number | undefined;
  yearTo?: number | undefined;
  excludeCorrect: boolean;
  size: number;
}

export interface PracticeRepo {
  selectQuestionIds(c: SelectCriteria): Promise<string[]>;
  findSessionByRequest(userId: string, clientRequestId: string): Promise<SessionRow | null>;
  getSession(userId: string, id: string): Promise<SessionRow | null>;
  /** Returns null if (user, client_request_id) already exists. */
  insertSession(s: Omit<SessionRow, 'id' | 'attempted_count' | 'correct_count' | 'score' | 'completed_at' | 'last_activity_at'>): Promise<SessionRow | null>;
  abandonSession(userId: string, id: string): Promise<SessionRow | null>;
  /** ACTIVE -> COMPLETED (completed_at = now). Null when the session is not ACTIVE. */
  completeSession(userId: string, id: string): Promise<SessionRow | null>;
  /** Newest activity first (`last_activity_at desc, id`). */
  listSessions(userId: string, statuses: SessionStatus[] | null, after: PageCursor | null, limit: number): Promise<Keyed<SessionRow>[]>;
  attemptsForSession(userId: string, sessionId: string): Promise<AttemptRow[]>;
  findAttempt(userId: string, clientAttemptId: string): Promise<AttemptRow | null>;
  findAttemptForSessionQuestion(sessionId: string, questionId: string): Promise<AttemptRow | null>;
  /** Returns null on any unique conflict (caller re-reads). Triggers update stats/session. */
  insertAttempt(a: Omit<AttemptRow, 'id' | 'activity_date'>): Promise<AttemptRow | null>;
  /** Questions of the user's open mistakes/bookmarks are handled inside selectQuestionIds. */
}

export interface StudentServiceRepo {
  getStreak(userId: string): Promise<StreakRow>;
  last7Days(userId: string, today: string): Promise<DailyActivityRow[]>;
  rolesFor(userId: string): Promise<AppRole[]>;
  countDoubtsSince(who: { userId: string } | { ipHash: string }, since: Date): Promise<number>;
  insertDoubt(d: { user_id: string | null; question_id: string | null; body: string; upload_id: string | null; ip_hash: string | null }): Promise<DoubtRow>;
  insertUpload(u: Omit<UploadRow, 'created_at' | 'status'>): Promise<UploadRow>;
  getUpload(userId: string, id: string): Promise<UploadRow | null>;
  uploadsByIds(ids: string[]): Promise<UploadRow[]>;
  getProfile(userId: string): Promise<ProfileRow | null>;
}

/** Runs under the user's JWT claims (RLS enforced in SQL). */
export interface UserRepo {
  getProfile(userId: string): Promise<ProfileRow | null>;
  updateProfile(
    userId: string,
    patch: Partial<Pick<ProfileRow, 'display_name' | 'timezone' | 'target_exam_id' | 'target_year' | 'daily_goal_attempts' | 'class_level'>> & {
      onboarding_completed?: true;
    },
  ): Promise<ProfileRow | null>;
  listPrefs(userId: string): Promise<PrefRow[]>;
  replacePrefs(userId: string, prefs: PrefRow[]): Promise<PrefRow[]>;
  listBookmarks(userId: string, after: PageCursor | null, limit: number): Promise<Keyed<BookmarkRow>[]>;
  upsertBookmark(userId: string, questionId: string, note: string | null): Promise<{ created: boolean; row: BookmarkRow }>;
  deleteBookmark(userId: string, questionId: string): Promise<void>;
  listMistakes(
    userId: string,
    f: { status: 'open' | 'resolved' | 'all'; subjectId?: string | undefined; chapterId?: string | undefined },
    after: PageCursor | null,
    limit: number,
  ): Promise<Keyed<MistakeRow>[]>;
  deleteMistake(userId: string, questionId: string): Promise<void>;
  chapterStats(userId: string, examId: string): Promise<ChapterStatRow[]>;
  listAttempts(
    userId: string,
    f: { questionId?: string | undefined; sessionId?: string | undefined },
    after: PageCursor | null,
    limit: number,
  ): Promise<Keyed<AttemptRow>[]>;
  listDoubts(userId: string, after: PageCursor | null, limit: number): Promise<Keyed<DoubtRow>[]>;
  /** Per-day activity between two dates (inclusive), ascending. Days without attempts are absent. */
  listActivity(userId: string, from: string, to: string): Promise<ActivityRow[]>;
}

export interface QuestionListFilter {
  verification?: VerificationStatus[] | undefined;
  publication?: PublicationStatus[] | undefined;
  ingestion?: IngestionStatus[] | undefined;
  examId?: string | undefined;
  subjectId?: string | undefined;
  chapterId?: string | undefined;
  origin?: QuestionOrigin | undefined;
  q?: string | undefined;
}

export type QuestionPatch = Partial<
  Pick<
    QuestionRow,
    | 'slug'
    | 'structured_content'
    | 'question_text'
    | 'question_type'
    | 'answer_key'
    | 'answer_key_source'
    | 'marks'
    | 'negative_marks'
    | 'difficulty'
    | 'subject_id'
    | 'chapter_id'
    | 'topic_id'
    | 'seo_title'
    | 'seo_description'
    | 'indexability'
    | 'sitemap_include'
    | 'verification_status'
    | 'publication_status'
    | 'current_solution_id'
    | 'ingestion_status'
  >
>;

export interface NewSolution {
  question_id: string;
  final_answer: AnswerKey;
  summary: string | null;
  steps: unknown[];
  formulas: unknown[];
  concepts: string[];
  alternatives: unknown[];
  shortcuts: string[];
  common_mistakes: string[];
  provenance: SolutionProvenance;
  based_on_version_id: string | null;
  author_id: string;
  edit_note: string;
}

export interface AdminRepo {
  listQuestions(f: QuestionListFilter, after: PageCursor | null, limit: number): Promise<Keyed<QuestionRow>[]>;
  /** Any status. */
  getQuestion(id: string): Promise<QuestionRow | null>;
  optionsFor(questionId: string): Promise<OptionRow[]>;
  solutionVersions(questionId: string): Promise<SolutionRow[]>;
  getSolution(id: string): Promise<SolutionRow | null>;
  getSource(id: string): Promise<SourceRow | null>;
  sourceByIdMap(ids: string[]): Promise<SourceRow[]>;
  paperById(id: string): Promise<PaperRow | null>;
  /** Optimistic concurrency. 'CONFLICT' when row_version differs; null when absent. */
  updateQuestion(
    id: string,
    expectedRowVersion: number,
    patch: QuestionPatch,
    opts?: { allowSlugChange?: boolean },
  ): Promise<QuestionRow | 'CONFLICT' | null>;
  upsertOptionsByLabel(
    questionId: string,
    options: { label: OptionRow['label']; sort_order: number; content: ContentBlock[]; content_text: string }[],
  ): Promise<OptionRow[]>;
  insertSolution(s: NewSolution): Promise<SolutionRow>;
  setSolutionReview(id: string, status: SolutionReviewStatus, reviewerId: string | null): Promise<void>;
  supersedeApproved(questionId: string, exceptId: string): Promise<void>;
  assetsForQuestion(questionId: string): Promise<AssetRow[]>;
  moveAssetToPublic(assetId: string, r2Key: string): Promise<void>;
  insertReviewEvent(e: Omit<ReviewEventRow, 'id' | 'created_at'>): Promise<void>;
  insertAudit(a: {
    actor_id: string;
    actor_type: 'ADMIN' | 'USER';
    action: string;
    entity_type: string;
    entity_id: string | null;
    request_id: string | null;
    ip_hash: string | null;
    details: unknown;
  }): Promise<void>;
  enqueueJob(j: {
    kind: JobKind;
    idempotency_key: string;
    payload: Record<string, unknown>;
    priority?: number;
    question_id?: string | null;
    source_document_id?: string | null;
    created_by: string;
  }): Promise<string>;
  verificationRuns(questionId: string): Promise<{ run: VerificationRunRow; checks: VerificationCheckRow[] }[]>;
  latestRuns(questionIds: string[]): Promise<Map<string, VerificationRunRow>>;
  aiRuns(questionId: string): Promise<AiRunRow[]>;
  reviewEvents(questionId: string): Promise<ReviewEventRow[]>;
  // sources
  listSources(after: PageCursor | null, limit: number): Promise<Keyed<SourceRow>[]>;
  insertSource(s: Omit<SourceRow, 'id' | 'approved_by' | 'approved_at' | 'created_at'>): Promise<SourceRow>;
  approveSource(id: string, approverId: string, license: { name: string; url: string | null }, note: string): Promise<SourceRow | null>;
  // ingestion
  listDocuments(source: string | undefined, after: PageCursor | null, limit: number): Promise<Keyed<IngestionDocRow>[]>;
  listJobs(f: { status?: JobStatus[] | undefined; kind?: JobKind[] | undefined }, after: PageCursor | null, limit: number): Promise<Keyed<JobRow>[]>;
  getJob(id: string): Promise<JobRow | null>;
  findJobByKey(idempotencyKey: string): Promise<JobRow | null>;
  jobEvents(id: string, limit: number): Promise<JobEventRow[]>;
  retryJob(id: string): Promise<JobRow | null>;
  cancelJob(id: string): Promise<JobRow | null>;
  listSourceQuestions(
    f: { documentId: string; status?: SourceQuestionStatus | undefined },
    after: PageCursor | null,
    limit: number,
  ): Promise<Keyed<SourceQuestionRow>[]>;
  getSourceQuestion(id: string): Promise<SourceQuestionRow | null>;
  promoteSourceQuestion(id: string, examId: string, subjectCode: SubjectCode | null): Promise<string>;
  rejectSourceQuestion(id: string): Promise<void>;
}

export interface ServiceRepos {
  taxonomy: TaxonomyRepo;
  content: ContentRepo;
  practice: PracticeRepo;
  students: StudentServiceRepo;
  admin: AdminRepo;
}
export interface UserRepos {
  user: UserRepo;
}

export interface UserCtx {
  id: string;
  claims: JwtClaims;
}

/** Unit-of-work gateway: one DB transaction per call (SQL) / direct access (memory). */
export interface Store {
  service<T>(fn: (r: ServiceRepos) => Promise<T>): Promise<T>;
  user<T>(ctx: UserCtx, fn: (r: UserRepos) => Promise<T>): Promise<T>;
  ping(): Promise<boolean>;
}

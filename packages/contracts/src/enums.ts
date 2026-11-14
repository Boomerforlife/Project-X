import { z } from '@hono/zod-openapi';

// Exactly the DB enums (docs/DATABASE_SCHEMA.md §1). UPPER_SNAKE strings, identical in Python.
export const QuestionTypeSchema = z.enum(['SINGLE_MCQ', 'MULTI_MCQ', 'NUMERICAL']).openapi('QuestionType');
export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export const MarkingSchemeSchema = z.enum(['STANDARD', 'PARTIAL_MULTI']).openapi('MarkingScheme');
export type MarkingScheme = z.infer<typeof MarkingSchemeSchema>;
export const DifficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']).openapi('Difficulty');
export type Difficulty = z.infer<typeof DifficultySchema>;
export const QuestionOriginSchema = z.enum(['PYQ', 'AI_GENERATED', 'EDITORIAL']).openapi('QuestionOrigin');
export type QuestionOrigin = z.infer<typeof QuestionOriginSchema>;
export const VerificationStatusSchema = z
  .enum(['PENDING', 'AUTOMATED_CHECKS_PASSED', 'OFFICIAL_KEY_MATCHED', 'HUMAN_REVIEW_REQUIRED', 'HUMAN_VERIFIED', 'DISPUTED'])
  .openapi('VerificationStatus');
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export const PublicationStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).openapi('PublicationStatus');
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>;
export const IngestionStatusSchema = z
  .enum(['IMPORTED', 'CLASSIFIED', 'SOLVED', 'CHECKED', 'NEEDS_ATTENTION'])
  .openapi('IngestionStatus');
export type IngestionStatus = z.infer<typeof IngestionStatusSchema>;
export const IndexabilitySchema = z.enum(['AUTO', 'NOINDEX']).openapi('Indexability');
export type Indexability = z.infer<typeof IndexabilitySchema>;
export const AccessTierSchema = z.enum(['FREE', 'PREMIUM']).openapi('AccessTier');
export type AccessTier = z.infer<typeof AccessTierSchema>;
export const AnswerKeySourceSchema = z.enum(['OFFICIAL', 'HUMAN', 'AI_CONSENSUS']).openapi('AnswerKeySource');
export type AnswerKeySource = z.infer<typeof AnswerKeySourceSchema>;
export const SourceKindSchema = z
  .enum(['OFFICIAL_EXAM_BODY', 'LICENSED_PUBLISHER', 'EDITORIAL_TEAM', 'AI_GENERATION'])
  .openapi('SourceKind');
export type SourceKind = z.infer<typeof SourceKindSchema>;
export const SourceDocumentKindSchema = z.enum(['QUESTION_PAPER', 'ANSWER_KEY', 'OTHER']).openapi('SourceDocumentKind');
export type SourceDocumentKind = z.infer<typeof SourceDocumentKindSchema>;
export const StorageBucketSchema = z.enum(['SOURCE_DOCS', 'PUBLIC_ASSETS', 'USER_UPLOADS']).openapi('StorageBucket');
export type StorageBucket = z.infer<typeof StorageBucketSchema>;
export const AssetKindSchema = z.enum(['IMAGE', 'DIAGRAM', 'TABLE_IMAGE', 'ORIGINAL_CROP']).openapi('AssetKind');
export type AssetKind = z.infer<typeof AssetKindSchema>;
export const SourceQuestionStatusSchema = z
  .enum(['EXTRACTED', 'NORMALIZED', 'DUPLICATE', 'PROMOTED', 'REJECTED'])
  .openapi('SourceQuestionStatus');
export type SourceQuestionStatus = z.infer<typeof SourceQuestionStatusSchema>;
export const JobKindSchema = z
  .enum(['PROCESS_DOCUMENT', 'PARSE_ANSWER_KEY', 'AI_CLASSIFY', 'AI_SOLVE', 'AI_VERIFY', 'AI_SEO'])
  .openapi('JobKind');
export type JobKind = z.infer<typeof JobKindSchema>;
export const JobStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'DEAD', 'CANCELLED']).openapi('JobStatus');
export type JobStatus = z.infer<typeof JobStatusSchema>;
export const JobEventLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).openapi('JobEventLevel');
export type JobEventLevel = z.infer<typeof JobEventLevelSchema>;
export const AiTaskSchema = z
  .enum(['CLASSIFY', 'ANSWER', 'SOLVE', 'ALTERNATIVES', 'CRITIQUE', 'QUALITY', 'SEO_META'])
  .openapi('AiTask');
export type AiTask = z.infer<typeof AiTaskSchema>;
export const AiRunStatusSchema = z.enum(['SUCCEEDED', 'FAILED', 'SCHEMA_INVALID', 'BLOCKED']).openapi('AiRunStatus');
export type AiRunStatus = z.infer<typeof AiRunStatusSchema>;
export const SolutionProvenanceSchema = z
  .enum(['AI_GENERATED', 'AI_HUMAN_EDITED', 'HUMAN_AUTHORED', 'OFFICIAL'])
  .openapi('SolutionProvenance');
export type SolutionProvenance = z.infer<typeof SolutionProvenanceSchema>;
export const SolutionReviewStatusSchema = z
  .enum(['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED'])
  .openapi('SolutionReviewStatus');
export type SolutionReviewStatus = z.infer<typeof SolutionReviewStatusSchema>;
export const VerificationOutcomeSchema = z.enum(['PASSED', 'NEEDS_REVIEW', 'FAILED']).openapi('VerificationOutcome');
export type VerificationOutcome = z.infer<typeof VerificationOutcomeSchema>;
export const CheckKindSchema = z
  .enum([
    'OFFICIAL_KEY_MATCH',
    'INDEPENDENT_ANSWER_AGREEMENT',
    'SYMPY_CHECK',
    'AI_CRITIQUE',
    'CONTENT_COMPLETENESS',
    'CLASSIFICATION_CONFIDENCE',
  ])
  .openapi('CheckKind');
export type CheckKind = z.infer<typeof CheckKindSchema>;
export const CheckResultSchema = z.enum(['PASS', 'FAIL', 'INCONCLUSIVE', 'SKIPPED', 'ERROR']).openapi('CheckResult');
export type CheckResult = z.infer<typeof CheckResultSchema>;
export const ReviewActionSchema = z
  .enum([
    'APPROVE',
    'REJECT_SOLUTION',
    'REJECT_QUESTION',
    'EDIT_CONTENT',
    'EDIT_SOLUTION',
    'PUBLISH',
    'UNPUBLISH',
    'ARCHIVE',
    'RESTORE',
    'MARK_DISPUTED',
    'RESOLVE_DISPUTE',
    'SET_INDEXABILITY',
    'REQUEST_REVERIFY',
  ])
  .openapi('ReviewAction');
export type ReviewAction = z.infer<typeof ReviewActionSchema>;
export const AppRoleSchema = z.enum(['ADMIN', 'REVIEWER']).openapi('AppRole');
export type AppRole = z.infer<typeof AppRoleSchema>;
export const PracticeModeSchema = z
  .enum(['SUBJECT', 'CHAPTER', 'TOPIC', 'MIXED', 'PYQ_PAPER', 'MISTAKES', 'BOOKMARKS'])
  .openapi('PracticeMode');
export type PracticeMode = z.infer<typeof PracticeModeSchema>;
export const SessionStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'ABANDONED']).openapi('SessionStatus');
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export const GoalKindSchema = z.enum(['DAILY_ATTEMPTS', 'WEEKLY_ATTEMPTS', 'CHAPTER_ACCURACY']).openapi('GoalKind');
export type GoalKind = z.infer<typeof GoalKindSchema>;
export const DoubtStatusSchema = z.enum(['OPEN', 'ANSWERED', 'CLOSED', 'SPAM']).openapi('DoubtStatus');
export type DoubtStatus = z.infer<typeof DoubtStatusSchema>;
export const UploadPurposeSchema = z.enum(['DOUBT_ATTACHMENT']).openapi('UploadPurpose');
export type UploadPurpose = z.infer<typeof UploadPurposeSchema>;
export const UploadStatusSchema = z.enum(['CONFIRMED', 'REJECTED', 'DELETED']).openapi('UploadStatus');
export type UploadStatus = z.infer<typeof UploadStatusSchema>;
export const SubjectCodeSchema = z
  .enum(['PHYSICS', 'CHEMISTRY', 'MATHEMATICS', 'BIOLOGY', 'BOTANY', 'ZOOLOGY'])
  .openapi('SubjectCode');
export type SubjectCode = z.infer<typeof SubjectCodeSchema>;

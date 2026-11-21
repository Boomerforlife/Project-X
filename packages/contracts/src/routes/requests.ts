import { z } from '@hono/zod-openapi';
import { AnswerKeySchema, AnswerResponseSchema } from '../domain/answers';
import { ContentBlockSchema, FormulaSchema, OptionLabelSchema, SolutionStepSchema, AlternativeSchema } from '../domain/content';
import {
  DifficultySchema,
  IndexabilitySchema,
  IngestionStatusSchema,
  JobKindSchema,
  JobStatusSchema,
  PracticeModeSchema,
  PublicationStatusSchema,
  QuestionOriginSchema,
  QuestionTypeSchema,
  SessionStatusSchema,
  SourceKindSchema,
  SourceQuestionStatusSchema,
  SubjectCodeSchema,
  VerificationStatusSchema,
} from '../enums';
import { ClassLevelSchema } from '../dto/student';
import { pageQuery } from '../pagination';
import { SlugSchema, UuidSchema } from '../primitives';

/** Comma-separated query value validated against an item schema. */
export function csv<T extends z.ZodType>(item: T, description?: string) {
  return z
    .preprocess(
      (v) => (typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter((x) => x.length > 0) : v),
      z.array(item).min(1).max(20),
    )
    .openapi({ type: 'string', description: description ?? 'comma separated' });
}

const optInt = (min: number, max: number) => z.coerce.number().int().min(min).max(max).optional();
const boolQ = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .openapi({ type: 'string', enum: ['true', 'false'] });

// ---- params
export const SlugParam = (name: string) => z.object({ [name]: SlugSchema });
export const IdParam = z.object({ id: UuidSchema });

// ---- taxonomy / public
export const TaxonomyTreeQuery = z.object({ exam: SlugSchema });
export const RelatedQuery = z.object({ limit: z.coerce.number().int().min(1).max(20).default(10) });
export const ChapterQuery = z.object({
  difficulty: DifficultySchema.optional(),
  type: QuestionTypeSchema.optional(),
  topic: SlugSchema.optional(),
  year: optInt(1978, 2100),
  ...pageQuery(100),
});
export const SearchQuery = z.object({
  q: z.string().min(2).max(200),
  exam: SlugSchema.optional(),
  subject: SlugSchema.optional(),
  chapter: SlugSchema.optional(),
  ...pageQuery(50),
});
export const SitemapQuery = z.object({ ...pageQuery(1000) });
export const PageOnlyQuery = z.object({ ...pageQuery(100) });

// ---- practice
export const PracticeListQuery = z.object({
  exam: SlugSchema,
  subject: SlugSchema.optional(),
  chapter: SlugSchema.optional(),
  topic: SlugSchema.optional(),
  difficulty: csv(DifficultySchema).optional(),
  type: csv(QuestionTypeSchema).optional(),
  year_from: optInt(1978, 2100),
  year_to: optInt(1978, 2100),
  origin: QuestionOriginSchema.optional(),
  /** One question by id (e.g. reopening a shared single-question link). Same visibility rules as the list. */
  id: UuidSchema.optional(),
  ...pageQuery(50),
});

export const PaperListQuery = z.object({ exam: SlugSchema }).openapi('PaperListQuery');
export type PaperListQuery = z.infer<typeof PaperListQuery>;

export const CreateSessionBody = z
  .object({
    client_request_id: UuidSchema,
    mode: PracticeModeSchema,
    exam: SlugSchema,
    subject: SlugSchema.optional(),
    chapter: SlugSchema.optional(),
    topic: SlugSchema.optional(),
    paper: SlugSchema.optional(),
    filters: z
      .object({
        difficulty: z.array(DifficultySchema).max(3).optional(),
        types: z.array(QuestionTypeSchema).max(3).optional(),
        year_from: z.int().min(1978).max(2100).optional(),
        year_to: z.int().min(1978).max(2100).optional(),
        exclude_correct: z.boolean().default(true),
      })
      .optional(),
    size: z.int().min(1).max(50).default(10),
    ui_mode: z.enum(['learning', 'test']).default('learning'),
    time_limit_sec: z.int().min(60).max(21600).optional(),
  })
  .openapi('CreateSessionBody');
export type CreateSessionBody = z.infer<typeof CreateSessionBody>;

export const SubmitAttemptBody = z
  .object({
    client_attempt_id: UuidSchema,
    question_id: UuidSchema,
    session_id: UuidSchema.optional(),
    response: AnswerResponseSchema,
    time_spent_ms: z.int().min(0).max(10800000).optional(),
  })
  .openapi('SubmitAttemptBody');
export type SubmitAttemptBody = z.infer<typeof SubmitAttemptBody>;

// ---- student
export const PatchMeBody = z
  .object({
    display_name: z.string().min(1).max(60).nullable().optional(),
    timezone: z.string().min(1).max(64).optional(),
    target_exam: SlugSchema.nullable().optional(),
    target_year: z.int().min(2020).max(2100).nullable().optional(),
    daily_goal_attempts: z.int().min(1).max(500).optional(),
    class_level: ClassLevelSchema.nullable().optional(),
    onboarding_completed: z.literal(true).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'at least one field required' })
  .openapi('PatchMeBody');
export type PatchMeBody = z.infer<typeof PatchMeBody>;

export const ExamPreferencesBody = z
  .object({
    preferences: z
      .array(z.object({ exam: SlugSchema, is_primary: z.boolean(), target_year: z.int().min(2020).max(2100).optional() }))
      .max(5),
  })
  .refine((v) => v.preferences.filter((p) => p.is_primary).length <= 1, { message: 'at most one primary exam' })
  .refine((v) => new Set(v.preferences.map((p) => p.exam)).size === v.preferences.length, { message: 'duplicate exam' })
  .openapi('ExamPreferencesBody');
export type ExamPreferencesBody = z.infer<typeof ExamPreferencesBody>;

export const SessionListQuery = z.object({
  status: csv(SessionStatusSchema).optional(),
  ...pageQuery(50),
});
export const ActivityQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export const ProgressQuery = z.object({ exam: SlugSchema.optional() });
export const AttemptsQuery = z.object({ question_id: UuidSchema.optional(), session_id: UuidSchema.optional(), ...pageQuery(100) });
export const BookmarkBody = z
  .object({ question_id: UuidSchema, note: z.string().max(500).optional() })
  .openapi('BookmarkBody');
export type BookmarkBody = z.infer<typeof BookmarkBody>;
export const QuestionIdParam = z.object({ questionId: UuidSchema });
export const MistakesQuery = z.object({
  status: z.enum(['open', 'resolved', 'all']).default('open'),
  subject: SlugSchema.optional(),
  chapter: SlugSchema.optional(),
  ...pageQuery(100),
});
export const DoubtBody = z
  .object({ body: z.string().min(1).max(4000), question_id: UuidSchema.optional(), upload_id: UuidSchema.optional() })
  .openapi('DoubtBody');
export type DoubtBody = z.infer<typeof DoubtBody>;

// ---- admin
export const AdminQuestionsQuery = z.object({
  verification_status: csv(VerificationStatusSchema).optional(),
  publication_status: csv(PublicationStatusSchema).optional(),
  ingestion_status: csv(IngestionStatusSchema).optional(),
  exam: SlugSchema.optional(),
  subject: SlugSchema.optional(),
  chapter: SlugSchema.optional(),
  origin: QuestionOriginSchema.optional(),
  q: z.string().min(1).max(200).optional(),
  ...pageQuery(100),
});
export const PatchQuestionBody = z
  .object({
    expected_row_version: z.int().min(1),
    structured_content: z.array(ContentBlockSchema).min(1).max(100).optional(),
    options: z.array(z.object({ label: OptionLabelSchema, content: z.array(ContentBlockSchema).min(1).max(100) })).max(5).optional(),
    question_type: QuestionTypeSchema.optional(),
    answer_key: AnswerKeySchema.optional(),
    marks: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    negative_marks: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    difficulty: DifficultySchema.optional(),
    chapter: SlugSchema.optional(),
    topic: SlugSchema.nullable().optional(),
    seo_title: z.string().max(70).nullable().optional(),
    seo_description: z.string().max(170).nullable().optional(),
    indexability: IndexabilitySchema.optional(),
    sitemap_include: z.boolean().optional(),
    slug: SlugSchema.max(120).optional(),
  })
  .openapi('PatchQuestionBody');
export type PatchQuestionBody = z.infer<typeof PatchQuestionBody>;

export const CreateSolutionBody = z
  .object({
    based_on_version_id: UuidSchema.optional(),
    final_answer: AnswerKeySchema,
    summary: z.string().max(2000).optional(),
    steps: z.array(SolutionStepSchema).min(1).max(50),
    formulas: z.array(FormulaSchema).max(30).optional(),
    concepts: z.array(z.string().max(200)).max(30).optional(),
    alternatives: z.array(AlternativeSchema).max(5).optional(),
    shortcuts: z.array(z.string().max(1000)).max(10).optional(),
    common_mistakes: z.array(z.string().max(1000)).max(10).optional(),
    edit_note: z.string().min(1).max(1000),
  })
  .openapi('CreateSolutionBody');
export type CreateSolutionBody = z.infer<typeof CreateSolutionBody>;

export const SolutionIdParam = z.object({ id: UuidSchema, versionId: UuidSchema });
export const ApproveBody = z
  .object({
    solution_version_id: UuidSchema,
    expected_row_version: z.int().min(1),
    note: z.string().max(2000).optional(),
    override_official_key: z.object({ reason: z.string().min(10).max(1000) }).optional(),
  })
  .openapi('ApproveBody');
export type ApproveBody = z.infer<typeof ApproveBody>;
export const RejectBody = z
  .object({
    target: z.enum(['SOLUTION', 'QUESTION']),
    solution_version_id: UuidSchema.optional(),
    reason: z.string().min(3).max(2000),
    regenerate: z.boolean().optional(),
  })
  .openapi('RejectBody');
export type RejectBody = z.infer<typeof RejectBody>;
export const PublishBody = z.object({ expected_row_version: z.int().min(1) }).openapi('PublishBody');
export type PublishBody = z.infer<typeof PublishBody>;
export const TransitionBody = z
  .object({ expected_row_version: z.int().min(1), reason: z.string().min(3).max(2000) })
  .openapi('TransitionBody');
export type TransitionBody = z.infer<typeof TransitionBody>;
export const DisputeBody = z.object({ reason: z.string().min(3).max(2000) }).openapi('DisputeBody');
export type DisputeBody = z.infer<typeof DisputeBody>;
export const QueueQuery = z.object({
  status: csv(VerificationStatusSchema).optional(),
  exam: SlugSchema.optional(),
  ...pageQuery(100),
});
export const VerificationRunBody = z
  .object({
    stages: z.array(z.enum(['CLASSIFY', 'SOLVE', 'VERIFY', 'SEO'])).min(1).max(4).optional(),
    force: z.boolean().optional(),
  })
  .openapi('VerificationRunBody');
export type VerificationRunBody = z.infer<typeof VerificationRunBody>;
export const CreateSourceBody = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(40),
    name: z.string().min(1).max(200),
    kind: SourceKindSchema,
    publisher: z.string().max(200).optional(),
    homepage_url: z.url().optional(),
    license_name: z.string().max(200).optional(),
    license_url: z.url().optional(),
    reuse_permitted: z.boolean().describe('Must be false on creation (422 otherwise); grant reuse via POST /admin/sources/{id}/approve'),
    attribution_text: z.string().max(1000).optional(),
    notes: z.string().max(2000).optional(),
  })
  .openapi('CreateSourceBody');
export type CreateSourceBody = z.infer<typeof CreateSourceBody>;
export const ApproveSourceBody = z
  .object({
    reuse_permitted: z.literal(true),
    license_name: z.string().min(1).max(200),
    license_url: z.url().optional(),
    note: z.string().min(10).max(2000),
  })
  .openapi('ApproveSourceBody');
export type ApproveSourceBody = z.infer<typeof ApproveSourceBody>;
export const IngestionDocsQuery = z.object({ source: z.string().max(40).optional(), ...pageQuery(100) });
export const IngestionJobsQuery = z.object({
  status: csv(JobStatusSchema).optional(),
  kind: csv(JobKindSchema).optional(),
  ...pageQuery(100),
});
export const SourceQuestionsQuery = z.object({
  document_id: UuidSchema,
  status: SourceQuestionStatusSchema.optional(),
  ...pageQuery(100),
});
export const PromoteBody = z
  .object({ exam: SlugSchema, subject: SubjectCodeSchema.optional() })
  .openapi('PromoteBody');
export type PromoteBody = z.infer<typeof PromoteBody>;
export const RejectSourceQuestionBody = z.object({ reason: z.string().min(3).max(2000) }).openapi('RejectSourceQuestionBody');

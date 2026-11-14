import { z } from '@hono/zod-openapi';
import { AnswerKeySchema } from '../domain/answers';
import { AlternativeSchema, ContentBlockSchema, FormulaSchema, OptionLabelSchema, SolutionStepSchema } from '../domain/content';
import { ChapterRefSchema, ExamRefSchema, SubjectRefSchema, TopicRefSchema } from '../domain/refs';
import {
  AiRunStatusSchema,
  AiTaskSchema,
  AnswerKeySourceSchema,
  CheckKindSchema,
  CheckResultSchema,
  DifficultySchema,
  IndexabilitySchema,
  IngestionStatusSchema,
  JobEventLevelSchema,
  JobKindSchema,
  JobStatusSchema,
  QuestionOriginSchema,
  QuestionTypeSchema,
  ReviewActionSchema,
  PublicationStatusSchema,
  SolutionProvenanceSchema,
  SolutionReviewStatusSchema,
  SourceKindSchema,
  SourceDocumentKindSchema,
  SourceQuestionStatusSchema,
  VerificationOutcomeSchema,
  VerificationStatusSchema,
} from '../enums';
import { DateStringSchema, DecSchema, SlugSchema, TsSchema, UuidSchema } from '../primitives';
import { AttributionPaperSchema } from './public';

export const AdminQuestionListItemSchema = z
  .object({
    id: UuidSchema,
    slug: SlugSchema,
    question_type: QuestionTypeSchema,
    origin: QuestionOriginSchema,
    verification_status: VerificationStatusSchema,
    publication_status: PublicationStatusSchema,
    ingestion_status: IngestionStatusSchema,
    indexability: IndexabilitySchema,
    is_indexable: z.boolean(),
    sitemap_include: z.boolean(),
    difficulty: DifficultySchema.nullable(),
    exam: ExamRefSchema,
    subject: SubjectRefSchema.nullable(),
    chapter: ChapterRefSchema.nullable(),
    year: z.int().nullable(),
    updated_at: TsSchema,
    row_version: z.int(),
  })
  .openapi('AdminQuestionListItem');
export type AdminQuestionListItem = z.infer<typeof AdminQuestionListItemSchema>;

export const AdminQuestionSchema = AdminQuestionListItemSchema.extend({
  topic: TopicRefSchema.nullable(),
  paper: AttributionPaperSchema.nullable(),
  question_text: z.string(),
  structured_content: z.array(ContentBlockSchema),
  options: z.array(
    z.object({
      id: UuidSchema,
      label: OptionLabelSchema,
      content: z.array(ContentBlockSchema),
      external_option_id: z.string().nullable(),
    }),
  ),
  answer_key: AnswerKeySchema.nullable(),
  answer_key_source: AnswerKeySourceSchema.nullable(),
  current_solution_id: UuidSchema.nullable(),
  solution_versions: z.array(
    z.object({
      id: UuidSchema,
      version: z.int(),
      provenance: SolutionProvenanceSchema,
      review_status: SolutionReviewStatusSchema,
      created_at: TsSchema,
      ai_run_id: UuidSchema.nullable(),
      author_id: UuidSchema.nullable(),
    }),
  ),
  seo_title: z.string().nullable(),
  seo_description: z.string().nullable(),
  source: z.object({ id: UuidSchema, code: z.string(), name: z.string() }).nullable(),
  source_question_id: UuidSchema.nullable(),
  marks: DecSchema,
  negative_marks: DecSchema,
  published_at: TsSchema.nullable(),
  first_published_at: TsSchema.nullable(),
  created_at: TsSchema,
}).openapi('AdminQuestion');
export type AdminQuestion = z.infer<typeof AdminQuestionSchema>;

export const SolutionVersionFullSchema = z
  .object({
    id: UuidSchema,
    version: z.int(),
    final_answer: AnswerKeySchema,
    summary: z.string().nullable(),
    steps: z.array(SolutionStepSchema),
    formulas: z.array(FormulaSchema),
    concepts: z.array(z.string()),
    alternatives: z.array(AlternativeSchema),
    shortcuts: z.array(z.string()),
    common_mistakes: z.array(z.string()),
    sympy_checks: z.array(z.unknown()),
    provenance: SolutionProvenanceSchema,
    review_status: SolutionReviewStatusSchema,
    based_on_version_id: UuidSchema.nullable(),
    ai_run_id: UuidSchema.nullable(),
    author_id: UuidSchema.nullable(),
    edit_note: z.string().nullable(),
    reviewed_by: UuidSchema.nullable(),
    reviewed_at: TsSchema.nullable(),
    created_at: TsSchema,
  })
  .openapi('SolutionVersionFull');
export type SolutionVersionFull = z.infer<typeof SolutionVersionFullSchema>;

export const VerificationQueueItemSchema = AdminQuestionListItemSchema.extend({
  latest_run: z
    .object({ outcome: VerificationOutcomeSchema.nullable(), reasons: z.array(z.string()), finished_at: TsSchema.nullable() })
    .nullable(),
}).openapi('VerificationQueueItem');

export const VerificationDetailSchema = z
  .object({
    runs: z.array(
      z.object({
        id: UuidSchema,
        rules_version: z.string(),
        outcome: VerificationOutcomeSchema.nullable(),
        resulting_status: VerificationStatusSchema.nullable(),
        reasons: z.array(z.string()),
        started_at: TsSchema,
        finished_at: TsSchema.nullable(),
        checks: z.array(
          z.object({ kind: CheckKindSchema, result: CheckResultSchema, details: z.unknown(), ai_run_id: UuidSchema.nullable() }),
        ),
      }),
    ),
    ai_runs: z.array(
      z.object({
        id: UuidSchema,
        task: AiTaskSchema,
        provider: z.string(),
        model: z.string(),
        prompt_id: z.string(),
        prompt_version: z.string(),
        status: AiRunStatusSchema,
        input_tokens: z.int().nullable(),
        output_tokens: z.int().nullable(),
        cost_usd_micros: z.number(),
        latency_ms: z.int().nullable(),
        created_at: TsSchema,
      }),
    ),
    review_events: z.array(
      z.object({
        action: ReviewActionSchema,
        actor_id: UuidSchema.nullable(),
        from_verification_status: VerificationStatusSchema.nullable(),
        to_verification_status: VerificationStatusSchema.nullable(),
        from_publication_status: PublicationStatusSchema.nullable(),
        to_publication_status: PublicationStatusSchema.nullable(),
        note: z.string().nullable(),
        created_at: TsSchema,
      }),
    ),
  })
  .openapi('VerificationDetail');

export const SourceSchema = z
  .object({
    id: UuidSchema,
    code: z.string(),
    name: z.string(),
    kind: SourceKindSchema,
    reuse_permitted: z.boolean(),
    approved_at: TsSchema.nullable(),
    license_name: z.string().nullable(),
    license_url: z.string().nullable(),
    attribution_text: z.string().nullable(),
  })
  .openapi('Source');
export type Source = z.infer<typeof SourceSchema>;

export const IngestionDocumentSchema = z
  .object({
    id: UuidSchema,
    source_code: z.string(),
    paper_slug: z.string().nullable(),
    kind: SourceDocumentKindSchema,
    original_filename: z.string(),
    bytes: z.number(),
    page_count: z.int().nullable(),
    created_at: TsSchema,
    latest_job: z
      .object({ id: UuidSchema, status: JobStatusSchema, attempts: z.int(), last_error: z.string().nullable() })
      .nullable(),
    question_counts: z.record(SourceQuestionStatusSchema, z.int()),
  })
  .openapi('IngestionDocument');

export const JobSchema = z
  .object({
    id: UuidSchema,
    kind: JobKindSchema,
    status: JobStatusSchema,
    attempts: z.int(),
    max_attempts: z.int(),
    priority: z.int(),
    idempotency_key: z.string(),
    run_after: TsSchema,
    locked_by: z.string().nullable(),
    last_error: z.string().nullable(),
    question_id: UuidSchema.nullable(),
    source_document_id: UuidSchema.nullable(),
    created_at: TsSchema,
    finished_at: TsSchema.nullable(),
  })
  .openapi('Job');
export type Job = z.infer<typeof JobSchema>;

export const JobDetailSchema = JobSchema.extend({
  events: z.array(
    z.object({
      level: JobEventLevelSchema,
      stage: z.string().nullable(),
      message: z.string(),
      data: z.unknown().nullable(),
      created_at: TsSchema,
    }),
  ),
}).openapi('JobDetail');

export const SourceQuestionItemSchema = z
  .object({
    id: UuidSchema,
    question_number: z.string(),
    status: SourceQuestionStatusSchema,
    warnings: z.array(z.string()),
    extraction_method: z.enum(['TEXT', 'OCR', 'MIXED']),
    ocr_mean_confidence: z.number().nullable(),
    duplicate_of_question_id: UuidSchema.nullable(),
    possible_duplicate_of: UuidSchema.nullable(),
    duplicate_similarity: z.number().nullable(),
    promoted_question_id: UuidSchema.nullable(),
  })
  .openapi('SourceQuestionItem');

export { DateStringSchema };

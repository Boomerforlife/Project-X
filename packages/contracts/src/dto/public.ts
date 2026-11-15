import { z } from '@hono/zod-openapi';
import { AnswerKeyWithLabelsSchema } from '../domain/answers';
import { PublicContentBlockSchema, OptionLabelSchema } from '../domain/content';
import { BreadcrumbSchema, ChapterRefSchema, ExamRefSchema, SubjectRefSchema, TopicRefSchema } from '../domain/refs';
import { DifficultySchema, QuestionOriginSchema, QuestionTypeSchema, SolutionProvenanceSchema } from '../enums';
import { DateStringSchema, DecSchema, SlugSchema, TsSchema, UuidSchema } from '../primitives';

export const AttributionPaperSchema = z.object({
  slug: SlugSchema,
  title: z.string(),
  year: z.int(),
  session_label: z.string().nullable(),
  exam_date: DateStringSchema.nullable(),
  shift: z.int().nullable(),
  paper_code: z.string().nullable(),
});
export const AttributionSchema = z
  .object({
    origin: QuestionOriginSchema,
    source_name: z.string().nullable(),
    attribution_text: z.string().nullable(),
    license_name: z.string().nullable(),
    license_url: z.string().nullable(),
    paper: AttributionPaperSchema.nullable(),
  })
  .openapi('Attribution');
export type Attribution = z.infer<typeof AttributionSchema>;

export const SeoSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    robots: z.enum(['index,follow', 'noindex,follow']),
    canonical_path: z.string(),
  })
  .openapi('Seo');
export type Seo = z.infer<typeof SeoSchema>;

export const PublicOptionSchema = z
  .object({ id: UuidSchema, label: OptionLabelSchema, content: z.array(PublicContentBlockSchema) })
  .openapi('PublicOption');
export type PublicOption = z.infer<typeof PublicOptionSchema>;

export const PublicSolutionStepSchema = z
  .object({ index: z.int(), title: z.string().nullable(), blocks: z.array(PublicContentBlockSchema) })
  .openapi('PublicSolutionStep');
export type PublicSolutionStep = z.infer<typeof PublicSolutionStepSchema>;

export const PublicSolutionSchema = z
  .object({
    id: UuidSchema,
    version: z.int(),
    final_answer: AnswerKeyWithLabelsSchema,
    summary: z.string().nullable(),
    steps: z.array(PublicSolutionStepSchema),
    formulas: z.array(z.object({ name: z.string(), latex: z.string() })),
    concepts: z.array(z.string()),
    alternatives: z.array(z.object({ title: z.string(), steps: z.array(PublicSolutionStepSchema) })),
    shortcuts: z.array(z.string()),
    common_mistakes: z.array(z.string()),
    provenance: SolutionProvenanceSchema,
    approved_at: TsSchema.nullable(),
  })
  .openapi('PublicSolution');
export type PublicSolution = z.infer<typeof PublicSolutionSchema>;

export const QuestionSummarySchema = z
  .object({
    id: UuidSchema,
    slug: SlugSchema,
    canonical_path: z.string(),
    excerpt: z.string().max(200),
    question_type: QuestionTypeSchema,
    difficulty: DifficultySchema.nullable(),
    year: z.int().nullable(),
    origin: QuestionOriginSchema,
    chapter: ChapterRefSchema,
    topic: TopicRefSchema.nullable(),
  })
  .openapi('QuestionSummary');
export type QuestionSummary = z.infer<typeof QuestionSummarySchema>;

export const PublicQuestionSchema = z
  .object({
    id: UuidSchema,
    slug: SlugSchema,
    canonical_path: z.string(),
    exam: ExamRefSchema,
    subject: SubjectRefSchema,
    chapter: ChapterRefSchema,
    topic: TopicRefSchema.nullable(),
    question_type: QuestionTypeSchema,
    difficulty: DifficultySchema.nullable(),
    marks: DecSchema,
    negative_marks: DecSchema,
    content: z.array(PublicContentBlockSchema),
    options: z.array(PublicOptionSchema),
    solution: PublicSolutionSchema,
    verification: z.object({ status: z.enum(['OFFICIAL_KEY_MATCHED', 'HUMAN_VERIFIED']), label: z.string() }),
    attribution: AttributionSchema,
    year: z.int().nullable(),
    shift: z.int().nullable(),
    seo: SeoSchema,
    indexable: z.boolean(),
    publication: z.object({ published_at: TsSchema, updated_at: TsSchema, first_published_at: TsSchema }),
    breadcrumbs: z.array(BreadcrumbSchema),
    related: z.object({ count: z.int(), path: z.string() }),
  })
  .openapi('PublicQuestion');
export type PublicQuestion = z.infer<typeof PublicQuestionSchema>;

export const PublicChapterSchema = z
  .object({
    chapter: ChapterRefSchema.extend({ description: z.string().nullable() }),
    subject: SubjectRefSchema,
    exam: ExamRefSchema,
    topics: z.array(TopicRefSchema.extend({ published_question_count: z.int() })),
    questions: z.array(QuestionSummarySchema),
    seo: SeoSchema,
    breadcrumbs: z.array(BreadcrumbSchema),
  })
  .openapi('PublicChapter');
export type PublicChapter = z.infer<typeof PublicChapterSchema>;

export const PublicSubjectSchema = z
  .object({
    subject: SubjectRefSchema,
    exam: ExamRefSchema,
    chapters: z.array(ChapterRefSchema.extend({ published_question_count: z.int() })),
    seo: SeoSchema,
    breadcrumbs: z.array(BreadcrumbSchema),
  })
  .openapi('PublicSubject');
export type PublicSubject = z.infer<typeof PublicSubjectSchema>;

export const PublicExamSchema = z
  .object({
    exam: ExamRefSchema,
    subjects: z.array(SubjectRefSchema.extend({ published_question_count: z.int() })),
    seo: SeoSchema,
    breadcrumbs: z.array(BreadcrumbSchema),
  })
  .openapi('PublicExam');
export type PublicExam = z.infer<typeof PublicExamSchema>;

export const SearchResultSchema = QuestionSummarySchema.extend({ rank: z.number() }).openapi('SearchResult');
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SitemapEntrySchema = z
  .object({ canonical_path: z.string(), slug: SlugSchema, exam_slug: SlugSchema, updated_at: TsSchema })
  .openapi('SitemapEntry');
export type SitemapEntry = z.infer<typeof SitemapEntrySchema>;

// Taxonomy
export const TaxonomyExamSchema = ExamRefSchema.extend({ is_active: z.boolean(), sort_order: z.int() }).openapi('TaxonomyExam');
export const TaxonomySubjectSchema = SubjectRefSchema.extend({ chapter_count: z.int() }).openapi('TaxonomySubject');
export const TaxonomyChapterSchema = ChapterRefSchema.extend({
  topic_count: z.int(),
  published_question_count: z.int(),
}).openapi('TaxonomyChapter');
export type TaxonomyExam = z.infer<typeof TaxonomyExamSchema>;
export const TaxonomyTopicSchema = TopicRefSchema.extend({ published_question_count: z.int() }).openapi('TaxonomyTopic');
export const TaxonomyTreeSchema = z
  .object({
    exam: ExamRefSchema,
    subjects: z.array(
      SubjectRefSchema.extend({ chapters: z.array(ChapterRefSchema.extend({ topics: z.array(TopicRefSchema) })) }),
    ),
  })
  .openapi('TaxonomyTree');
export type TaxonomyTree = z.infer<typeof TaxonomyTreeSchema>;

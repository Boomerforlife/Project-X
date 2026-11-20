import { z } from '@hono/zod-openapi';
import { AnswerKeyWithLabelsSchema, AnswerResponseSchema } from '../domain/answers';
import { PublicContentBlockSchema } from '../domain/content';
import { ChapterRefSchema, ExamRefSchema, SubjectRefSchema, TopicRefSchema } from '../domain/refs';
import {
  DifficultySchema,
  PracticeModeSchema,
  QuestionOriginSchema,
  QuestionTypeSchema,
  SessionStatusSchema,
} from '../enums';
import { DecSchema, SlugSchema, TsSchema, UuidSchema } from '../primitives';
import { PublicOptionSchema, PublicSolutionSchema } from './public';

export const PracticeQuestionSchema = z
  .object({
    id: UuidSchema,
    slug: SlugSchema,
    question_type: QuestionTypeSchema,
    difficulty: DifficultySchema.nullable(),
    marks: DecSchema,
    negative_marks: DecSchema,
    content: z.array(PublicContentBlockSchema),
    options: z.array(PublicOptionSchema),
    exam: ExamRefSchema,
    subject: SubjectRefSchema,
    chapter: ChapterRefSchema,
    topic: TopicRefSchema.nullable(),
    attribution: z.object({
      origin: QuestionOriginSchema,
      year: z.int().nullable(),
      paper_title: z.string().nullable(),
    }),
  })
  .openapi('PracticeQuestion');
export type PracticeQuestion = z.infer<typeof PracticeQuestionSchema>;

/** Keys that must never appear anywhere in a practice DTO before submission (contract test). */
export const PRACTICE_FORBIDDEN_KEYS = [
  'answer_key',
  'correct_option_ids',
  'correct_labels',
  'is_correct',
  'solution',
  'final_answer',
  'explanation',
  'accepted_ranges',
  'display_value',
] as const;

export const SessionProgressSchema = z
  .object({
    id: UuidSchema,
    status: SessionStatusSchema,
    attempted_count: z.int(),
    correct_count: z.int(),
    total: z.int(),
    score: DecSchema,
  })
  .openapi('SessionProgress');
export type SessionProgress = z.infer<typeof SessionProgressSchema>;

export const AttemptResultSchema = z
  .object({
    attempt_id: UuidSchema,
    question_id: UuidSchema,
    is_correct: z.boolean(),
    score: DecSchema,
    correct_answer: AnswerKeyWithLabelsSchema,
    solution: PublicSolutionSchema,
    submitted_at: TsSchema,
    session: SessionProgressSchema.nullable(),
    response: AnswerResponseSchema,
    time_spent_ms: z.int().nullable(),
  })
  .openapi('AttemptResult');
export type AttemptResult = z.infer<typeof AttemptResultSchema>;

/** The previous-year paper a PYQ_PAPER session was started from. */
export const PaperRefSchema = z
  .object({
    slug: SlugSchema,
    title: z.string(),
    /** Only the best N numerical scores per subject count towards the paper total (null = all count). */
    numerical_counted_per_subject: z.int().nullable().optional(),
    /** Negative mark of every numerical question in this paper, when the paper sets one (e.g. "0.00"). */
    numerical_negative_marks: DecSchema.nullable().optional(),
  })
  .openapi('PaperRef');
export type PaperRef = z.infer<typeof PaperRefSchema>;

export const SessionSummarySchema = SessionProgressSchema.extend({
  mode: PracticeModeSchema,
  started_at: TsSchema,
  ui_mode: z.enum(['learning', 'test']),
  time_limit_sec: z.int().nullable(),
  /** PYQ_PAPER sessions only (absent on older API builds). */
  paper: PaperRefSchema.nullable().optional(),
}).openapi('SessionSummary');
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionListItemSchema = SessionSummarySchema.extend({
  completed_at: TsSchema.nullable(),
  last_activity_at: TsSchema,
  exam: ExamRefSchema,
  subject: SubjectRefSchema.nullable(),
  chapter: ChapterRefSchema.nullable(),
}).openapi('SessionListItem');
export type SessionListItem = z.infer<typeof SessionListItemSchema>;

export const SessionCreatedSchema = z
  .object({ session: SessionSummarySchema, questions: z.array(PracticeQuestionSchema) })
  .openapi('SessionCreated');
export type SessionCreated = z.infer<typeof SessionCreatedSchema>;

export const SessionDetailSchema = z
  .object({
    session: SessionSummarySchema.extend({ completed_at: TsSchema.nullable() }),
    items: z.array(z.object({ question: PracticeQuestionSchema, attempt: AttemptResultSchema.nullable() })),
  })
  .openapi('SessionDetail');
export type SessionDetail = z.infer<typeof SessionDetailSchema>;


/**
 * A complete previous-year paper that can be sat as a full paper (every question with an official answer is
 * published). `question_count` is what the student gets; questions NTA dropped (no official answer) are not counted.
 */
export const PaperSummarySchema = z
  .object({
    slug: SlugSchema,
    title: z.string(),
    year: z.int(),
    exam_date: z.string().nullable(),
    shift: z.int().nullable(),
    exam: ExamRefSchema,
    question_count: z.int(),
    duration_min: z.int(),
    numerical_counted_per_subject: z.int().nullable().optional(),
    sections: z.array(z.object({ subject: SubjectRefSchema, question_count: z.int() })),
  })
  .openapi('PaperSummary');
export type PaperSummary = z.infer<typeof PaperSummarySchema>;

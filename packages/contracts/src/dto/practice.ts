import { z } from '@hono/zod-openapi';
import { AnswerKeyWithLabelsSchema } from '../domain/answers';
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
  })
  .openapi('AttemptResult');
export type AttemptResult = z.infer<typeof AttemptResultSchema>;

export const SessionSummarySchema = SessionProgressSchema.extend({
  mode: PracticeModeSchema,
  started_at: TsSchema,
}).openapi('SessionSummary');
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

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


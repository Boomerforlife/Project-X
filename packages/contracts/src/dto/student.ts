import { z } from '@hono/zod-openapi';
import { AnswerResponseSchema } from '../domain/answers';
import { ChapterRefSchema, ExamRefSchema, SubjectRefSchema } from '../domain/refs';
import { AppRoleSchema, DoubtStatusSchema } from '../enums';
import { DateStringSchema, DecSchema, TsSchema, UuidSchema } from '../primitives';
import { QuestionSummarySchema } from './public';

export const ClassLevelSchema = z.enum(['11', '12', 'dropper']).openapi('ClassLevel');
export type ClassLevel = z.infer<typeof ClassLevelSchema>;

export const MeSchema = z
  .object({
    id: UuidSchema,
    email: z.string().nullable(),
    display_name: z.string().nullable(),
    timezone: z.string(),
    target_exam: ExamRefSchema.nullable(),
    target_year: z.int().nullable(),
    daily_goal_attempts: z.int(),
    class_level: ClassLevelSchema.nullable(),
    onboarding_completed: z.boolean(),
    roles: z.array(AppRoleSchema),
    exam_preferences: z.array(
      z.object({ exam: ExamRefSchema, is_primary: z.boolean(), target_year: z.int().nullable() }),
    ),
    created_at: TsSchema,
  })
  .openapi('Me');
export type Me = z.infer<typeof MeSchema>;

export const ProgressSchema = z
  .object({
    exam: ExamRefSchema,
    totals: z.object({
      attempts: z.int(),
      correct: z.int(),
      accuracy: z.number().min(0).max(1),
      total_time_ms: z.number(),
      distinct_chapters: z.int(),
    }),
    subjects: z.array(
      z.object({ subject: SubjectRefSchema, attempts: z.int(), correct: z.int(), accuracy: z.number().min(0).max(1) }),
    ),
    chapters: z.array(
      z.object({
        chapter: ChapterRefSchema,
        subject_id: UuidSchema,
        attempts: z.int(),
        correct: z.int(),
        accuracy: z.number().min(0).max(1),
        last_attempt_at: TsSchema,
      }),
    ),
    weak_areas: z.array(
      z.object({
        chapter: ChapterRefSchema,
        attempts: z.int(),
        accuracy: z.number().min(0).max(1),
        reason: z.literal('LOW_ACCURACY'),
      }),
    ),
  })
  .openapi('Progress');
export type Progress = z.infer<typeof ProgressSchema>;

export const StreakSchema = z
  .object({
    current_streak: z.int(),
    longest_streak: z.int(),
    last_active_date: DateStringSchema.nullable(),
    today: DateStringSchema,
    timezone: z.string(),
    today_attempts: z.int(),
    daily_goal_attempts: z.int(),
    goal_met_today: z.boolean(),
    last_7_days: z.array(z.object({ date: DateStringSchema, attempts: z.int(), correct: z.int() })),
  })
  .openapi('Streak');
export type Streak = z.infer<typeof StreakSchema>;

export const AttemptHistoryItemSchema = z
  .object({
    id: UuidSchema,
    question: QuestionSummarySchema,
    is_correct: z.boolean(),
    score: DecSchema,
    response: AnswerResponseSchema,
    time_spent_ms: z.int().nullable(),
    submitted_at: TsSchema,
  })
  .openapi('AttemptHistoryItem');
export type AttemptHistoryItem = z.infer<typeof AttemptHistoryItemSchema>;

export const BookmarkItemSchema = z
  .object({ question: QuestionSummarySchema, note: z.string().nullable(), created_at: TsSchema })
  .openapi('BookmarkItem');
export type BookmarkItem = z.infer<typeof BookmarkItemSchema>;

export const MistakeItemSchema = z
  .object({
    question: QuestionSummarySchema,
    wrong_count: z.int(),
    first_wrong_at: TsSchema,
    last_wrong_at: TsSchema,
    resolved_at: TsSchema.nullable(),
  })
  .openapi('MistakeItem');
export type MistakeItem = z.infer<typeof MistakeItemSchema>;

export const DoubtItemSchema = z
  .object({
    id: UuidSchema,
    question: QuestionSummarySchema.nullable(),
    body: z.string(),
    status: DoubtStatusSchema,
    created_at: TsSchema,
    attachment_url: z.string().nullable(),
  })
  .openapi('DoubtItem');
export type DoubtItem = z.infer<typeof DoubtItemSchema>;

export const DoubtCreatedSchema = z
  .object({ id: UuidSchema, status: z.literal('OPEN') })
  .openapi('DoubtCreated');
export const UploadCreatedSchema = z
  .object({
    upload_id: UuidSchema,
    mime_type: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    bytes: z.int(),
    url: z.string(),
  })
  .openapi('UploadCreated');

export const ActivityDaySchema = z
  .object({ date: DateStringSchema, attempts: z.int(), correct: z.int(), total_time_ms: z.number() })
  .openapi('ActivityDay');
export type ActivityDay = z.infer<typeof ActivityDaySchema>;

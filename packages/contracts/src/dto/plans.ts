import { z } from '@hono/zod-openapi';
import { DifficultySchema } from '../enums';
import { DateStringSchema, SlugSchema, TsSchema, UuidSchema } from '../primitives';
import { PracticeQuestionSchema, SessionSummarySchema } from './practice';

/**
 * Diagnostic + study plan (Tabby Plus). Design: docs/superpowers/specs/2026-11-17-problem-library-and-study-plans-design.md.
 * The algorithm is @projectx/plans (pure, shared with the web mock mode).
 *
 * Access, enforced on the server:
 *  - Diagnostic: free. Report: free users get the per-subject summary and the top 3 focus chapters (`chapters` is null);
 *    Plus gets every chapter.
 *  - Plan create / read / start item: Plus only (403 FORBIDDEN, details.reason = "PREMIUM_REQUIRED"). A plan whose owner's
 *    Plus lapsed is still returned to them, read-only, with `locked = true`; nothing is deleted.
 * Students never see a readiness %, rank or predicted score. Bands and counts only.
 */

const MixSchema = z.object({ EASY: z.int(), MEDIUM: z.int(), HARD: z.int() }).openapi('DifficultyMix');
const NamedRef = z.object({ slug: SlugSchema, name: z.string() });

export const PlanBandSchema = z.enum(['unmeasured', 'weak', 'shaky', 'strong']).openapi('PlanBand');
export type PlanBand = z.infer<typeof PlanBandSchema>;

export const CreateDiagnosticBody = z
  .object({
    client_request_id: UuidSchema,
    exam: SlugSchema.default('jee-main'),
    /** Subject slugs; default all subjects of the exam. */
    subjects: z.array(SlugSchema).max(4).optional(),
    /** Chapter slugs the student has studied; default every chapter of the chosen subjects. */
    chapters: z.array(SlugSchema).max(200).optional(),
    length: z.union([z.literal(15), z.literal(30), z.literal(45)]).default(30),
  })
  .openapi('CreateDiagnosticBody');
export type CreateDiagnosticBody = z.infer<typeof CreateDiagnosticBody>;

export const DiagnosticCreatedSchema = z
  .object({
    session: SessionSummarySchema,
    questions: z.array(PracticeQuestionSchema),
    requested_mix: MixSchema,
    actual_mix: MixSchema.openapi({ description: 'What the bank could supply; a missing tier moves to the nearest one and is stated here.' }),
    short_by: z.int().openapi({ description: 'Questions fewer than requested because the bank is too small.' }),
  })
  .openapi('DiagnosticCreated');
export type DiagnosticCreated = z.infer<typeof DiagnosticCreatedSchema>;

export const ChapterResultSchema = z
  .object({
    chapter: NamedRef,
    subject: NamedRef,
    band: PlanBandSchema,
    correct: z.int(),
    answered: z.int(),
    slow: z.boolean(),
  })
  .openapi('ChapterResult');
export type ChapterResult = z.infer<typeof ChapterResultSchema>;

export const DiagnosticReportSchema = z
  .object({
    session_id: UuidSchema,
    completed: z.boolean(),
    actual_mix: MixSchema,
    subjects: z.array(z.object({ subject: NamedRef, correct: z.int(), answered: z.int(), skipped: z.int() })),
    focus: z.array(ChapterResultSchema).max(3),
    chapters: z.array(ChapterResultSchema).nullable().openapi({ description: 'Plus only; null for free users.' }),
    plus: z.boolean(),
  })
  .openapi('DiagnosticReport');
export type DiagnosticReport = z.infer<typeof DiagnosticReportSchema>;

export const CreatePlanBody = z
  .object({
    client_request_id: UuidSchema,
    diagnostic_session_id: UuidSchema,
    daily_minutes: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]).default(60),
    days: z.union([z.literal(7), z.literal(14)]).default(14),
  })
  .openapi('CreatePlanBody');
export type CreatePlanBody = z.infer<typeof CreatePlanBody>;

export const PlanItemKindSchema = z
  .enum(['REVIEW_DIAGNOSTIC', 'PRACTICE', 'PROBLEMS', 'MISTAKES', 'TIMED', 'CHECKPOINT', 'READ'])
  .openapi('PlanItemKind');

export const PlanItemSchema = z
  .object({
    key: z.string().max(20),
    kind: PlanItemKindSchema,
    chapter: NamedRef.nullable(),
    subject: NamedRef.nullable(),
    difficulty: DifficultySchema.nullable(),
    size: z.int().nullable(),
    problems: z.array(z.int()).nullable().openapi({ description: 'Problem numbers (GET /problems/{number}).' }),
    time_limit_sec: z.int().nullable(),
    minutes: z.int(),
    session_id: UuidSchema.nullable(),
    started_at: TsSchema.nullable(),
    completed_at: TsSchema.nullable(),
  })
  .openapi('PlanItem');
export type PlanItem = z.infer<typeof PlanItemSchema>;

export const StudyPlanSchema = z
  .object({
    id: UuidSchema,
    exam: SlugSchema,
    status: z.enum(['ACTIVE', 'ARCHIVED']),
    starts_on: DateStringSchema,
    days: z.int(),
    daily_minutes: z.int(),
    diagnostic_session_id: UuidSchema,
    today_index: z.int(),
    plan_days: z.array(z.object({ index: z.int(), date: DateStringSchema, light: z.boolean(), items: z.array(PlanItemSchema) })),
    locked: z.boolean().openapi({ description: 'Plus lapsed: shown read-only.' }),
    created_at: TsSchema,
  })
  .openapi('StudyPlan');
export type StudyPlan = z.infer<typeof StudyPlanSchema>;

export const PlanItemParam = z.object({ id: UuidSchema, key: z.string().regex(/^d\d{1,2}-\d{1,2}$/) });

export const PlanItemStartedSchema = z
  .object({
    item: PlanItemSchema,
    session: z.object({ session: SessionSummarySchema, questions: z.array(PracticeQuestionSchema) }).nullable(),
  })
  .openapi('PlanItemStarted');
export type PlanItemStarted = z.infer<typeof PlanItemStartedSchema>;

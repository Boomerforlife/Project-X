import { z } from '@hono/zod-openapi';
import { DifficultySchema, QuestionTypeSchema } from '../enums';
import { DateStringSchema, TsSchema } from '../primitives';

/**
 * LeetCode-style problem set. A problem is a family of questions that differ only in their numbers (template variants);
 * a one-off question is a family of one. Opening a problem serves one variant at a time (see GET /problems/{number}/next).
 *
 * Premium (Tabby Plus), enforced on the server:
 *  - `access_tier = PREMIUM` problems: listed with `locked = true`, no content served to free users.
 *  - Free users get FREE_VARIANTS_PER_PROBLEM distinct variants per problem; Plus is unlimited.
 *  - Solution extras (alternative methods, shortcuts, common mistakes) are Plus-only. The final answer and the
 *    step-by-step solution stay free.
 * Locked responses use 403 FORBIDDEN with `details.reason = "PREMIUM_REQUIRED"`.
 */

export const ProblemStatusSchema = z.enum(['SOLVED', 'ATTEMPTED']).openapi('ProblemStatus');
export const ProblemSortSchema = z.enum(['number', 'acceptance', 'difficulty']).openapi('ProblemSort');

export const ProblemSchema = z
  .object({
    number: z.int().openapi({ description: 'Stable display number, like LeetCode "#".' }),
    title: z.string(),
    difficulty: DifficultySchema.nullable(),
    subject: z.object({ slug: z.string(), name: z.string() }),
    chapter: z.object({ slug: z.string(), name: z.string() }),
    question_type: QuestionTypeSchema.nullable().openapi({ description: 'Type of the first variant.' }),
    variants: z.int().openapi({ description: 'Published versions of this problem (same idea, different numbers).' }),
    acceptance_rate: z
      .number()
      .min(0)
      .max(1)
      .nullable()
      .openapi({ description: 'Solvers / attempters. Null until at least 5 students have tried it.' }),
    attempters: z.int(),
    solvers: z.int(),
    premium: z.boolean(),
    locked: z.boolean().openapi({ description: 'Premium and the viewer is not on Plus.' }),
    status: ProblemStatusSchema.nullable().openapi({ description: 'Signed-in viewer only; null when not tried or signed out.' }),
  })
  .openapi('Problem');
export type Problem = z.infer<typeof ProblemSchema>;

export const ProblemListQuery = z.object({
  exam: z.string().default('jee-main'),
  subject: z.string().optional(),
  chapter: z.string().optional(),
  difficulty: z
    .union([DifficultySchema, z.array(DifficultySchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  status: z.enum(['SOLVED', 'ATTEMPTED', 'TODO']).optional().openapi({ description: 'Needs sign-in.' }),
  premium: z.enum(['true', 'false']).optional(),
  q: z.string().trim().min(2).max(80).optional().openapi({ description: 'Search in titles.' }),
  sort: ProblemSortSchema.default('number'),
  order: z.enum(['asc', 'desc']).default('asc'),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ProblemListQuery = z.infer<typeof ProblemListQuery>;

export const ProblemListSchema = z
  .object({
    items: z.array(ProblemSchema),
    total: z.int(),
    offset: z.int(),
    limit: z.int(),
  })
  .openapi('ProblemList');

const DifficultyCountsSchema = z.object({ EASY: z.int(), MEDIUM: z.int(), HARD: z.int(), total: z.int() });
export const ProblemSummarySchema = z
  .object({
    problems: DifficultyCountsSchema,
    solved: DifficultyCountsSchema.nullable().openapi({ description: 'Signed-in viewer only.' }),
    attempted: z.int().nullable(),
    plus: z.boolean(),
    free_variants_per_problem: z.int(),
  })
  .openapi('ProblemSummary');

export const ProblemNumberParam = z.object({ number: z.coerce.number().int().min(1) });

export const ProblemDetailSchema = ProblemSchema.extend({
  variants_tried: z.int().nullable().openapi({ description: 'Distinct variants the viewer has answered.' }),
  variants_left_free: z.int().nullable().openapi({ description: 'Free users only: variants still available without Plus.' }),
  solved_at: TsSchema.nullable(),
}).openapi('ProblemDetail');

export const DailyProblemSchema = z
  .object({ date: DateStringSchema, problem: ProblemSchema })
  .openapi('DailyProblem');

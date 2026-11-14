import { z } from '@hono/zod-openapi';
import { DecSchema, UuidSchema } from '../primitives';

export const DecimalRangeSchema = z.object({ min: DecSchema, max: DecSchema }).openapi('DecimalRange');
export type DecimalRange = z.infer<typeof DecimalRangeSchema>;

export const AnswerKeySchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('SINGLE_MCQ'), correct_option_ids: z.array(UuidSchema).min(1).max(5) }),
    z.object({ type: z.literal('MULTI_MCQ'), correct_option_ids: z.array(UuidSchema).min(1).max(5) }),
    z.object({
      type: z.literal('NUMERICAL'),
      accepted_ranges: z.array(DecimalRangeSchema).min(1).max(5),
      display_value: DecSchema,
    }),
  ])
  .openapi('AnswerKey');
export type AnswerKey = z.infer<typeof AnswerKeySchema>;

export const AnswerResponseSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('SINGLE_MCQ'), option_id: UuidSchema }),
    z.object({
      type: z.literal('MULTI_MCQ'),
      option_ids: z
        .array(UuidSchema)
        .min(1)
        .max(5)
        .refine((a) => new Set(a).size === a.length, { message: 'option_ids must be unique' }),
    }),
    z.object({ type: z.literal('NUMERICAL'), value: DecSchema }),
  ])
  .openapi('AnswerResponse');
export type AnswerResponse = z.infer<typeof AnswerResponseSchema>;

/** official_answer_keys.normalized_answer (DATABASE_SCHEMA §2). */
export const OfficialAnswerSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('OPTION_LABELS'), labels: z.array(z.enum(['A', 'B', 'C', 'D', 'E'])).min(1).max(5) }),
    z.object({ kind: z.literal('EXTERNAL_OPTION_IDS'), ids: z.array(z.string().min(1).max(40)).min(1).max(5) }),
    z.object({ kind: z.literal('NUMERIC'), accepted_ranges: z.array(DecimalRangeSchema).min(1).max(5) }),
    z.object({ kind: z.literal('DROPPED') }),
  ])
  .openapi('OfficialAnswer');
export type OfficialAnswer = z.infer<typeof OfficialAnswerSchema>;

const labels = z.array(z.enum(['A', 'B', 'C', 'D', 'E'])).optional();
/** AnswerKey as shown to users: `AnswerKey & { correct_labels? }` (flattened so it is a plain discriminated union). */
export const AnswerKeyWithLabelsSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('SINGLE_MCQ'), correct_option_ids: z.array(UuidSchema).min(1).max(5), correct_labels: labels }),
    z.object({ type: z.literal('MULTI_MCQ'), correct_option_ids: z.array(UuidSchema).min(1).max(5), correct_labels: labels }),
    z.object({
      type: z.literal('NUMERICAL'),
      accepted_ranges: z.array(DecimalRangeSchema).min(1).max(5),
      display_value: DecSchema,
      correct_labels: labels,
    }),
  ])
  .openapi('AnswerKeyWithLabels');
export type AnswerKeyWithLabels = z.infer<typeof AnswerKeyWithLabelsSchema>;

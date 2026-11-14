import { z } from 'zod';
import { OPTION_LABELS } from '../types.js';

export const OptionLabelSchema = z.enum(OPTION_LABELS);

/** labels is [] for NUMERIC; value is a decimal string for NUMERIC, null for OPTIONS. */
export const AiAnswerSchema = z.object({
  kind: z.enum(['OPTIONS', 'NUMERIC']),
  labels: z.array(OptionLabelSchema).max(5),
  value: z.string().max(40).nullable(),
});
export type AiAnswer = z.infer<typeof AiAnswerSchema>;

export const AnswerOutputSchema = z.object({
  answer: AiAnswerSchema,
  confidence: z.number().min(0).max(1),
  brief_reasoning: z.string().max(600),
});
export type AnswerOutput = z.infer<typeof AnswerOutputSchema>;

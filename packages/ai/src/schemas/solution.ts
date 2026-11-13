import { z } from 'zod';
import { AiAnswerSchema } from './answer.js';

export const AiStepSchema = z.object({
  title: z.string().max(200).nullable(),
  text: z.string().min(1).max(2000),
  display_math: z.string().max(2000).nullable(),
});
export type AiStep = z.infer<typeof AiStepSchema>;

export const AiSympyCheckSchema = z.object({
  kind: z.enum(['NUMERIC_EVAL', 'SYMBOLIC_EQUIV']),
  expression: z.string().min(1).max(500),
  compare_to: z.string().min(1).max(500),
  variables: z.array(z.object({ name: z.string().min(1).max(32), value: z.string().max(60) })).max(10),
});
export type AiSympyCheck = z.infer<typeof AiSympyCheckSchema>;

export const SolutionOutputSchema = z.object({
  answer: AiAnswerSchema,
  summary: z.string().max(600),
  steps: z.array(AiStepSchema).min(1).max(15),
  formulas: z.array(z.object({ name: z.string().max(200), latex: z.string().max(1000) })).max(10),
  concepts: z.array(z.string().max(200)).max(8),
  shortcuts: z.array(z.string().max(500)).max(5),
  common_mistakes: z.array(z.string().max(500)).max(5),
  sympy_checks: z.array(AiSympyCheckSchema).max(3),
});
export type SolutionOutput = z.infer<typeof SolutionOutputSchema>;

export const AlternativesOutputSchema = z.object({
  alternatives: z.array(z.object({ title: z.string().max(200), steps: z.array(AiStepSchema).min(1).max(15) })).max(2),
});
export type AlternativesOutput = z.infer<typeof AlternativesOutputSchema>;

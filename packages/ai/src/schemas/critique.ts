import { z } from 'zod';
import { AiAnswerSchema } from './answer.js';

export const CritiqueOutputSchema = z.object({
  verdict: z.enum(['CORRECT', 'INCORRECT', 'UNSURE']),
  recomputed_answer: AiAnswerSchema.nullable(),
  issues: z
    .array(
      z.object({
        severity: z.enum(['MINOR', 'MAJOR']),
        step_index: z.number().int().min(0).max(100).nullable(),
        description: z.string().max(400),
      }),
    )
    .max(10),
});
export type CritiqueOutput = z.infer<typeof CritiqueOutputSchema>;

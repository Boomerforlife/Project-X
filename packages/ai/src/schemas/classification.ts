import { z } from 'zod';
import { DIFFICULTIES, QUESTION_TYPES, SUBJECT_CODES } from '../types.js';

export const ClassificationOutputSchema = z.object({
  subject_code: z.enum(SUBJECT_CODES),
  chapter_slug: z.string().min(1).max(200),
  topic_slug: z.string().max(200).nullable(),
  difficulty: z.enum(DIFFICULTIES),
  question_type: z.enum(QUESTION_TYPES),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(300),
});
export type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>;

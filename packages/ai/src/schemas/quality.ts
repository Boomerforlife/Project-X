import { z } from 'zod';

export const QualityOutputSchema = z.object({
  is_complete: z.boolean(),
  is_ambiguous: z.boolean(),
  ocr_errors_suspected: z.boolean(),
  missing_figure: z.boolean(),
  issues: z.array(z.string().max(300)).max(8),
});
export type QualityOutput = z.infer<typeof QualityOutputSchema>;

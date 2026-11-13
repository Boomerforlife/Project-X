import { z } from 'zod';

export const SeoOutputSchema = z.object({
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(155),
  keywords: z.array(z.string().max(60)).max(8),
});
export type SeoOutput = z.infer<typeof SeoOutputSchema>;

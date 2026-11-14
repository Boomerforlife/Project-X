import { z } from '@hono/zod-openapi';
import { UuidSchema } from '../primitives';

export const InlineTextSchema = z.string().max(20000);
const inline = (max: number) => z.string().max(max);

export const ContentBlockSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('paragraph'), text: InlineTextSchema }),
    z.object({ type: z.literal('math'), latex: z.string().max(5000) }),
    z.object({ type: z.literal('image'), asset_id: UuidSchema, alt: z.string().max(300), caption: inline(500).optional() }),
    z.object({
      type: z.literal('table'),
      header: z.array(inline(500)).max(12).nullable(),
      rows: z.array(z.array(inline(500)).max(12)).max(50),
    }),
    z.object({ type: z.literal('list'), ordered: z.boolean(), items: z.array(inline(2000)).min(1).max(30) }),
  ])
  .openapi('ContentBlock');
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export const ContentBlocksSchema = z.array(ContentBlockSchema).min(1).max(100).openapi('ContentBlocks');
export type ContentBlocks = z.infer<typeof ContentBlocksSchema>;

export const PublicContentBlockSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('paragraph'), text: InlineTextSchema }),
    z.object({ type: z.literal('math'), latex: z.string().max(5000) }),
    z.object({
      type: z.literal('image'),
      asset_id: UuidSchema,
      alt: z.string().max(300),
      caption: inline(500).optional(),
      url: z.url(),
      width: z.int().nullable(),
      height: z.int().nullable(),
    }),
    z.object({
      type: z.literal('table'),
      header: z.array(inline(500)).max(12).nullable(),
      rows: z.array(z.array(inline(500)).max(12)).max(50),
    }),
    z.object({ type: z.literal('list'), ordered: z.boolean(), items: z.array(inline(2000)).min(1).max(30) }),
  ])
  .openapi('PublicContentBlock');
export type PublicContentBlock = z.infer<typeof PublicContentBlockSchema>;

export const OptionLabelSchema = z.enum(['A', 'B', 'C', 'D', 'E']).openapi('OptionLabel');
export type OptionLabel = z.infer<typeof OptionLabelSchema>;

/** Solution step (DB shape; blocks reference asset ids). */
export const SolutionStepSchema = z
  .object({ index: z.int().min(1), title: z.string().max(300).nullable(), blocks: z.array(ContentBlockSchema).max(100) })
  .openapi('SolutionStep');
export type SolutionStep = z.infer<typeof SolutionStepSchema>;
export const FormulaSchema = z.object({ name: z.string().max(200), latex: z.string().max(2000) }).openapi('Formula');
export type Formula = z.infer<typeof FormulaSchema>;
export const AlternativeSchema = z
  .object({ title: z.string().max(300), steps: z.array(SolutionStepSchema).max(50) })
  .openapi('SolutionAlternative');
export type Alternative = z.infer<typeof AlternativeSchema>;

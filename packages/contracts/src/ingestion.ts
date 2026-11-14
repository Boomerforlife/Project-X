import { z } from '@hono/zod-openapi';
import { AssetKindSchema, QuestionTypeSchema } from './enums';
import { OfficialAnswerSchema } from './domain/answers';
import { OptionLabelSchema } from './domain/content';
import { UuidSchema } from './primitives';

const inline = (max: number) => z.string().max(max);

/** Content block as emitted by extraction: images reference `asset_ref` (resolved to asset_id on promotion). */
export const NormalizedContentBlockSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('paragraph'), text: z.string().max(20000) }),
    z.object({ type: z.literal('math'), latex: z.string().max(5000) }),
    z.object({
      type: z.literal('image'),
      asset_ref: z.string().min(1).max(100),
      alt: z.string().max(300),
      caption: inline(500).optional(),
    }),
    z.object({
      type: z.literal('table'),
      header: z.array(inline(500)).max(12).nullable(),
      rows: z.array(z.array(inline(500)).max(12)).max(50),
    }),
    z.object({ type: z.literal('list'), ordered: z.boolean(), items: z.array(inline(2000)).min(1).max(30) }),
  ])
  .openapi('NormalizedContentBlock');
export type NormalizedContentBlock = z.infer<typeof NormalizedContentBlockSchema>;

export const NormalizedAssetSchema = z
  .object({
    asset_ref: z.string().min(1).max(100),
    asset_id: UuidSchema.nullable(),
    kind: AssetKindSchema,
    page: z.int().min(1),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    mime_type: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    width: z.int().min(1),
    height: z.int().min(1),
    r2_key: z.string().min(1),
  })
  .openapi('NormalizedAsset');
export type NormalizedAsset = z.infer<typeof NormalizedAssetSchema>;

export const NormalizedOptionSchema = z
  .object({
    label: OptionLabelSchema,
    external_option_id: z.string().max(40).nullable(),
    content: z.array(NormalizedContentBlockSchema).min(1).max(100),
  })
  .openapi('NormalizedOption');
export type NormalizedOption = z.infer<typeof NormalizedOptionSchema>;

export const ExtractionInfoSchema = z
  .object({
    method: z.enum(['TEXT', 'OCR', 'MIXED']),
    ocr_engine: z.string().nullable(),
    mean_confidence: z.number().min(0).max(1).nullable(),
    warnings: z.array(z.string()),
  })
  .openapi('ExtractionInfo');
export type ExtractionInfo = z.infer<typeof ExtractionInfoSchema>;

export const NormalizedQuestionSchema = z
  .object({
    schema_version: z.literal(1),
    question_number: z.string().min(1).max(20),
    external_question_id: z.string().max(40).nullable(),
    section_hint: z.enum(['PHYSICS', 'CHEMISTRY', 'MATHEMATICS']).nullable(),
    question_type_guess: QuestionTypeSchema.nullable(),
    content: z.array(NormalizedContentBlockSchema).min(1).max(100),
    options: z.array(NormalizedOptionSchema).max(5),
    assets: z.array(NormalizedAssetSchema).max(50),
    page_start: z.int().min(1),
    page_end: z.int().min(1),
    question_text: z.string().min(1).max(20000),
    normalized_text: z.string().min(1),
    content_hash: z.string().regex(/^[0-9a-f]{64}$/),
    extraction: ExtractionInfoSchema,
  })
  .openapi('NormalizedQuestion');
export type NormalizedQuestion = z.infer<typeof NormalizedQuestionSchema>;

/** Output bundle of `pxw process-document` (offline). */
export const IngestionBundleSchema = z
  .object({
    schema_version: z.literal(1),
    document: z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/), page_count: z.int().min(0), filename: z.string() }).optional(),
    questions: z.array(NormalizedQuestionSchema),
  })
  .openapi('IngestionBundle');
export type IngestionBundle = z.infer<typeof IngestionBundleSchema>;

export const OfficialKeyInSchema = z
  .object({
    paper_id: UuidSchema,
    source_document_id: UuidSchema,
    question_number: z.string().max(20).nullable(),
    external_question_id: z.string().max(40).nullable(),
    raw_answer: z.string().max(200),
    normalized_answer: OfficialAnswerSchema,
    is_dropped: z.boolean(),
  })
  .refine((v) => v.question_number !== null || v.external_question_id !== null, {
    message: 'question_number or external_question_id required',
  })
  .openapi('OfficialKeyIn');
export type OfficialKeyIn = z.infer<typeof OfficialKeyInSchema>;

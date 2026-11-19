/**
 * Monetisation and classification contracts (Owner A, 2026-11-19):
 *  - entitlements: one server answer to "what does this viewer get" (tier, features, limits, ads eligibility),
 *  - rewarded-ad credits (Google Ad Manager rewarded ads for web; see migration 0026 for the verification limits),
 *  - checkout signature verification (faster than waiting for the webhook; the webhook stays authoritative too),
 *  - admin question classification (difficulty / chapter / topic, bulk).
 */
import { z } from '@hono/zod-openapi';
import { DifficultySchema, QuestionOriginSchema, QuestionTypeSchema } from '../enums';
import { AnswerKeySchema } from '../domain/answers';
import { OptionLabelSchema, PublicContentBlockSchema } from '../domain/content';
import { SlugSchema, TsSchema, UuidSchema } from '../primitives';

// ---------------------------------------------------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------------------------------------------------

export const FeatureKeySchema = z
  .enum([
    'ad_free',
    'cbt_unlimited',
    'premium_problems',
    'unlimited_variants',
    'solution_extras',
    'study_plan',
    'study_plan_full',
    'diagnostic_full_report',
  ])
  .openapi('FeatureKey');
export type FeatureKey = z.infer<typeof FeatureKeySchema>;

export const EntitlementsSchema = z
  .object({
    tier: z.enum(['FREE', 'PLUS']),
    plus_until: TsSchema.nullable(),
    /** Every feature key, true when this viewer has it now. */
    features: z.record(FeatureKeySchema, z.boolean()),
    limits: z.object({
      /** null = unlimited (Plus, or payments switched off so no paywall exists). */
      full_papers_per_month: z.int().nullable(),
      full_papers_used: z.int(),
      /** Extra full papers earned this month from rewarded ads (already included in full_papers_per_month). */
      full_papers_rewarded: z.int(),
      variants_per_problem: z.int().nullable(),
      plan_max_days: z.int(),
      plan_max_daily_minutes: z.int(),
    }),
    ads: z.object({
      /** Display/in-feed ads may be shown to this viewer (free tier). The web still applies its own placement rules. */
      eligible: z.boolean(),
      /** Optional rewarded opportunities are switched on server-side. */
      rewarded_enabled: z.boolean(),
    }),
    payments_enabled: z.boolean(),
  })
  .openapi('Entitlements');
export type Entitlements = z.infer<typeof EntitlementsSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Rewarded-ad credits
// ---------------------------------------------------------------------------------------------------------------------

export const RewardUnavailableReasonSchema = z
  .enum(['DISABLED', 'PLUS', 'NOT_NEEDED', 'DAILY_CAP', 'MONTHLY_CAP'])
  .openapi('RewardUnavailableReason');

export const RewardOfferSchema = z
  .object({
    code: z.string(),
    label: z.string(),
    description: z.string(),
    benefit: z.enum(['FULL_PAPER_CREDIT']),
    amount: z.int(),
    min_seconds: z.int(),
    available: z.boolean(),
    reason: RewardUnavailableReasonSchema.nullable(),
    granted_today: z.int(),
    granted_this_month: z.int(),
    daily_cap: z.int(),
    monthly_cap: z.int(),
  })
  .openapi('RewardOffer');
export type RewardOffer = z.infer<typeof RewardOfferSchema>;

export const RewardOffersSchema = z.object({ offers: z.array(RewardOfferSchema) }).openapi('RewardOffers');
export type RewardOffers = z.infer<typeof RewardOffersSchema>;

export const RewardCodeParam = z.object({ code: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/) });

export const RewardStartSchema = z
  .object({ nonce: z.string(), expires_at: TsSchema, min_seconds: z.int() })
  .openapi('RewardStart');
export type RewardStart = z.infer<typeof RewardStartSchema>;

/** `GRANTED` only when GPT fired rewardedSlotGranted. Any other outcome records that no reward was earned. */
export const RewardClaimBody = z
  .object({
    nonce: z.string().regex(/^[a-f0-9]{48}$/),
    outcome: z.enum(['GRANTED', 'CLOSED', 'NO_FILL', 'ERROR']),
  })
  .openapi('RewardClaimBody');
export type RewardClaimBody = z.infer<typeof RewardClaimBody>;

export const RewardClaimResultSchema = z
  .object({
    status: z.enum(['GRANTED', 'NOT_GRANTED']),
    reason: z.enum(['CLOSED', 'NO_FILL', 'ERROR', 'TOO_FAST', 'EXPIRED', 'ALREADY_USED', 'CAP_REACHED', 'PLUS']).nullable(),
    offer: RewardOfferSchema,
  })
  .openapi('RewardClaimResult');
export type RewardClaimResult = z.infer<typeof RewardClaimResultSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Checkout verification (Razorpay Standard Checkout handler response)
// ---------------------------------------------------------------------------------------------------------------------

export const VerifyPaymentBody = z
  .object({
    razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
    razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
    razorpay_signature: z.string().regex(/^[a-fA-F0-9]{64}$/),
  })
  .openapi('VerifyPaymentBody');
export type VerifyPaymentBody = z.infer<typeof VerifyPaymentBody>;

// ---------------------------------------------------------------------------------------------------------------------
// Admin classification
// ---------------------------------------------------------------------------------------------------------------------

export const DifficultyFilterSchema = z.enum(['EASY', 'MEDIUM', 'HARD', 'UNCLASSIFIED']).openapi('DifficultyFilter');
export type DifficultyFilter = z.infer<typeof DifficultyFilterSchema>;

const csvOf = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v), z.array(item).min(1).max(10));

export const ClassifyQuery = z
  .object({
    exam: SlugSchema.optional(),
    subject: SlugSchema.optional(),
    /** A chapter slug, or `none` for questions without a chapter. */
    chapter: z.union([SlugSchema, z.literal('none')]).optional(),
    difficulty: csvOf(DifficultyFilterSchema).optional(),
    year: z.coerce.number().int().min(1978).max(2100).optional(),
    question_type: QuestionTypeSchema.optional(),
    publication_status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    origin: QuestionOriginSchema.optional(),
    /** Question id (uuid), slug fragment, or words from the text. */
    q: z.string().trim().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .openapi('ClassifyQuery');
export type ClassifyQuery = z.infer<typeof ClassifyQuery>;

const Named = z.object({ slug: z.string(), name: z.string() });

export const ClassifyItemSchema = z
  .object({
    id: UuidSchema,
    slug: z.string(),
    exam: Named,
    subject: Named.nullable(),
    chapter: Named.nullable(),
    topic: Named.nullable(),
    difficulty: DifficultySchema.nullable(),
    difficulty_source: z.enum(['ADMIN', 'AI', 'IMPORT']).nullable(),
    difficulty_set_at: TsSchema.nullable(),
    question_type: QuestionTypeSchema,
    origin: QuestionOriginSchema,
    publication_status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
    verification_status: z.string(),
    year: z.int().nullable(),
    shift: z.int().nullable(),
    question_number: z.string().nullable(),
    paper: z.string().nullable(),
    excerpt: z.string(),
    has_answer_key: z.boolean(),
    answer_key_source: z.string().nullable(),
    row_version: z.int(),
    updated_at: TsSchema,
  })
  .openapi('ClassifyItem');
export type ClassifyItem = z.infer<typeof ClassifyItemSchema>;

export const DifficultyCountsSchema = z
  .object({ EASY: z.int(), MEDIUM: z.int(), HARD: z.int(), UNCLASSIFIED: z.int() })
  .openapi('DifficultyCounts');
export type DifficultyCountsDto = z.infer<typeof DifficultyCountsSchema>;

export const ClassifyListSchema = z
  .object({
    items: z.array(ClassifyItemSchema),
    total: z.int(),
    offset: z.int(),
    limit: z.int(),
    /** Counts for the current filters, ignoring the difficulty filter. */
    counts: DifficultyCountsSchema,
  })
  .openapi('ClassifyList');
export type ClassifyList = z.infer<typeof ClassifyListSchema>;

export const BulkClassifyBody = z
  .object({
    ids: z.array(UuidSchema).min(1).max(200),
    difficulty: DifficultyFilterSchema.optional(),
    chapter: SlugSchema.optional(),
    /** A topic slug inside the chapter, or null to clear it. */
    topic: SlugSchema.nullable().optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.difficulty !== undefined || b.chapter !== undefined || b.topic !== undefined, {
    message: 'Set at least one of difficulty, chapter, topic',
  })
  .openapi('BulkClassifyBody');
export type BulkClassifyBody = z.infer<typeof BulkClassifyBody>;

export const BulkClassifyResultSchema = z
  .object({
    updated: z.int(),
    skipped: z.array(z.object({ id: UuidSchema, reason: z.string() })),
  })
  .openapi('BulkClassifyResult');
export type BulkClassifyResult = z.infer<typeof BulkClassifyResultSchema>;

export const ClassifyPreviewSchema = z
  .object({
    id: UuidSchema,
    content: z.array(PublicContentBlockSchema),
    options: z.array(z.object({ label: OptionLabelSchema, content: z.array(PublicContentBlockSchema) })),
    answer_key: AnswerKeySchema.nullable(),
    answer_key_source: z.string().nullable(),
    /** Option label(s) the answer key points at, resolved server-side for display. */
    correct_labels: z.array(OptionLabelSchema),
    solution_versions: z.int(),
  })
  .openapi('ClassifyPreview');
export type ClassifyPreview = z.infer<typeof ClassifyPreviewSchema>;

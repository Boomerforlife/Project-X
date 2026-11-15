import { z } from '@hono/zod-openapi';
import { DateStringSchema, TsSchema, UuidSchema } from '../primitives';

/**
 * Tabby Plus billing contracts (prepaid passes via Razorpay one-time Orders).
 * Prices are always read from the server; the client never sends an amount.
 */

export const PlanCodeSchema = z.string().regex(/^[a-z][a-z0-9_]*$/).max(40).openapi('PlanCode');
export const PromoCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/)
  .openapi('PromoCode');

export const BillingPlanSchema = z
  .object({
    code: PlanCodeSchema,
    name: z.string(),
    price_paise: z.int(),
    currency: z.literal('INR'),
    duration_days: z.int(),
    badge: z.enum(['RECOMMENDED', 'BEST_VALUE', 'LAUNCH']).nullable(),
    launch_only: z.boolean(),
    features: z.array(z.string()),
  })
  .openapi('BillingPlan');
export type BillingPlan = z.infer<typeof BillingPlanSchema>;

export const BillingPlansSchema = z
  .object({
    plans: z.array(BillingPlanSchema),
    free: z.object({ full_papers_per_month: z.int() }),
    payments_enabled: z.boolean(),
  })
  .openapi('BillingPlans');
export type BillingPlans = z.infer<typeof BillingPlansSchema>;

export const OrderStatusSchema = z.enum(['CREATED', 'PAID', 'FAILED', 'REFUNDED']).openapi('OrderStatus');
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const CreateOrderBody = z
  .object({
    client_request_id: UuidSchema,
    plan_code: PlanCodeSchema,
    promo_code: PromoCodeSchema.optional(),
  })
  .openapi('CreateOrderBody');
export type CreateOrderBody = z.infer<typeof CreateOrderBody>;

/** What the browser needs to open Razorpay Checkout. `key_id` is the public key id, never the secret. */
export const CheckoutOrderSchema = z
  .object({
    order_id: UuidSchema,
    razorpay_order_id: z.string(),
    key_id: z.string(),
    amount_paise: z.int(),
    list_price_paise: z.int(),
    currency: z.literal('INR'),
    plan: BillingPlanSchema,
    promo_code: z.string().nullable(),
  })
  .openapi('CheckoutOrder');
export type CheckoutOrder = z.infer<typeof CheckoutOrderSchema>;

export const OrderSchema = z
  .object({
    id: UuidSchema,
    plan_code: PlanCodeSchema,
    plan_name: z.string(),
    amount_paise: z.int(),
    currency: z.literal('INR'),
    status: OrderStatusSchema,
    payer: z.enum(['SELF', 'PAYMENT_LINK']),
    promo_code: z.string().nullable(),
    receipt: z.string(),
    created_at: TsSchema,
    paid_at: TsSchema.nullable(),
    refunded_at: TsSchema.nullable(),
  })
  .openapi('Order');
export type Order = z.infer<typeof OrderSchema>;

export const EntitlementSchema = z
  .object({
    id: UuidSchema,
    source: z.enum(['PURCHASE', 'PROMO', 'SUPPORT_GRANT']),
    starts_at: TsSchema,
    ends_at: TsSchema,
    revoked_at: TsSchema.nullable(),
    order_id: UuidSchema.nullable(),
  })
  .openapi('Entitlement');

export const BillingMeSchema = z
  .object({
    tier: z.enum(['FREE', 'PLUS']),
    plus_until: TsSchema.nullable(),
    launch_eligible: z.boolean(),
    entitlements: z.array(EntitlementSchema),
    quota: z.object({
      full_papers: z.object({ used: z.int(), limit: z.int().nullable(), resets_on: DateStringSchema }),
    }),
    payments_enabled: z.boolean(),
  })
  .openapi('BillingMe');
export type BillingMe = z.infer<typeof BillingMeSchema>;

export const CreatePaymentLinkBody = z.object({ plan_code: PlanCodeSchema }).openapi('CreatePaymentLinkBody');
export const PaymentLinkSchema = z
  .object({ token: z.string(), url: z.string().nullable(), plan: BillingPlanSchema, expires_at: TsSchema })
  .openapi('PaymentLink');
export type PaymentLink = z.infer<typeof PaymentLinkSchema>;

/** Public view of a parent payment link: only what a payer needs (no email, no ids). */
export const PublicPaymentLinkSchema = z
  .object({
    plan: BillingPlanSchema,
    student_first_name: z.string().nullable(),
    expires_at: TsSchema,
    status: z.enum(['OPEN', 'PAID', 'EXPIRED']),
    payments_enabled: z.boolean(),
  })
  .openapi('PublicPaymentLink');
export type PublicPaymentLink = z.infer<typeof PublicPaymentLinkSchema>;

export const PaymentLinkTokenParam = z.object({ token: z.string().regex(/^[a-f0-9]{48}$/) });

// ---- admin
export const AdminOrderSchema = OrderSchema.extend({
  user_id: UuidSchema.nullable(),
  razorpay_order_id: z.string().nullable(),
  razorpay_payment_id: z.string().nullable(),
  refund_requested_at: TsSchema.nullable(),
}).openapi('AdminOrder');
export type AdminOrder = z.infer<typeof AdminOrderSchema>;

export const AdminOrdersQuery = z.object({
  status: OrderStatusSchema.optional(),
  user_id: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const PromoCodeAdminSchema = z
  .object({
    code: z.string(),
    percent_off: z.int().nullable(),
    amount_off_paise: z.int().nullable(),
    plan_codes: z.array(z.string()).nullable(),
    max_redemptions: z.int().nullable(),
    redeemed: z.int(),
    new_users_only: z.boolean(),
    valid_from: TsSchema.nullable(),
    valid_to: TsSchema.nullable(),
    active: z.boolean(),
    note: z.string().nullable(),
  })
  .openapi('PromoCodeAdmin');

export const CreatePromoCodeBody = z
  .object({
    code: PromoCodeSchema,
    percent_off: z.int().min(1).max(100).optional(),
    amount_off_paise: z.int().min(1).optional(),
    plan_codes: z.array(PlanCodeSchema).min(1).optional(),
    max_redemptions: z.int().min(1).optional(),
    new_users_only: z.boolean().default(false),
    valid_from: z.iso.datetime().optional(),
    valid_to: z.iso.datetime().optional(),
    note: z.string().max(200).optional(),
  })
  .refine((b) => (b.percent_off === undefined) !== (b.amount_off_paise === undefined), {
    message: 'Set exactly one of percent_off or amount_off_paise',
  })
  .openapi('CreatePromoCodeBody');

export const PatchPromoCodeBody = z.object({ active: z.boolean() }).openapi('PatchPromoCodeBody');
export const PromoCodeParam = z.object({ code: PromoCodeSchema });

export const GrantEntitlementBody = z
  .object({ user_id: UuidSchema, days: z.int().min(1).max(400), note: z.string().min(3).max(200) })
  .openapi('GrantEntitlementBody');
export const RevokeEntitlementBody = z.object({ note: z.string().min(3).max(200) }).openapi('RevokeEntitlementBody');
export const RefundOrderBody = z.object({ note: z.string().min(3).max(200) }).openapi('RefundOrderBody');

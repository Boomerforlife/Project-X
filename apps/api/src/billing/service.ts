/**
 * Tabby Plus billing service. Talks to Postgres directly through `db.withService` (service role; billing tables have no
 * client grants) so the module stays separate from the content/practice repositories.
 *
 * Invariants:
 *  - Amounts come from billing_plans (+ a validated promo). Never from the client.
 *  - Only a server-verified Razorpay event marks an order PAID and grants access: the signed webhook, or the checkout
 *    handler's signature (HMAC with the key secret) confirmed against Razorpay's own payment record (verifyCheckout).
 *    A browser "success" callback on its own never grants anything.
 *  - Webhook handling is idempotent (billing_events primary key = Razorpay event id) and atomic (one transaction).
 *  - Passes stack from the current access end; revoking a pass pulls later stacked passes earlier.
 */
import type { Db, SqlTx } from '@projectx/db';
import type {
  AdminOrder,
  BillingMe,
  BillingPlan,
  BillingPlans,
  CheckoutOrder,
  CreateOrderBody,
  Order,
  PaymentLink,
  PublicPaymentLink,
} from '@projectx/contracts';
import type { AppConfig } from '../config';
import type { Logger } from '../deps';
import { ApiError, notFound, validation } from '../lib/errors';
import { RazorpayError, verifyCheckoutSignature, verifyWebhookSignature, type RazorpayClient } from './razorpay';

export interface BillingDeps {
  db: Db;
  config: AppConfig;
  clock: () => Date;
  logger: Logger;
  razorpay: RazorpayClient | null;
}

type Tx = SqlTx;
const rows = async <T>(tx: Tx, sql: string, p: readonly unknown[] = []): Promise<T[]> => (await tx.query<T>(sql, p)).rows;
const one = async <T>(tx: Tx, sql: string, p: readonly unknown[] = []): Promise<T | null> => (await rows<T>(tx, sql, p))[0] ?? null;
const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString());
const DAY_MS = 86_400_000;
const PAYMENT_LINK_TTL_DAYS = 7;
const LAUNCH_ACCOUNT_AGE_DAYS = 30;

interface PlanRow {
  code: string;
  name: string;
  price_paise: number;
  currency: 'INR';
  duration_days: number;
  badge: BillingPlan['badge'];
  launch_only: boolean;
  active: boolean;
  features: string[];
}
interface OrderRow {
  id: string;
  user_id: string | null;
  client_request_id: string | null;
  plan_code: string;
  amount_paise: number;
  list_price_paise: number;
  currency: 'INR';
  promo_code: string | null;
  payer: 'SELF' | 'PAYMENT_LINK';
  payment_link_id: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  status: 'CREATED' | 'PAID' | 'FAILED' | 'REFUNDED';
  refund_requested_at: string | null;
  created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
  receipt: string;
}
interface EntRow {
  id: string;
  user_id: string;
  source: 'PURCHASE' | 'PROMO' | 'SUPPORT_GRANT';
  order_id: string | null;
  starts_at: string;
  ends_at: string;
  revoked_at: string | null;
}
interface PromoRow {
  code: string;
  percent_off: number | null;
  amount_off_paise: number | null;
  plan_codes: string[] | null;
  max_redemptions: number | null;
  redeemed: number;
  new_users_only: boolean;
  valid_from: string | null;
  valid_to: string | null;
  active: boolean;
  note: string | null;
}

const PLAN_COLS = `code, name, price_paise, currency, duration_days, badge, launch_only, active, features`;
const ORDER_COLS = `id, user_id, client_request_id, plan_code, amount_paise, list_price_paise, currency, promo_code, payer, payment_link_id,
  razorpay_order_id, razorpay_payment_id, status, refund_requested_at, created_at, paid_at, refunded_at, receipt`;

const planDto = (p: PlanRow): BillingPlan => ({
  code: p.code,
  name: p.name,
  price_paise: Number(p.price_paise),
  currency: 'INR',
  duration_days: Number(p.duration_days),
  badge: p.badge ?? null,
  launch_only: p.launch_only,
  features: p.features ?? [],
});

function orderDto(o: OrderRow, planName: string): Order {
  return {
    id: o.id,
    plan_code: o.plan_code,
    plan_name: planName,
    amount_paise: Number(o.amount_paise),
    currency: 'INR',
    status: o.status,
    payer: o.payer,
    promo_code: o.promo_code,
    receipt: o.receipt,
    created_at: iso(o.created_at)!,
    paid_at: iso(o.paid_at),
    refunded_at: iso(o.refunded_at),
  };
}

function randomHex(bytes: number): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
/** Razorpay receipts are at most 40 characters. */
const newReceipt = (now: Date): string => `tp_${now.getTime().toString(36)}_${randomHex(6)}`;

function paymentsUnavailable(): ApiError {
  return new ApiError('SERVICE_UNAVAILABLE', 'Payments are not available right now', { details: { reason: 'BILLING_DISABLED' } });
}

// ---------------------------------------------------------------------------------------------------------------------
// Access + quota
// ---------------------------------------------------------------------------------------------------------------------

export async function plusUntil(tx: Tx, userId: string): Promise<Date | null> {
  const r = await one<{ until: string | null }>(
    tx,
    `select max(ends_at) as until from public.billing_entitlements where user_id=$1 and revoked_at is null`,
    [userId],
  );
  return r?.until ? new Date(r.until) : null;
}

async function hasPaidBefore(tx: Tx, userId: string): Promise<boolean> {
  const r = await one(tx, `select 1 from public.billing_orders where user_id=$1 and status in ('PAID','REFUNDED') limit 1`, [userId]);
  return r !== null;
}

async function launchEligible(tx: Tx, userId: string, now: Date): Promise<boolean> {
  const u = await one<{ created_at: string }>(tx, `select created_at from auth.users where id=$1`, [userId]);
  if (!u) return false;
  if (now.getTime() - new Date(u.created_at).getTime() > LAUNCH_ACCOUNT_AGE_DAYS * DAY_MS) return false;
  return !(await hasPaidBefore(tx, userId));
}

/** First day of the current month in IST, and the first day of next month. */
export async function quotaPeriod(tx: Tx, now: Date): Promise<{ period: string; resets: string }> {
  const r = await one<{ period: string; resets: string }>(
    tx,
    `select to_char(date_trunc('month', ($1::timestamptz at time zone 'Asia/Kolkata')), 'YYYY-MM-DD') as period,
            to_char(date_trunc('month', ($1::timestamptz at time zone 'Asia/Kolkata')) + interval '1 month', 'YYYY-MM-DD') as resets`,
    [now.toISOString()],
  );
  return r!;
}

/** Extra full papers earned from rewarded ads in a quota period (migration 0026). */
export async function rewardedFullPapers(tx: Tx, userId: string, period: string): Promise<number> {
  const r = await one<{ n: number }>(
    tx,
    `select coalesce(sum(amount), 0)::int as n from public.ad_reward_claims
      where user_id=$1 and benefit='FULL_PAPER_CREDIT' and status='GRANTED' and period=$2::date`,
    [userId, period],
  );
  return Number(r?.n ?? 0);
}

export async function isPlus(d: BillingDeps, userId: string): Promise<boolean> {
  return d.db.withService(async (tx) => {
    const until = await plusUntil(tx, userId);
    return !!until && until > d.clock();
  });
}

export async function getMe(d: BillingDeps, userId: string): Promise<BillingMe> {
  const now = d.clock();
  return d.db.withService(async (tx) => {
    const ents = await rows<EntRow>(
      tx,
      `select id, user_id, source, order_id, starts_at, ends_at, revoked_at from public.billing_entitlements
        where user_id=$1 order by starts_at desc limit 50`,
      [userId],
    );
    const until = await plusUntil(tx, userId);
    const plus = !!until && until > now && ents.some((e) => !e.revoked_at && new Date(e.starts_at) <= now && new Date(e.ends_at) > now);
    const { period, resets } = await quotaPeriod(tx, now);
    const used = await one<{ n: number }>(
      tx,
      `select count(*)::int as n from public.billing_full_paper_usage where user_id=$1 and period=$2::date`,
      [userId, period],
    );
    const rewarded = await rewardedFullPapers(tx, userId, period);
    return {
      tier: plus ? 'PLUS' : 'FREE',
      plus_until: plus && until ? until.toISOString() : null,
      launch_eligible: await launchEligible(tx, userId, now),
      entitlements: ents.map((e) => ({
        id: e.id,
        source: e.source,
        starts_at: iso(e.starts_at)!,
        ends_at: iso(e.ends_at)!,
        revoked_at: iso(e.revoked_at),
        order_id: e.order_id,
      })),
      quota: {
        full_papers: {
          used: Number(used?.n ?? 0),
          limit: plus || !d.config.billingEnabled ? null : d.config.FREE_FULL_PAPERS_PER_MONTH + rewarded,
          resets_on: resets,
          rewarded,
        },
      },
      payments_enabled: d.config.billingEnabled,
    };
  });
}

/**
 * Called before starting a full paper (PYQ_PAPER session). Plus users and replays of an already counted
 * client_request_id pass. The quota is only enforced while payments are enabled: a paywall with no way to pay is wrong.
 */
export async function assertFullPaperAllowed(d: BillingDeps, userId: string, clientRequestId: string): Promise<void> {
  if (!d.config.billingEnabled) return;
  const now = d.clock();
  await d.db.withService(async (tx) => {
    const until = await plusUntil(tx, userId);
    if (until && until > now) return;
    const seen = await one(tx, `select 1 from public.billing_full_paper_usage where user_id=$1 and client_request_id=$2`, [userId, clientRequestId]);
    if (seen) return;
    const { period, resets } = await quotaPeriod(tx, now);
    const used = Number(
      (await one<{ n: number }>(tx, `select count(*)::int as n from public.billing_full_paper_usage where user_id=$1 and period=$2::date`, [userId, period]))?.n ?? 0,
    );
    const limit = d.config.FREE_FULL_PAPERS_PER_MONTH + (await rewardedFullPapers(tx, userId, period));
    if (used >= limit) {
      throw new ApiError('QUOTA_EXCEEDED', `Free plan includes ${limit} full papers a month`, {
        details: { metric: 'full_papers', used, limit, resets_on: resets },
      });
    }
  });
}

/** Records a started full paper for a free user (idempotent on client_request_id). */
export async function recordFullPaper(d: BillingDeps, userId: string, clientRequestId: string): Promise<void> {
  if (!d.config.billingEnabled) return;
  const now = d.clock();
  await d.db.withService(async (tx) => {
    const until = await plusUntil(tx, userId);
    if (until && until > now) return;
    const { period } = await quotaPeriod(tx, now);
    await tx.query(
      `insert into public.billing_full_paper_usage (user_id, client_request_id, period) values ($1,$2,$3::date) on conflict do nothing`,
      [userId, clientRequestId, period],
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Plans + orders
// ---------------------------------------------------------------------------------------------------------------------

export async function listPlans(d: BillingDeps): Promise<BillingPlans> {
  const plans = await d.db.withService((tx) => rows<PlanRow>(tx, `select ${PLAN_COLS} from public.billing_plans where active order by sort_order, code`));
  return {
    plans: plans.map(planDto),
    free: { full_papers_per_month: d.config.FREE_FULL_PAPERS_PER_MONTH },
    payments_enabled: d.config.billingEnabled,
  };
}

async function priceOrder(
  tx: Tx,
  userId: string,
  plan: PlanRow,
  promoCode: string | undefined,
  now: Date,
): Promise<{ amount: number; promo: string | null }> {
  if (plan.launch_only && !(await launchEligible(tx, userId, now))) {
    throw new ApiError('FORBIDDEN', 'The launch pass is for new accounts making their first purchase', { details: { reason: 'NOT_LAUNCH_ELIGIBLE' } });
  }
  if (!promoCode) return { amount: Number(plan.price_paise), promo: null };
  if (plan.launch_only) throw validation('Promo codes cannot be combined with the launch pass', { reason: 'PROMO_NOT_COMBINABLE' });
  const p = await one<PromoRow>(tx, `select * from public.billing_promo_codes where code=$1 for update`, [promoCode]);
  const bad = (reason: string): ApiError => validation('This promo code cannot be used', { reason });
  if (!p || !p.active) throw bad('PROMO_INVALID');
  if (p.valid_from && new Date(p.valid_from) > now) throw bad('PROMO_NOT_STARTED');
  if (p.valid_to && new Date(p.valid_to) < now) throw bad('PROMO_EXPIRED');
  if (p.plan_codes && !p.plan_codes.includes(plan.code)) throw bad('PROMO_NOT_FOR_PLAN');
  if (p.max_redemptions !== null) {
    // Redemptions are counted at payment time, so also count other people's open checkouts (last 30 minutes) with this
    // code: otherwise N concurrent checkouts could all pass the cap. The promo row is locked (for update) above.
    const open = await one<{ n: number }>(
      tx,
      `select count(*)::int as n from public.billing_orders
        where promo_code=$1 and status='CREATED' and user_id is distinct from $2 and created_at > $3::timestamptz - interval '30 minutes'`,
      [p.code, userId, now.toISOString()],
    );
    if (p.redeemed + Number(open?.n ?? 0) >= p.max_redemptions) throw bad('PROMO_EXHAUSTED');
  }
  if (p.new_users_only && (await hasPaidBefore(tx, userId))) throw bad('PROMO_NEW_USERS_ONLY');
  if (await one(tx, `select 1 from public.billing_promo_redemptions where code=$1 and user_id=$2`, [p.code, userId])) throw bad('PROMO_ALREADY_USED');
  const price = Number(plan.price_paise);
  const discounted = p.percent_off !== null ? Math.floor((price * (100 - p.percent_off)) / 100) : price - Number(p.amount_off_paise);
  return { amount: Math.max(100, discounted), promo: p.code };
}

async function attachRazorpayOrder(d: BillingDeps, order: OrderRow, plan: PlanRow): Promise<CheckoutOrder> {
  if (!d.razorpay) throw paymentsUnavailable();
  let rzpId: string;
  try {
    const rzp = await d.razorpay.createOrder({
      amount: Number(order.amount_paise),
      currency: 'INR',
      receipt: order.receipt,
      notes: { order_id: order.id, plan_code: plan.code, ...(order.user_id ? { user_id: order.user_id } : {}) },
    });
    rzpId = rzp.id;
  } catch (e) {
    d.logger.error('razorpay createOrder failed', { order_id: order.id, error: e instanceof RazorpayError ? e.message : String(e) });
    await d.db.withService((tx) => tx.query(`update public.billing_orders set status='FAILED', failed_at=now() where id=$1 and status='CREATED'`, [order.id]));
    throw paymentsUnavailable();
  }
  await d.db.withService((tx) => tx.query(`update public.billing_orders set razorpay_order_id=$2 where id=$1`, [order.id, rzpId]));
  return checkoutDto({ ...order, razorpay_order_id: rzpId }, plan, d.razorpay.keyId);
}

const checkoutDto = (o: OrderRow, plan: PlanRow, keyId: string): CheckoutOrder => ({
  order_id: o.id,
  razorpay_order_id: o.razorpay_order_id!,
  key_id: keyId,
  amount_paise: Number(o.amount_paise),
  list_price_paise: Number(o.list_price_paise),
  currency: 'INR',
  plan: planDto(plan),
  promo_code: o.promo_code,
});

export async function createOrder(d: BillingDeps, userId: string, body: CreateOrderBody): Promise<{ created: boolean; data: CheckoutOrder }> {
  if (!d.config.billingEnabled || !d.razorpay) throw paymentsUnavailable();
  const now = d.clock();
  const res = await d.db.withService(async (tx) => {
    const plan = await one<PlanRow>(tx, `select ${PLAN_COLS} from public.billing_plans where code=$1 and active`, [body.plan_code]);
    if (!plan) throw notFound('Plan');
    const prior = await one<OrderRow>(tx, `select ${ORDER_COLS} from public.billing_orders where user_id=$1 and client_request_id=$2`, [userId, body.client_request_id]);
    if (prior) {
      if (prior.plan_code !== body.plan_code || (prior.promo_code ?? null) !== (body.promo_code ?? null)) {
        throw new ApiError('IDEMPOTENCY_CONFLICT', 'client_request_id was already used for a different order');
      }
      return { prior, plan };
    }
    const priced = await priceOrder(tx, userId, plan, body.promo_code, now);
    const order = await one<OrderRow>(
      tx,
      `insert into public.billing_orders (user_id, client_request_id, plan_code, amount_paise, list_price_paise, promo_code, receipt)
       values ($1,$2,$3,$4,$5,$6,$7) returning ${ORDER_COLS}`,
      [userId, body.client_request_id, plan.code, priced.amount, plan.price_paise, priced.promo, newReceipt(now)],
    );
    return { order: order!, plan };
  });
  if ('prior' in res && res.prior) {
    const prior = res.prior;
    if (prior.status === 'CREATED' && prior.razorpay_order_id) return { created: false, data: checkoutDto(prior, res.plan, d.razorpay.keyId) };
    if (prior.status === 'CREATED') return { created: false, data: await attachRazorpayOrder(d, prior, res.plan) };
    throw new ApiError('CONFLICT', 'This checkout is closed; start a new one', { details: { status: prior.status } });
  }
  return { created: true, data: await attachRazorpayOrder(d, (res as { order: OrderRow }).order, res.plan) };
}

export async function listMyOrders(d: BillingDeps, userId: string): Promise<Order[]> {
  return d.db.withService(async (tx) => {
    const list = await rows<OrderRow & { plan_name: string }>(
      tx,
      `select o.*, p.name as plan_name from public.billing_orders o join public.billing_plans p on p.code=o.plan_code
        where o.user_id=$1 and (o.status <> 'CREATED' or o.created_at > now() - interval '1 day')
        order by o.created_at desc limit 50`,
      [userId],
    );
    return list.map((o) => orderDto(o, o.plan_name));
  });
}

export async function getMyOrder(d: BillingDeps, userId: string, orderId: string): Promise<Order> {
  return d.db.withService(async (tx) => {
    const o = await one<OrderRow & { plan_name: string }>(
      tx,
      `select o.*, p.name as plan_name from public.billing_orders o join public.billing_plans p on p.code=o.plan_code where o.id=$1 and o.user_id=$2`,
      [orderId, userId],
    );
    if (!o) throw notFound('Order');
    return orderDto(o, o.plan_name);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Parent payment links
// ---------------------------------------------------------------------------------------------------------------------

export async function createPaymentLink(d: BillingDeps, userId: string, planCode: string): Promise<PaymentLink> {
  if (!d.config.billingEnabled) throw paymentsUnavailable();
  const now = d.clock();
  return d.db.withService(async (tx) => {
    const plan = await one<PlanRow>(tx, `select ${PLAN_COLS} from public.billing_plans where code=$1 and active`, [planCode]);
    if (!plan) throw notFound('Plan');
    if (plan.launch_only) throw validation('The launch pass cannot be paid through a link', { reason: 'LAUNCH_NOT_LINKABLE' });
    const open = await one<{ n: number }>(
      tx,
      `select count(*)::int as n from public.billing_payment_links where user_id=$1 and expires_at > $2 and paid_order_id is null`,
      [userId, now.toISOString()],
    );
    if (Number(open?.n ?? 0) >= 5) throw new ApiError('RATE_LIMITED', 'Too many open payment links; wait for one to expire');
    const token = randomHex(24);
    const expires = new Date(now.getTime() + PAYMENT_LINK_TTL_DAYS * DAY_MS);
    await tx.query(`insert into public.billing_payment_links (token, user_id, plan_code, expires_at) values ($1,$2,$3,$4)`, [
      token,
      userId,
      plan.code,
      expires.toISOString(),
    ]);
    const base = d.config.WEB_BASE_URL?.replace(/\/+$/, '');
    return { token, url: base ? `${base}/pay/${token}/` : null, plan: planDto(plan), expires_at: expires.toISOString() };
  });
}

interface LinkRow {
  id: string;
  user_id: string;
  plan_code: string;
  expires_at: string;
  paid_order_id: string | null;
}

export async function getPublicPaymentLink(d: BillingDeps, token: string): Promise<PublicPaymentLink> {
  const now = d.clock();
  return d.db.withService(async (tx) => {
    const l = await one<LinkRow & { display_name: string | null }>(
      tx,
      `select l.id, l.user_id, l.plan_code, l.expires_at, l.paid_order_id, pr.display_name
         from public.billing_payment_links l left join public.profiles pr on pr.id=l.user_id where l.token=$1`,
      [token],
    );
    if (!l) throw notFound('Payment link');
    const plan = await one<PlanRow>(tx, `select ${PLAN_COLS} from public.billing_plans where code=$1`, [l.plan_code]);
    const status = l.paid_order_id ? 'PAID' : new Date(l.expires_at) <= now ? 'EXPIRED' : 'OPEN';
    const first = l.display_name?.trim().split(/\s+/)[0] ?? null;
    return { plan: planDto(plan!), student_first_name: first || null, expires_at: iso(l.expires_at)!, status, payments_enabled: d.config.billingEnabled };
  });
}

export async function createOrderForLink(d: BillingDeps, token: string): Promise<CheckoutOrder> {
  if (!d.config.billingEnabled || !d.razorpay) throw paymentsUnavailable();
  const now = d.clock();
  const { order, plan } = await d.db.withService(async (tx) => {
    const l = await one<LinkRow>(tx, `select id, user_id, plan_code, expires_at, paid_order_id from public.billing_payment_links where token=$1 for update`, [token]);
    if (!l) throw notFound('Payment link');
    if (l.paid_order_id) throw new ApiError('CONFLICT', 'This link has already been paid', { details: { reason: 'LINK_PAID' } });
    if (new Date(l.expires_at) <= now) throw new ApiError('CONFLICT', 'This link has expired', { details: { reason: 'LINK_EXPIRED' } });
    const plan = await one<PlanRow>(tx, `select ${PLAN_COLS} from public.billing_plans where code=$1 and active`, [l.plan_code]);
    if (!plan) throw notFound('Plan');
    // Reuse a recent unpaid checkout for this link instead of piling up orders.
    const reuse = await one<OrderRow>(
      tx,
      `select ${ORDER_COLS} from public.billing_orders where payment_link_id=$1 and status='CREATED' and razorpay_order_id is not null
        and created_at > now() - interval '30 minutes' order by created_at desc limit 1`,
      [l.id],
    );
    if (reuse) return { order: reuse, plan };
    const order = await one<OrderRow>(
      tx,
      `insert into public.billing_orders (user_id, plan_code, amount_paise, list_price_paise, payer, payment_link_id, receipt)
       values ($1,$2,$3,$3,'PAYMENT_LINK',$4,$5) returning ${ORDER_COLS}`,
      [l.user_id, plan.code, plan.price_paise, l.id, newReceipt(now)],
    );
    return { order: order!, plan };
  });
  if (order.razorpay_order_id) return checkoutDto(order, plan, d.razorpay.keyId);
  return attachRazorpayOrder(d, order, plan);
}

// ---------------------------------------------------------------------------------------------------------------------
// Entitlements (grant / revoke), shared by the webhook and admin
// ---------------------------------------------------------------------------------------------------------------------

async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.query(`select pg_advisory_xact_lock(hashtext('billing:' || $1::text))`, [userId]);
}

async function grant(
  tx: Tx,
  userId: string,
  days: number,
  source: EntRow['source'],
  now: Date,
  extra: { orderId?: string; note?: string; createdBy?: string } = {},
): Promise<EntRow> {
  await lockUser(tx, userId);
  const until = await plusUntil(tx, userId);
  const start = until && until > now ? until : now;
  const end = new Date(start.getTime() + days * DAY_MS);
  return (await one<EntRow>(
    tx,
    `insert into public.billing_entitlements (user_id, source, order_id, starts_at, ends_at, note, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning id, user_id, source, order_id, starts_at, ends_at, revoked_at`,
    [userId, source, extra.orderId ?? null, start.toISOString(), end.toISOString(), extra.note ?? null, extra.createdBy ?? null],
  ))!;
}

/** Revoke one pass; passes stacked after it move earlier by its unused time so no paid time is lost or gained. */
async function revoke(tx: Tx, entitlementId: string, now: Date, note: string): Promise<EntRow | null> {
  const e = await one<EntRow>(tx, `select id, user_id, source, order_id, starts_at, ends_at, revoked_at from public.billing_entitlements where id=$1`, [entitlementId]);
  if (!e || e.revoked_at) return e;
  await lockUser(tx, e.user_id);
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  const unusedMs = Math.max(0, end.getTime() - Math.max(start.getTime(), now.getTime()));
  await tx.query(
    `update public.billing_entitlements set revoked_at=$2, note=coalesce(note || ' | ', '') || $3 where id=$1`,
    [e.id, now.toISOString(), note],
  );
  if (unusedMs > 0) {
    await tx.query(
      `update public.billing_entitlements
          set starts_at = starts_at - make_interval(secs => $3::double precision / 1000),
              ends_at   = ends_at   - make_interval(secs => $3::double precision / 1000)
        where user_id=$1 and revoked_at is null and id <> $2 and starts_at >= $4`,
      [e.user_id, e.id, unusedMs, end.toISOString()],
    );
  }
  return { ...e, revoked_at: now.toISOString() };
}

// ---------------------------------------------------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------------------------------------------------

interface RzpPayment {
  id: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
}
interface RzpEvent {
  event: string;
  payload?: {
    payment?: { entity?: RzpPayment };
    order?: { entity?: { id: string; amount?: number; currency?: string } };
    refund?: { entity?: { id: string; payment_id: string; amount?: number } };
  };
}

export type WebhookOutcome =
  | 'duplicate'
  | 'granted'
  | 'already_paid'
  | 'unknown_order'
  | 'amount_mismatch'
  | 'failed_marked'
  | 'refunded'
  | 'partial_refund'
  | 'refund_unknown_payment'
  | 'ignored';

async function markPaid(
  tx: Tx,
  rzpOrderId: string,
  payment: RzpPayment,
  now: Date,
  log: Logger,
): Promise<WebhookOutcome> {
  const o = await one<OrderRow>(tx, `select ${ORDER_COLS} from public.billing_orders where razorpay_order_id=$1 for update`, [rzpOrderId]);
  if (!o) return 'unknown_order';
  if (o.status === 'PAID' || o.status === 'REFUNDED') return 'already_paid';
  // A paid event must state the amount and currency; a missing value is treated as a mismatch, never as a pass.
  if (payment.amount === undefined || payment.amount === null || Number(payment.amount) !== Number(o.amount_paise) || (payment.currency ?? 'INR') !== 'INR') {
    log.error('billing webhook amount mismatch', { order_id: o.id, expected: o.amount_paise, got: payment.amount, currency: payment.currency });
    return 'amount_mismatch';
  }
  if (!o.user_id) return 'unknown_order';
  const plan = (await one<PlanRow>(tx, `select ${PLAN_COLS} from public.billing_plans where code=$1`, [o.plan_code]))!;
  await tx.query(
    `update public.billing_orders set status='PAID', paid_at=$2, razorpay_payment_id=coalesce(razorpay_payment_id, $3), failed_at=null where id=$1`,
    [o.id, now.toISOString(), payment.id],
  );
  await grant(tx, o.user_id, Number(plan.duration_days), o.promo_code ? 'PROMO' : 'PURCHASE', now, { orderId: o.id });
  if (o.promo_code) {
    await tx.query(
      `insert into public.billing_promo_redemptions (code, user_id, order_id) values ($1,$2,$3) on conflict do nothing`,
      [o.promo_code, o.user_id, o.id],
    );
    await tx.query(`update public.billing_promo_codes set redeemed = redeemed + 1 where code=$1`, [o.promo_code]);
  }
  if (o.payment_link_id) {
    await tx.query(`update public.billing_payment_links set paid_order_id=$2 where id=$1 and paid_order_id is null`, [o.payment_link_id, o.id]);
  }
  await audit(tx, null, 'SYSTEM', 'billing.order_paid', 'billing_order', o.id, { plan: o.plan_code, amount_paise: o.amount_paise });
  return 'granted';
}

export async function handleWebhook(
  d: BillingDeps,
  raw: Uint8Array,
  signature: string | undefined,
  eventIdHeader: string | undefined,
): Promise<{ outcome: WebhookOutcome }> {
  const secret = d.config.RAZORPAY_WEBHOOK_SECRET;
  if (!d.config.billingEnabled || !secret) throw paymentsUnavailable();
  if (!(await verifyWebhookSignature(raw, signature, secret))) {
    throw new ApiError('UNAUTHENTICATED', 'Invalid webhook signature');
  }
  let ev: RzpEvent;
  try {
    ev = JSON.parse(new TextDecoder().decode(raw)) as RzpEvent;
  } catch {
    throw validation('Webhook body is not JSON');
  }
  const eventId = eventIdHeader && /^[A-Za-z0-9_.-]{6,80}$/.test(eventIdHeader) ? eventIdHeader : `sha256:${await sha256Hex(raw)}`;
  const now = d.clock();
  const payment = ev.payload?.payment?.entity;
  const rzpOrderId = ev.payload?.order?.entity?.id ?? payment?.order_id ?? null;

  return d.db.withService(async (tx) => {
    const inserted = await one<{ id: string }>(
      tx,
      `insert into public.billing_events (id, type, razorpay_order_id, razorpay_payment_id, payload) values ($1,$2,$3,$4,$5::jsonb)
       on conflict (id) do nothing returning id`,
      [eventId, ev.event ?? 'unknown', rzpOrderId, payment?.id ?? ev.payload?.refund?.entity?.payment_id ?? null, JSON.stringify(ev)],
    );
    if (!inserted) return { outcome: 'duplicate' as const };

    let outcome: WebhookOutcome = 'ignored';
    switch (ev.event) {
      case 'order.paid':
      case 'payment.captured': {
        if (rzpOrderId && payment?.id) {
          const pay = ev.event === 'order.paid' ? { ...payment, amount: payment.amount ?? ev.payload?.order?.entity?.amount } : payment;
          outcome = await markPaid(tx, rzpOrderId, pay, now, d.logger);
        } else outcome = 'unknown_order';
        break;
      }
      case 'payment.failed': {
        if (rzpOrderId) {
          const r = await tx.query(`update public.billing_orders set status='FAILED', failed_at=$2 where razorpay_order_id=$1 and status='CREATED'`, [rzpOrderId, now.toISOString()]);
          outcome = r.rowCount > 0 ? 'failed_marked' : 'ignored';
        }
        break;
      }
      case 'refund.processed': {
        const paymentId = ev.payload?.refund?.entity?.payment_id;
        const o = paymentId
          ? await one<OrderRow>(tx, `select ${ORDER_COLS} from public.billing_orders where razorpay_payment_id=$1 for update`, [paymentId])
          : null;
        if (!o) {
          outcome = 'refund_unknown_payment';
          break;
        }
        const refund = ev.payload?.refund?.entity;
        // The same refund can arrive under a different event id (Razorpay retries); count each refund id once.
        const seen = refund?.id
          ? await one(
              tx,
              `select 1 from public.billing_events where id <> $1 and type='refund.processed' and payload #>> '{payload,refund,entity,id}' = $2 limit 1`,
              [eventId, refund.id],
            )
          : null;
        if (seen) {
          outcome = 'duplicate';
          break;
        }
        if (o.status === 'PAID') {
          // A missing amount is treated as a full refund (the previous behaviour, and the safe side for the student).
          const amount = refund?.amount != null ? Number(refund.amount) : Number(o.amount_paise);
          const r = await one<{ refunded_paise: number }>(
            tx,
            `update public.billing_orders set refunded_paise = refunded_paise + $2 where id=$1 returning refunded_paise`,
            [o.id, amount],
          );
          if (Number(r!.refunded_paise) >= Number(o.amount_paise)) {
            await tx.query(`update public.billing_orders set status='REFUNDED', refunded_at=$2 where id=$1`, [o.id, now.toISOString()]);
            const ent = await one<{ id: string }>(tx, `select id from public.billing_entitlements where order_id=$1`, [o.id]);
            if (ent) await revoke(tx, ent.id, now, 'refund');
            await audit(tx, null, 'SYSTEM', 'billing.order_refunded', 'billing_order', o.id, { refund_id: refund?.id });
            outcome = 'refunded';
          } else {
            // Partial refund (goodwill / pro-rata): money goes back, access stays. Recorded for accounting.
            await audit(tx, null, 'SYSTEM', 'billing.order_partially_refunded', 'billing_order', o.id, {
              refund_id: refund?.id,
              amount_paise: amount,
              refunded_paise: Number(r!.refunded_paise),
            });
            outcome = 'partial_refund';
          }
        } else outcome = 'refunded';
        break;
      }
      default:
        outcome = 'ignored';
    }
    await tx.query(`update public.billing_events set processed_at=$2, outcome=$3 where id=$1`, [eventId, now.toISOString(), outcome]);
    return { outcome };
  });
}

/**
 * Checkout handler path (Razorpay Standard Checkout). The browser posts the three values Razorpay gave it; access is
 * granted only when (1) the signature is a valid HMAC of `order_id|payment_id` with our key secret, (2) the order is this
 * user's, and (3) Razorpay's own payment record says captured, for this order, for the exact amount. If the payment is
 * only authorized (or Razorpay can't be reached) nothing is granted here and the webhook finishes the job.
 * Shares markPaid with the webhook: the order row is locked and re-checked, so the two paths can't double grant.
 */
export async function verifyCheckout(
  d: BillingDeps,
  userId: string,
  orderId: string,
  body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
): Promise<Order> {
  if (!d.config.billingEnabled || !d.razorpay || !d.config.RAZORPAY_KEY_SECRET) throw paymentsUnavailable();
  const o = await d.db.withService((tx) =>
    one<OrderRow & { plan_name: string }>(
      tx,
      `select o.*, p.name as plan_name from public.billing_orders o join public.billing_plans p on p.code=o.plan_code where o.id=$1 and o.user_id=$2`,
      [orderId, userId],
    ),
  );
  if (!o) throw notFound('Order');
  if (o.razorpay_order_id !== body.razorpay_order_id) throw validation('Payment does not belong to this order', { reason: 'ORDER_MISMATCH' });
  if (!(await verifyCheckoutSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, d.config.RAZORPAY_KEY_SECRET))) {
    d.logger.warn('billing checkout signature invalid', { order_id: o.id });
    throw validation('Payment signature is invalid', { reason: 'INVALID_SIGNATURE' });
  }
  if (o.status !== 'CREATED' && o.status !== 'FAILED') return orderDto(o, o.plan_name);

  let payment: { id: string; order_id: string | null; amount: number; currency: string; status: string };
  try {
    payment = await d.razorpay.fetchPayment(body.razorpay_payment_id);
  } catch (e) {
    d.logger.warn('razorpay fetchPayment failed; leaving it to the webhook', { order_id: o.id, error: e instanceof Error ? e.message : String(e) });
    return orderDto(o, o.plan_name);
  }
  if (payment.order_id !== body.razorpay_order_id) throw validation('Payment does not belong to this order', { reason: 'ORDER_MISMATCH' });
  if (payment.status !== 'captured') return orderDto(o, o.plan_name);

  const now = d.clock();
  return d.db.withService(async (tx) => {
    const eventId = `checkout:${payment.id}`;
    const inserted = await one<{ id: string }>(
      tx,
      `insert into public.billing_events (id, type, razorpay_order_id, razorpay_payment_id, payload) values ($1,'checkout.verified',$2,$3,$4::jsonb)
       on conflict (id) do nothing returning id`,
      [eventId, body.razorpay_order_id, payment.id, JSON.stringify({ payment: { id: payment.id, amount: payment.amount, currency: payment.currency, status: payment.status } })],
    );
    const outcome = await markPaid(tx, body.razorpay_order_id, { id: payment.id, amount: payment.amount, currency: payment.currency }, now, d.logger);
    if (inserted) await tx.query(`update public.billing_events set processed_at=$2, outcome=$3 where id=$1`, [eventId, now.toISOString(), outcome]);
    const after = (await one<OrderRow & { plan_name: string }>(
      tx,
      `select o.*, p.name as plan_name from public.billing_orders o join public.billing_plans p on p.code=o.plan_code where o.id=$1`,
      [o.id],
    ))!;
    return orderDto(after, after.plan_name);
  });
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data)));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function audit(
  tx: Tx,
  actorId: string | null,
  actorType: 'ADMIN' | 'SYSTEM',
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>,
  requestId: string | null = null,
): Promise<void> {
  await tx.query(
    `insert into public.audit_log (actor_id, actor_type, action, entity_type, entity_id, request_id, details) values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [actorId, actorType, action, entityType, entityId, requestId, JSON.stringify(details)],
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------------------------------------

export interface AdminActor {
  id: string;
  requestId: string | null;
}

export async function adminListOrders(
  d: BillingDeps,
  q: { status?: OrderRow['status']; user_id?: string; limit: number },
): Promise<AdminOrder[]> {
  return d.db.withService(async (tx) => {
    const list = await rows<OrderRow & { plan_name: string }>(
      tx,
      `select o.*, p.name as plan_name from public.billing_orders o join public.billing_plans p on p.code=o.plan_code
        where ($1::billing_order_status is null or o.status=$1) and ($2::uuid is null or o.user_id=$2)
        order by o.created_at desc limit $3`,
      [q.status ?? null, q.user_id ?? null, q.limit],
    );
    return list.map((o) => ({
      ...orderDto(o, o.plan_name),
      user_id: o.user_id,
      razorpay_order_id: o.razorpay_order_id,
      razorpay_payment_id: o.razorpay_payment_id,
      refund_requested_at: iso(o.refund_requested_at),
    }));
  });
}

/** Asks Razorpay to refund in full. Access is revoked when the `refund.processed` webhook arrives. */
export async function adminRefundOrder(d: BillingDeps, actor: AdminActor, orderId: string, note: string): Promise<{ refund_id: string }> {
  if (!d.config.billingEnabled || !d.razorpay) throw paymentsUnavailable();
  const o = await d.db.withService((tx) => one<OrderRow>(tx, `select ${ORDER_COLS} from public.billing_orders where id=$1`, [orderId]));
  if (!o) throw notFound('Order');
  if (o.status !== 'PAID' || !o.razorpay_payment_id) throw new ApiError('INVALID_STATE_TRANSITION', 'Only paid orders can be refunded', { details: { from: o.status } });
  let refundId: string;
  try {
    refundId = (await d.razorpay.refundPayment(o.razorpay_payment_id, { notes: { order_id: o.id, reason: note.slice(0, 200) } })).id;
  } catch (e) {
    d.logger.error('razorpay refund failed', { order_id: o.id, error: e instanceof Error ? e.message : String(e) });
    throw new ApiError('SERVICE_UNAVAILABLE', 'Refund request failed at the payment provider');
  }
  await d.db.withService(async (tx) => {
    await tx.query(`update public.billing_orders set refund_requested_at=$2 where id=$1`, [o.id, d.clock().toISOString()]);
    await audit(tx, actor.id, 'ADMIN', 'billing.refund_requested', 'billing_order', o.id, { note, refund_id: refundId }, actor.requestId);
  });
  return { refund_id: refundId };
}

export async function adminGrant(d: BillingDeps, actor: AdminActor, userId: string, days: number, note: string) {
  return d.db.withService(async (tx) => {
    if (!(await one(tx, `select 1 from auth.users where id=$1`, [userId]))) throw notFound('User');
    const e = await grant(tx, userId, days, 'SUPPORT_GRANT', d.clock(), { note, createdBy: actor.id });
    await audit(tx, actor.id, 'ADMIN', 'billing.entitlement_granted', 'billing_entitlement', e.id, { user_id: userId, days, note }, actor.requestId);
    return { id: e.id, source: e.source, starts_at: iso(e.starts_at)!, ends_at: iso(e.ends_at)!, revoked_at: null, order_id: null };
  });
}

export async function adminRevoke(d: BillingDeps, actor: AdminActor, entitlementId: string, note: string) {
  return d.db.withService(async (tx) => {
    const e = await revoke(tx, entitlementId, d.clock(), note);
    if (!e) throw notFound('Entitlement');
    await audit(tx, actor.id, 'ADMIN', 'billing.entitlement_revoked', 'billing_entitlement', e.id, { user_id: e.user_id, note }, actor.requestId);
    return { id: e.id, source: e.source, starts_at: iso(e.starts_at)!, ends_at: iso(e.ends_at)!, revoked_at: iso(e.revoked_at), order_id: e.order_id };
  });
}

const promoDto = (p: PromoRow) => ({
  code: p.code,
  percent_off: p.percent_off,
  amount_off_paise: p.amount_off_paise,
  plan_codes: p.plan_codes,
  max_redemptions: p.max_redemptions,
  redeemed: Number(p.redeemed),
  new_users_only: p.new_users_only,
  valid_from: iso(p.valid_from),
  valid_to: iso(p.valid_to),
  active: p.active,
  note: p.note,
});

export async function adminListPromos(d: BillingDeps) {
  return d.db.withService(async (tx) => (await rows<PromoRow>(tx, `select * from public.billing_promo_codes order by created_at desc limit 200`)).map(promoDto));
}

export async function adminCreatePromo(
  d: BillingDeps,
  actor: AdminActor,
  b: {
    code: string;
    percent_off?: number | undefined;
    amount_off_paise?: number | undefined;
    plan_codes?: string[] | undefined;
    max_redemptions?: number | undefined;
    new_users_only: boolean;
    valid_from?: string | undefined;
    valid_to?: string | undefined;
    note?: string | undefined;
  },
) {
  return d.db.withService(async (tx) => {
    if (b.plan_codes) {
      const known = await rows<{ code: string }>(tx, `select code from public.billing_plans where code = any($1::text[])`, [b.plan_codes]);
      if (known.length !== new Set(b.plan_codes).size) throw validation('Unknown plan code in plan_codes');
    }
    if (await one(tx, `select 1 from public.billing_promo_codes where code=$1`, [b.code])) throw new ApiError('CONFLICT', 'Promo code already exists');
    const p = await one<PromoRow>(
      tx,
      `insert into public.billing_promo_codes (code, percent_off, amount_off_paise, plan_codes, max_redemptions, new_users_only, valid_from, valid_to, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [b.code, b.percent_off ?? null, b.amount_off_paise ?? null, b.plan_codes ?? null, b.max_redemptions ?? null, b.new_users_only, b.valid_from ?? null, b.valid_to ?? null, b.note ?? null, actor.id],
    );
    await audit(tx, actor.id, 'ADMIN', 'billing.promo_created', 'billing_promo_code', null, { code: b.code }, actor.requestId);
    return promoDto(p!);
  });
}

export async function adminSetPromoActive(d: BillingDeps, actor: AdminActor, code: string, active: boolean) {
  return d.db.withService(async (tx) => {
    const p = await one<PromoRow>(tx, `update public.billing_promo_codes set active=$2 where code=$1 returning *`, [code, active]);
    if (!p) throw notFound('Promo code');
    await audit(tx, actor.id, 'ADMIN', active ? 'billing.promo_enabled' : 'billing.promo_disabled', 'billing_promo_code', null, { code }, actor.requestId);
    return promoDto(p);
  });
}

import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AdminOrderSchema,
  AdminOrdersQuery,
  BillingMeSchema,
  BillingPlansSchema,
  CheckoutOrderSchema,
  CreateOrderBody,
  CreatePaymentLinkBody,
  CreatePromoCodeBody,
  EntitlementSchema,
  GrantEntitlementBody,
  IdParam,
  OrderSchema,
  PatchPromoCodeBody,
  PaymentLinkSchema,
  PaymentLinkTokenParam,
  PromoCodeAdminSchema,
  PromoCodeParam,
  PublicPaymentLinkSchema,
  RefundOrderBody,
  RevokeEntitlementBody,
} from '@projectx/contracts';
import type { AppDeps } from '../deps';
import { ApiError } from '../lib/errors';
import { deps, requireUser, send, valid, type AppEnv, type Ctx } from '../lib/http';
import { defineRoute, type Guards } from '../routes/define';
import { createRazorpayClient, type RazorpayClient } from './razorpay';
import * as billing from './service';

type App = OpenAPIHono<AppEnv>;
const WEBHOOK_MAX_BYTES = 256 * 1024;

const clients = new WeakMap<AppDeps, RazorpayClient | null>();
/** One Razorpay client per app instance (tests inject `deps.razorpay`). */
export function billingDeps(c: Ctx): billing.BillingDeps {
  const d = deps(c);
  let rzp = d.razorpay ?? clients.get(d);
  if (rzp === undefined) {
    const cfg = d.config;
    rzp = cfg.billingEnabled ? createRazorpayClient({ keyId: cfg.RAZORPAY_KEY_ID!, keySecret: cfg.RAZORPAY_KEY_SECRET! }) : null;
    clients.set(d, rzp);
  }
  return { db: d.db, config: d.config, clock: d.clock, logger: d.logger, razorpay: rzp };
}

const actor = (c: Ctx): billing.AdminActor => ({ id: requireUser(c).id, requestId: c.get('requestId') ?? null });

export function registerBilling(app: App, g: Guards): void {
  // ---- public
  const plans = defineRoute({
    method: 'get', path: '/billing/plans', summary: 'Tabby Plus plans and prices (server is the source of truth)', tags: ['billing'],
    access: 'public', cache: 'TAXONOMY', rl: 'RL_PUBLIC', data: BillingPlansSchema,
  })(g);
  app.openapi(plans, async (c: Ctx) => send(c, 200, await billing.listPlans(billingDeps(c)), { cache: 'TAXONOMY', tags: ['billing:plans'] }));

  const linkView = defineRoute({
    method: 'get', path: '/billing/payment-links/{token}', summary: 'Parent payment link (public view)', tags: ['billing'],
    access: 'public', cache: 'NONE', rl: 'RL_PUBLIC', request: { params: PaymentLinkTokenParam }, data: PublicPaymentLinkSchema,
  })(g);
  app.openapi(linkView, async (c: Ctx) => {
    const p = valid(c, 'param', PaymentLinkTokenParam);
    return send(c, 200, await billing.getPublicPaymentLink(billingDeps(c), p.token), { cache: 'NONE' });
  });

  const linkOrder = defineRoute({
    method: 'post', path: '/billing/payment-links/{token}/order', summary: 'Start checkout for a parent payment link', tags: ['billing'],
    access: 'public', cache: 'PRIVATE', rl: 'RL_WRITE', request: { params: PaymentLinkTokenParam }, status: 201, data: CheckoutOrderSchema,
  })(g);
  app.openapi(linkOrder, async (c: Ctx) => {
    const p = valid(c, 'param', PaymentLinkTokenParam);
    return send(c, 201, await billing.createOrderForLink(billingDeps(c), p.token));
  });

  // Webhook: plain route so the raw bytes are read before any JSON parsing (signature covers the exact body).
  app.post('/billing/webhooks/razorpay', async (c) => {
    // Refuse an oversized body from its declared length before reading it into memory; re-check after reading.
    const declared = Number(c.req.header('Content-Length') ?? '0');
    if (declared > WEBHOOK_MAX_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Webhook body too large');
    const raw = new Uint8Array(await c.req.raw.arrayBuffer());
    if (raw.byteLength > WEBHOOK_MAX_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Webhook body too large');
    const r = await billing.handleWebhook(billingDeps(c as Ctx), raw, c.req.header('X-Razorpay-Signature'), c.req.header('X-Razorpay-Event-Id'));
    return send(c as Ctx, 200, r);
  });

  // ---- student
  const me = defineRoute({
    method: 'get', path: '/billing/me', summary: 'My plan, access end, and free-plan quota', tags: ['billing'],
    access: 'user', cache: 'PRIVATE', data: BillingMeSchema,
  })(g);
  app.openapi(me, async (c: Ctx) => send(c, 200, await billing.getMe(billingDeps(c), requireUser(c).id)));

  const createOrder = defineRoute({
    method: 'post', path: '/billing/orders', summary: 'Create a checkout order (server prices it)', tags: ['billing'],
    description: 'Idempotent on client_request_id. Access is granted only by the Razorpay webhook; poll GET /billing/orders/{id}.',
    access: 'user', cache: 'PRIVATE', rl: 'RL_WRITE',
    request: { body: { content: { 'application/json': { schema: CreateOrderBody } }, required: true } },
    status: 201, replay200: true, data: CheckoutOrderSchema,
  })(g);
  app.openapi(createOrder, async (c: Ctx) => {
    const r = await billing.createOrder(billingDeps(c), requireUser(c).id, valid(c, 'json', CreateOrderBody));
    return send(c, r.created ? 201 : 200, r.data, r.created ? {} : { meta: { replayed: true } });
  });

  const myOrders = defineRoute({
    method: 'get', path: '/billing/orders', summary: 'My payment history', tags: ['billing'], access: 'user', cache: 'PRIVATE',
    data: z.array(OrderSchema),
  })(g);
  app.openapi(myOrders, async (c: Ctx) => send(c, 200, await billing.listMyOrders(billingDeps(c), requireUser(c).id)));

  const myOrder = defineRoute({
    method: 'get', path: '/billing/orders/{id}', summary: 'One of my orders (poll after checkout)', tags: ['billing'], access: 'user', cache: 'PRIVATE',
    request: { params: IdParam }, data: OrderSchema,
  })(g);
  app.openapi(myOrder, async (c: Ctx) => send(c, 200, await billing.getMyOrder(billingDeps(c), requireUser(c).id, valid(c, 'param', IdParam).id)));

  const createLink = defineRoute({
    method: 'post', path: '/billing/payment-links', summary: 'Create an "ask a parent to pay" link (7 days)', tags: ['billing'],
    access: 'user', cache: 'PRIVATE', rl: 'RL_WRITE',
    request: { body: { content: { 'application/json': { schema: CreatePaymentLinkBody } }, required: true } },
    status: 201, data: PaymentLinkSchema,
  })(g);
  app.openapi(createLink, async (c: Ctx) =>
    send(c, 201, await billing.createPaymentLink(billingDeps(c), requireUser(c).id, valid(c, 'json', CreatePaymentLinkBody).plan_code)),
  );

  // ---- admin (all mutations write audit_log)
  const aOrders = defineRoute({
    method: 'get', path: '/admin/billing/orders', summary: 'List orders', tags: ['admin', 'billing'], access: 'admin', cache: 'PRIVATE', rl: 'RL_ADMIN',
    request: { query: AdminOrdersQuery }, data: z.array(AdminOrderSchema),
  })(g);
  app.openapi(aOrders, async (c: Ctx) => send(c, 200, await billing.adminListOrders(billingDeps(c), valid(c, 'query', AdminOrdersQuery))));

  const aRefund = defineRoute({
    method: 'post', path: '/admin/billing/orders/{id}/refund', summary: 'Request a full refund (access is revoked by the refund webhook)',
    tags: ['admin', 'billing'], access: 'admin', cache: 'PRIVATE', rl: 'RL_ADMIN',
    request: { params: IdParam, body: { content: { 'application/json': { schema: RefundOrderBody } }, required: true } },
    status: 202, data: z.object({ refund_id: z.string() }),
  })(g);
  app.openapi(aRefund, async (c: Ctx) =>
    send(c, 202, await billing.adminRefundOrder(billingDeps(c), actor(c), valid(c, 'param', IdParam).id, valid(c, 'json', RefundOrderBody).note)),
  );

  const aGrant = defineRoute({
    method: 'post', path: '/admin/billing/entitlements', summary: 'Grant Plus days (support)', tags: ['admin', 'billing'], access: 'admin',
    cache: 'PRIVATE', rl: 'RL_ADMIN', request: { body: { content: { 'application/json': { schema: GrantEntitlementBody } }, required: true } },
    status: 201, data: EntitlementSchema,
  })(g);
  app.openapi(aGrant, async (c: Ctx) => {
    const b = valid(c, 'json', GrantEntitlementBody);
    return send(c, 201, await billing.adminGrant(billingDeps(c), actor(c), b.user_id, b.days, b.note));
  });

  const aRevoke = defineRoute({
    method: 'post', path: '/admin/billing/entitlements/{id}/revoke', summary: 'Revoke an entitlement', tags: ['admin', 'billing'], access: 'admin',
    cache: 'PRIVATE', rl: 'RL_ADMIN',
    request: { params: IdParam, body: { content: { 'application/json': { schema: RevokeEntitlementBody } }, required: true } },
    data: EntitlementSchema,
  })(g);
  app.openapi(aRevoke, async (c: Ctx) =>
    send(c, 200, await billing.adminRevoke(billingDeps(c), actor(c), valid(c, 'param', IdParam).id, valid(c, 'json', RevokeEntitlementBody).note)),
  );

  const aPromos = defineRoute({
    method: 'get', path: '/admin/billing/promo-codes', summary: 'List promo codes', tags: ['admin', 'billing'], access: 'admin',
    cache: 'PRIVATE', rl: 'RL_ADMIN', data: z.array(PromoCodeAdminSchema),
  })(g);
  app.openapi(aPromos, async (c: Ctx) => send(c, 200, await billing.adminListPromos(billingDeps(c))));

  const aCreatePromo = defineRoute({
    method: 'post', path: '/admin/billing/promo-codes', summary: 'Create a promo code', tags: ['admin', 'billing'], access: 'admin',
    cache: 'PRIVATE', rl: 'RL_ADMIN', request: { body: { content: { 'application/json': { schema: CreatePromoCodeBody } }, required: true } },
    status: 201, data: PromoCodeAdminSchema,
  })(g);
  app.openapi(aCreatePromo, async (c: Ctx) => send(c, 201, await billing.adminCreatePromo(billingDeps(c), actor(c), valid(c, 'json', CreatePromoCodeBody))));

  const aPatchPromo = defineRoute({
    method: 'patch', path: '/admin/billing/promo-codes/{code}', summary: 'Enable or disable a promo code', tags: ['admin', 'billing'],
    access: 'admin', cache: 'PRIVATE', rl: 'RL_ADMIN',
    request: { params: PromoCodeParam, body: { content: { 'application/json': { schema: PatchPromoCodeBody } }, required: true } },
    data: PromoCodeAdminSchema,
  })(g);
  app.openapi(aPatchPromo, async (c: Ctx) =>
    send(c, 200, await billing.adminSetPromoActive(billingDeps(c), actor(c), valid(c, 'param', PromoCodeParam).code, valid(c, 'json', PatchPromoCodeBody).active)),
  );
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, createTestUser, type TestDb } from '@projectx/db/testing';
import { createSqlStore } from '../src/repositories/sql/store';
import { parseConfig } from '../src/config';
import { hmacSha256Hex, type RazorpayClient } from '../src/billing/razorpay';
import { assertFullPaperAllowed, recordFullPaper, type BillingDeps } from '../src/billing/service';
import { silentLogger } from '../src/deps';
import { makeHarness, SECRET, token, type Harness } from './helpers';

type J = { data?: any; meta?: any; error?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<J> => (await r.json()) as J;
const uuid = () => crypto.randomUUID();
const DAY = 86_400_000;
const WH_SECRET = 'whsec_test_secret_value';

const baseEnv = {
  APP_ENV: 'test',
  AUTH_MODE: 'test',
  TEST_JWT_SECRET: SECRET,
  SIGNING_SECRET: 'sign-secret-sign-secret-sign-secret-1234',
  IP_HASH_SECRET: 'ip-secret-ip-secret-ip-secret-ip-secret-1234',
  PUBLIC_ASSETS_BASE_URL: 'https://assets.test',
  FILES_BASE_URL: 'https://api.test/api/v1/files',
  ENABLE_API_DOCS: 'true',
  CORS_ALLOWED_ORIGINS: 'https://app.test',
};
const rzpEnv = {
  RAZORPAY_KEY_ID: 'rzp_test_x',
  RAZORPAY_KEY_SECRET: 'rzp_secret_value',
  RAZORPAY_WEBHOOK_SECRET: WH_SECRET,
  WEB_BASE_URL: 'https://app.test',
};

class FakeRazorpay implements RazorpayClient {
  readonly keyId = 'rzp_test_x';
  orders: Array<{ amount: number; receipt: string; notes: Record<string, string> }> = [];
  refunds: Array<{ paymentId: string; notes: Record<string, string> }> = [];
  private n = 0;
  async createOrder(input: { amount: number; currency: 'INR'; receipt: string; notes: Record<string, string> }) {
    this.orders.push(input);
    this.n += 1;
    return { id: `order_${this.n}_${Math.random().toString(36).slice(2, 8)}`, amount: input.amount, currency: 'INR', receipt: input.receipt, status: 'created' };
  }
  async fetchPayment(_paymentId: string): Promise<never> {
    throw new Error('not used in this suite (see monetization.sql.test.ts)');
  }
  async refundPayment(paymentId: string, input: { notes: Record<string, string> }) {
    this.refunds.push({ paymentId, notes: input.notes });
    return { id: 'rfnd_1', payment_id: paymentId, amount: 0, status: 'processed' };
  }
}

let db: TestDb;
let h: Harness;
let fake: FakeRazorpay;
let now = new Date();
let adminId: string;
let at: string;
let evSeq = 0;

interface U {
  id: string;
  t: string;
}
async function newUser(): Promise<U> {
  const u = await createTestUser(db, { email: `u${Math.random().toString(36).slice(2, 10)}@test.local` });
  return { id: u.id, t: await token(u.id) };
}
const get = async (path: string, t?: string) => h.req(path, { ...(t ? { token: t } : {}) });
const post = async (path: string, json: unknown, t?: string) => h.req(path, { method: 'POST', json, ...(t ? { token: t } : {}) });

async function order(u: U, plan: string, extra: Record<string, unknown> = {}): Promise<{ status: number; body: J; crid: string }> {
  const crid = uuid();
  const r = await post('/billing/orders', { client_request_id: crid, plan_code: plan, ...extra }, u.t);
  return { status: r.status, body: await j(r), crid };
}

async function webhook(payload: unknown, opts: { eventId?: string; sig?: string } = {}): Promise<Response> {
  const body = JSON.stringify(payload);
  const sig = opts.sig ?? (await hmacSha256Hex(WH_SECRET, body));
  return h.req('/billing/webhooks/razorpay', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': sig, 'X-Razorpay-Event-Id': opts.eventId ?? `evt_${++evSeq}_${Date.now()}` },
  });
}
const paidPayload = (rzpOrderId: string, amount: number, payId = `pay_${++evSeq}`) => ({
  event: 'order.paid',
  payload: {
    order: { entity: { id: rzpOrderId, amount, currency: 'INR' } },
    payment: { entity: { id: payId, order_id: rzpOrderId, amount, currency: 'INR' } },
  },
});
/** Create an order for u and pay it via webhook. Returns ids. */
async function buy(u: U, plan: string, extra: Record<string, unknown> = {}, payId?: string) {
  const o = await order(u, plan, extra);
  expect(o.status).toBe(201);
  const d = o.body.data;
  const w = await webhook(paidPayload(d.razorpay_order_id, d.amount_paise, payId));
  expect(w.status).toBe(200);
  return { orderId: d.order_id as string, rzp: d.razorpay_order_id as string, amount: d.amount_paise as number, outcome: (await j(w)).data.outcome as string };
}
const me = async (u: U) => (await j(await get('/billing/me', u.t))).data;
const near = (iso: string, ms: number) => expect(Math.abs(new Date(iso).getTime() - ms)).toBeLessThan(60_000);

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  fake = new FakeRazorpay();
  h = makeHarness({ store: createSqlStore(db), db, clock: () => now });
  // deps is stored by reference in requestContext (c.set('deps', deps)) and read per request, so swapping fields works.
  h.deps.config = parseConfig({ ...baseEnv, ...rzpEnv });
  h.deps.razorpay = fake;
  const a = await createTestUser(db, { email: 'billing-admin@test.local', roles: ['ADMIN'] });
  adminId = a.id;
  at = await token(a.id);
}, 120_000);
afterAll(async () => {
  await db.close();
});

describe('billing (SQL)', () => {
  it('1. plans: four server priced plans, badges, payments enabled, free quota', async () => {
    const r = await get('/billing/plans');
    expect(r.status).toBe(200);
    const b = await j(r);
    const plans = b.data.plans as Array<{ code: string; price_paise: number; badge: string | null }>;
    expect(plans).toHaveLength(4);
    const price = Object.fromEntries(plans.map((p) => [p.code, p.price_paise]));
    expect(price).toMatchObject({ plus_monthly: 5900, plus_quarterly: 14900, plus_annual: 49900, plus_launch: 2900 });
    expect(plans.find((p) => p.code === 'plus_quarterly')!.badge).toBe('RECOMMENDED');
    expect(plans.find((p) => p.code === 'plus_annual')!.badge).toBe('BEST_VALUE');
    expect(b.data.payments_enabled).toBe(true);
    expect(b.data.free.full_papers_per_month).toBe(2);
  });

  it('2. orders: server prices, ignores client amount, idempotent replay, conflict on different plan', async () => {
    const u = await newUser();
    const crid = uuid();
    const before = fake.orders.length;
    const r = await post('/billing/orders', { client_request_id: crid, plan_code: 'plus_quarterly', amount: 1 }, u.t);
    // zod objects strip unknown keys by default; either ignore or reject is acceptable, but the price must never be 1
    if (r.status === 201) {
      const b = await j(r);
      expect(b.data.amount_paise).toBe(14900);
      expect(b.data.key_id).toBe('rzp_test_x');
      expect(b.data.razorpay_order_id).toMatch(/^order_/);
      expect(fake.orders.at(-1)!.amount).toBe(14900);
      expect(fake.orders.length).toBe(before + 1);
      const again = await post('/billing/orders', { client_request_id: crid, plan_code: 'plus_quarterly' }, u.t);
      expect(again.status).toBe(200);
      const ab = await j(again);
      expect(ab.meta.replayed).toBe(true);
      expect(ab.data.razorpay_order_id).toBe(b.data.razorpay_order_id);
      expect(fake.orders.length).toBe(before + 1);
      const conflict = await post('/billing/orders', { client_request_id: crid, plan_code: 'plus_monthly' }, u.t);
      expect(conflict.status).toBe(409);
      expect((await j(conflict)).error.code).toBe('IDEMPOTENCY_CONFLICT');
    } else {
      expect(r.status).toBe(400);
    }
  });

  it('3. webhook: bad signature 401 grants nothing; valid order.paid grants Plus ~90d and marks order PAID', async () => {
    const u = await newUser();
    const o = await order(u, 'plus_quarterly');
    const d = o.body.data;
    const bad = await webhook(paidPayload(d.razorpay_order_id, d.amount_paise), { sig: 'a'.repeat(64) });
    expect(bad.status).toBe(401);
    expect((await me(u)).tier).toBe('FREE');
    const w = await webhook(paidPayload(d.razorpay_order_id, d.amount_paise));
    expect(w.status).toBe(200);
    expect((await j(w)).data.outcome).toBe('granted');
    const m = await me(u);
    expect(m.tier).toBe('PLUS');
    near(m.plus_until, now.getTime() + 90 * DAY);
    const ord = await j(await get(`/billing/orders/${d.order_id}`, u.t));
    expect(ord.data.status).toBe('PAID');
    expect(ord.data.paid_at).toBeTruthy();
  });

  it('4. replayed event id is a duplicate and does not double grant', async () => {
    const u = await newUser();
    const o = (await order(u, 'plus_monthly')).body.data;
    const evt = `evt_dup_${Date.now()}`;
    const payload = paidPayload(o.razorpay_order_id, o.amount_paise);
    expect((await j(await webhook(payload, { eventId: evt }))).data.outcome).toBe('granted');
    expect((await j(await webhook(payload, { eventId: evt }))).data.outcome).toBe('duplicate');
    const m = await me(u);
    expect(m.entitlements.filter((e: any) => e.source !== 'SUPPORT_GRANT')).toHaveLength(1);
    near(m.plus_until, now.getTime() + 30 * DAY);
  });

  it('5. amount mismatch webhook is rejected and user stays FREE', async () => {
    const u = await newUser();
    const o = (await order(u, 'plus_quarterly')).body.data;
    const w = await webhook(paidPayload(o.razorpay_order_id, 100));
    expect((await j(w)).data.outcome).toBe('amount_mismatch');
    expect((await me(u)).tier).toBe('FREE');
    const ord = await j(await get(`/billing/orders/${o.order_id}`, u.t));
    expect(ord.data.status).toBe('CREATED');
  });

  it('5b. a paid webhook without an amount is treated as a mismatch and grants nothing', async () => {
    const u = await newUser();
    const o = (await order(u, 'plus_monthly')).body.data;
    const w = await webhook({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_noamt_${++evSeq}`, order_id: o.razorpay_order_id, currency: 'INR' } } } });
    expect((await j(w)).data.outcome).toBe('amount_mismatch');
    expect((await me(u)).tier).toBe('FREE');
  });

  it('5c. an oversized webhook body is refused before processing', async () => {
    const big = JSON.stringify({ event: 'order.paid', pad: 'x'.repeat(300 * 1024) });
    const r = await h.req('/billing/webhooks/razorpay', { method: 'POST', body: big, headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': 'a'.repeat(64) } });
    expect(r.status).toBe(413);
  });

  it('6. stacking: monthly then quarterly extends from current access end', async () => {
    const u = await newUser();
    await buy(u, 'plus_monthly');
    await buy(u, 'plus_quarterly');
    const m = await me(u);
    near(m.plus_until, now.getTime() + 120 * DAY);
  });

  it('7. refund: webhook marks REFUNDED and pulls later pass earlier; admin refund endpoint only requests', async () => {
    const u = await newUser();
    const first = await buy(u, 'plus_monthly', {}, 'pay_refund_me');
    await buy(u, 'plus_quarterly');
    near((await me(u)).plus_until, now.getTime() + 120 * DAY);

    // admin refund request: calls provider, returns 202, does not revoke
    const rr = await post(`/admin/billing/orders/${first.orderId}/refund`, { note: 'duplicate purchase' }, at);
    expect(rr.status).toBe(202);
    expect((await j(rr)).data.refund_id).toBe('rfnd_1');
    expect(fake.refunds.at(-1)!.paymentId).toBe('pay_refund_me');
    near((await me(u)).plus_until, now.getTime() + 120 * DAY);
    expect((await j(await get(`/billing/orders/${first.orderId}`, u.t))).data.status).toBe('PAID');
    const adminOrders = await j(await get(`/admin/billing/orders?user_id=${u.id}`, at));
    expect(adminOrders.data.find((o: any) => o.id === first.orderId).refund_requested_at).toBeTruthy();

    // provider confirms via webhook
    const w = await webhook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_refund_me' } } } });
    expect((await j(w)).data.outcome).toBe('refunded');
    expect((await j(await get(`/billing/orders/${first.orderId}`, u.t))).data.status).toBe('REFUNDED');
    const m = await me(u);
    expect(m.tier).toBe('PLUS');
    near(m.plus_until, now.getTime() + 90 * DAY);

    // non-admin cannot request refunds
    expect((await post(`/admin/billing/orders/${first.orderId}/refund`, { note: 'nope nope' }, u.t)).status).toBe(403);
  });

  it('8. launch pass: allowed for new user, forbidden after a paid order, no promo combination', async () => {
    const u = await newUser();
    expect((await me(u)).launch_eligible).toBe(true);
    const promoTry = await order(u, 'plus_launch', { promo_code: 'ANYCODE' });
    expect(promoTry.status).toBe(400);
    const ok = await order(u, 'plus_launch');
    expect(ok.status).toBe(201);
    expect(ok.body.data.amount_paise).toBe(2900);
    await webhook(paidPayload(ok.body.data.razorpay_order_id, 2900));
    expect((await me(u)).launch_eligible).toBe(false);
    const again = await order(u, 'plus_launch');
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('FORBIDDEN');
  });

  it('9. promo: admin creates, case-insensitive use, discounted price, exhausted for next user, non-admin 403', async () => {
    const u1 = await newUser();
    const u2 = await newUser();
    expect((await post('/admin/billing/promo-codes', { code: 'JEE10', percent_off: 10, max_redemptions: 1 }, u1.t)).status).toBe(403);
    const c = await post('/admin/billing/promo-codes', { code: 'JEE10', percent_off: 10, max_redemptions: 1 }, at);
    expect(c.status).toBe(201);
    const o = await order(u1, 'plus_quarterly', { promo_code: 'jee10' });
    expect(o.status).toBe(201);
    expect(o.body.data.amount_paise).toBe(13410);
    expect(o.body.data.list_price_paise).toBe(14900);
    const w = await webhook(paidPayload(o.body.data.razorpay_order_id, 13410));
    expect((await j(w)).data.outcome).toBe('granted');
    const o2 = await order(u2, 'plus_quarterly', { promo_code: 'JEE10' });
    expect(o2.status).toBe(400);
    const promos = await j(await get('/admin/billing/promo-codes', at));
    expect(promos.data.find((p: any) => p.code === 'JEE10').redeemed).toBe(1);
  });

  describe('10. full-paper quota', () => {
    let paperSlug: string;
    beforeAll(async () => {
      // fixtures contain no exam_papers; create one and attach three published fixture questions to it
      paperSlug = 'billing-test-paper-2026';
      await db.withService(async (tx) => {
        const exam = (await tx.query<{ id: string }>(`select id from public.exams where slug='jee-main'`)).rows[0]!.id;
        const p = (
          await tx.query<{ id: string }>(
            `insert into public.exam_papers (exam_id, slug, title, year) values ($1,$2,'Billing test paper',2026) returning id`,
            [exam, paperSlug],
          )
        ).rows[0]!.id;
        await tx.query(
          `update public.questions set paper_id=$1 where id in (
             select id from public.questions where exam_id=$2 and publication_status='PUBLISHED' and answer_key is not null
               and chapter_id is not null and subject_id is not null order by id limit 3)`,
          [p, exam],
        );
      });
    });
    const start = (u: U, crid = uuid()) =>
      post('/practice/sessions', { client_request_id: crid, mode: 'PYQ_PAPER', exam: 'jee-main', paper: paperSlug, size: 3, filters: { exclude_correct: false } }, u.t);

    it('free user gets 2 per month, 3rd is QUOTA_EXCEEDED; replay passes; Plus unlimited', async () => {
      const u = await newUser();
      const c1 = uuid();
      expect((await start(u, c1)).status).toBe(201);
      expect((await start(u)).status).toBe(201);
      const third = await start(u);
      expect(third.status).toBe(429);
      const tb = await j(third);
      expect(tb.error.code).toBe('QUOTA_EXCEEDED');
      expect(tb.error.details.resets_on).toMatch(/^\d{4}-\d{2}-01$/);
      const replay = await start(u, c1);
      expect(replay.status).toBe(200);
      expect((await me(u)).quota.full_papers).toMatchObject({ used: 2, limit: 2 });

      await buy(u, 'plus_monthly');
      expect((await start(u)).status).toBe(201);
      const m = await me(u);
      expect(m.quota.full_papers.limit).toBeNull();
    });

    it('with billing disabled no quota applies', async () => {
      const u = await newUser();
      const saved = h.deps.config;
      h.deps.config = parseConfig(baseEnv);
      try {
        for (let i = 0; i < 4; i++) expect((await start(u)).status).toBe(201);
        const m = await j(await get('/billing/plans'));
        expect(m.data.payments_enabled).toBe(false);
      } finally {
        h.deps.config = saved;
      }
    });

    it('service-level assertFullPaperAllowed/recordFullPaper', async () => {
      const u = await newUser();
      const d: BillingDeps = { db, config: parseConfig({ ...baseEnv, ...rzpEnv }), clock: () => now, logger: silentLogger, razorpay: fake };
      const ids = [uuid(), uuid()];
      for (const id of ids) {
        await assertFullPaperAllowed(d, u.id, id);
        await recordFullPaper(d, u.id, id);
      }
      await recordFullPaper(d, u.id, ids[0]!); // idempotent
      await expect(assertFullPaperAllowed(d, u.id, uuid())).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
      await assertFullPaperAllowed(d, u.id, ids[0]!);
    });
  });

  it('11. parent payment link: create, public view, order, webhook pays for the student', async () => {
    const u = await newUser();
    const c = await post('/billing/payment-links', { plan_code: 'plus_quarterly' }, u.t);
    expect(c.status).toBe(201);
    const cb = await j(c);
    expect(cb.data.token).toMatch(/^[a-f0-9]{48}$/);
    expect(cb.data.url.startsWith('https://app.test/pay/')).toBe(true);
    const tok = cb.data.token as string;

    const pub = await get(`/billing/payment-links/${tok}`);
    expect(pub.status).toBe(200);
    const pb = await j(pub);
    expect(pb.data.status).toBe('OPEN');
    expect(JSON.stringify(pb)).not.toContain('@test.local');
    expect(JSON.stringify(pb)).not.toContain(u.id);

    const o = await post(`/billing/payment-links/${tok}/order`, {});
    expect(o.status).toBe(201);
    const ob = await j(o);
    expect(ob.data.amount_paise).toBe(14900);
    const w = await webhook(paidPayload(ob.data.razorpay_order_id, 14900));
    expect((await j(w)).data.outcome).toBe('granted');

    expect((await j(await get(`/billing/payment-links/${tok}`))).data.status).toBe('PAID');
    const m = await me(u);
    expect(m.tier).toBe('PLUS');
    near(m.plus_until, now.getTime() + 90 * DAY);
    expect((await post(`/billing/payment-links/${tok}/order`, {})).status).toBe(409);
  });

  it('12. admin grant and revoke write audit rows', async () => {
    const u = await newUser();
    const g = await post('/admin/billing/entitlements', { user_id: u.id, days: 7, note: 'support goodwill' }, at);
    expect(g.status).toBe(201);
    const gb = await j(g);
    expect((await me(u)).tier).toBe('PLUS');
    const rv = await post(`/admin/billing/entitlements/${gb.data.id}/revoke`, { note: 'granted in error' }, at);
    expect(rv.status).toBe(200);
    expect((await j(rv)).data.revoked_at).toBeTruthy();
    expect((await me(u)).tier).toBe('FREE');
    const actions = await db.withService(async (tx) =>
      (await tx.query<{ action: string }>(`select action from public.audit_log where entity_id=$1 order by created_at`, [gb.data.id])).rows.map((r) => r.action),
    );
    expect(actions).toContain('billing.entitlement_granted');
    expect(actions).toContain('billing.entitlement_revoked');
    const actor = await db.withService(async (tx) =>
      (await tx.query<{ actor_id: string }>(`select actor_id from public.audit_log where action='billing.entitlement_granted' and entity_id=$1`, [gb.data.id])).rows[0]!.actor_id,
    );
    expect(actor).toBe(adminId);
    expect((await post('/admin/billing/entitlements', { user_id: u.id, days: 7, note: 'sneaky' }, u.t)).status).toBe(403);
  });

  it('13. config guards: live key refused, partial Razorpay config refused', () => {
    expect(() => parseConfig({ ...baseEnv, ...rzpEnv, RAZORPAY_KEY_ID: 'rzp_live_abc' })).toThrow(/BILLING_ALLOW_LIVE/);
    expect(() => parseConfig({ ...baseEnv, ...rzpEnv, RAZORPAY_KEY_ID: 'rzp_live_abc', BILLING_ALLOW_LIVE: 'true' })).not.toThrow();
    expect(() => parseConfig({ ...baseEnv, RAZORPAY_KEY_ID: 'rzp_test_x' })).toThrow(/all of RAZORPAY/);
    expect(parseConfig(baseEnv).billingEnabled).toBe(false);
  });
});

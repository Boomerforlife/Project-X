/**
 * Monetisation + classification against real migrations (PGlite): checkout verification, partial refunds, promo cap
 * reservations, expiry back to free, entitlements, rewarded-ad credits, admin classification.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, createTestUser, type TestDb } from '@projectx/db/testing';
import { createSqlStore } from '../src/repositories/sql/store';
import { parseConfig } from '../src/config';
import { hmacSha256Hex, type RazorpayClient, type RazorpayPayment } from '../src/billing/razorpay';
import { assertFullPaperAllowed, recordFullPaper, type BillingDeps } from '../src/billing/service';
import { silentLogger } from '../src/deps';
import { makeHarness, SECRET, token, type Harness } from './helpers';

type J = { data?: any; meta?: any; error?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<J> => (await r.json()) as J;
const uuid = () => crypto.randomUUID();
const DAY = 86_400_000;
const WH_SECRET = 'whsec_test_secret_value';
const KEY_SECRET = 'rzp_secret_value';

const baseEnv = {
  APP_ENV: 'test',
  AUTH_MODE: 'test',
  TEST_JWT_SECRET: SECRET,
  SIGNING_SECRET: 'sign-secret-sign-secret-sign-secret-1234',
  IP_HASH_SECRET: 'ip-secret-ip-secret-ip-secret-ip-secret-1234',
  PUBLIC_ASSETS_BASE_URL: 'https://assets.test',
  FILES_BASE_URL: 'https://api.test/api/v1/files',
  CORS_ALLOWED_ORIGINS: 'https://app.test',
  RAZORPAY_KEY_ID: 'rzp_test_x',
  RAZORPAY_KEY_SECRET: KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: WH_SECRET,
  WEB_BASE_URL: 'https://app.test',
};

class FakeRazorpay implements RazorpayClient {
  readonly keyId = 'rzp_test_x';
  payments = new Map<string, RazorpayPayment>();
  fetchFails = false;
  private n = 0;
  async createOrder(input: { amount: number; currency: 'INR'; receipt: string; notes: Record<string, string> }) {
    this.n += 1;
    return { id: `order_${this.n}${Math.random().toString(36).slice(2, 10)}`, amount: input.amount, currency: 'INR', receipt: input.receipt, status: 'created' };
  }
  async refundPayment(paymentId: string) {
    return { id: `rfnd_${paymentId}`, payment_id: paymentId, amount: 0, status: 'processed' };
  }
  async fetchPayment(paymentId: string) {
    if (this.fetchFails) throw new Error('network');
    const p = this.payments.get(paymentId);
    if (!p) throw new Error('not found');
    return p;
  }
}

let db: TestDb;
let h: Harness;
let fake: FakeRazorpay;
let now = new Date();
let adminT: string;
let adminId: string;
let evSeq = 0;
const sql = <T = Record<string, unknown>>(q: string, p: unknown[] = []) => db.withService(async (tx) => (await tx.query<T>(q, p)).rows);

interface U {
  id: string;
  t: string;
}
async function newUser(): Promise<U> {
  const u = await createTestUser(db, { email: `m${Math.random().toString(36).slice(2, 10)}@test.local` });
  return { id: u.id, t: await token(u.id) };
}
const get = (path: string, t?: string) => h.req(path, t ? { token: t } : {});
const post = (path: string, json: unknown, t?: string) => h.req(path, { method: 'POST', json, ...(t ? { token: t } : {}) });
const setEnv = (extra: Record<string, string>) => {
  h.deps.config = parseConfig({ ...baseEnv, ...extra });
};

async function order(u: U, plan: string, extra: Record<string, unknown> = {}) {
  const r = await post('/billing/orders', { client_request_id: uuid(), plan_code: plan, ...extra }, u.t);
  return { status: r.status, body: await j(r) };
}
async function webhook(payload: unknown, eventId = `evt_${++evSeq}_${Date.now()}`) {
  const body = JSON.stringify(payload);
  return h.req('/billing/webhooks/razorpay', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': await hmacSha256Hex(WH_SECRET, body), 'X-Razorpay-Event-Id': eventId },
  });
}
const paid = (rzpOrderId: string, amount: number, payId: string) => ({
  event: 'order.paid',
  payload: { order: { entity: { id: rzpOrderId, amount, currency: 'INR' } }, payment: { entity: { id: payId, order_id: rzpOrderId, amount, currency: 'INR' } } },
});
const refund = (payId: string, amount: number, refundId: string) => ({
  event: 'refund.processed',
  payload: { refund: { entity: { id: refundId, payment_id: payId, amount } } },
});
const me = async (u: U) => (await j(await get('/billing/me', u.t))).data;
const sign = (o: string, p: string) => hmacSha256Hex(KEY_SECRET, `${o}|${p}`);

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  fake = new FakeRazorpay();
  h = makeHarness({ store: createSqlStore(db), db, clock: () => now });
  setEnv({});
  h.deps.razorpay = fake;
  const a = await createTestUser(db, { email: 'mon-admin@test.local', roles: ['ADMIN'] });
  adminId = a.id;
  adminT = await token(a.id);
}, 120_000);
afterAll(async () => {
  await db.close();
});

// ---------------------------------------------------------------------------------------------------------------------
describe('checkout verification', () => {
  it('valid signature + captured payment grants Plus once; the later webhook does not double grant', async () => {
    const u = await newUser();
    const o = (await order(u, 'plus_monthly')).body.data;
    const pay = `pay_${uuid().replace(/-/g, '').slice(0, 14)}`;
    fake.payments.set(pay, { id: pay, order_id: o.razorpay_order_id, amount: o.amount_paise, currency: 'INR', status: 'captured' });
    const r = await post(`/billing/orders/${o.order_id}/verify`, { razorpay_order_id: o.razorpay_order_id, razorpay_payment_id: pay, razorpay_signature: await sign(o.razorpay_order_id, pay) }, u.t);
    expect(r.status).toBe(200);
    expect((await j(r)).data.status).toBe('PAID');
    expect((await me(u)).tier).toBe('PLUS');
    const w = await webhook(paid(o.razorpay_order_id, o.amount_paise, pay));
    expect((await j(w)).data.outcome).toBe('already_paid');
    // Verify again: idempotent.
    const again = await post(`/billing/orders/${o.order_id}/verify`, { razorpay_order_id: o.razorpay_order_id, razorpay_payment_id: pay, razorpay_signature: await sign(o.razorpay_order_id, pay) }, u.t);
    expect((await j(again)).data.status).toBe('PAID');
    const ents = await sql(`select id from billing_entitlements where user_id=$1`, [u.id]);
    expect(ents).toHaveLength(1);
  });

  it('an invalid signature is refused and grants nothing (a browser "success" alone never grants)', async () => {
    const u = await newUser();
    const o = (await order(u, 'plus_monthly')).body.data;
    const pay = 'pay_FORGED1234567';
    fake.payments.set(pay, { id: pay, order_id: o.razorpay_order_id, amount: o.amount_paise, currency: 'INR', status: 'captured' });
    const r = await post(`/billing/orders/${o.order_id}/verify`, { razorpay_order_id: o.razorpay_order_id, razorpay_payment_id: pay, razorpay_signature: 'a'.repeat(64) }, u.t);
    expect(r.status).toBe(400);
    expect((await j(r)).error.details.reason).toBe('INVALID_SIGNATURE');
    expect((await me(u)).tier).toBe('FREE');
  });

  it('authorized-not-captured, provider unreachable, or wrong amount: nothing granted, order stays open for the webhook', async () => {
    const u = await newUser();
    const o = (await order(u, 'plus_quarterly')).body.data;
    const pay = 'pay_AUTHONLY12345';
    const body = async () => ({ razorpay_order_id: o.razorpay_order_id, razorpay_payment_id: pay, razorpay_signature: await sign(o.razorpay_order_id, pay) });
    fake.payments.set(pay, { id: pay, order_id: o.razorpay_order_id, amount: o.amount_paise, currency: 'INR', status: 'authorized' });
    expect((await j(await post(`/billing/orders/${o.order_id}/verify`, await body(), u.t))).data.status).toBe('CREATED');
    fake.fetchFails = true;
    expect((await j(await post(`/billing/orders/${o.order_id}/verify`, await body(), u.t))).data.status).toBe('CREATED');
    fake.fetchFails = false;
    fake.payments.set(pay, { id: pay, order_id: o.razorpay_order_id, amount: 100, currency: 'INR', status: 'captured' });
    expect((await j(await post(`/billing/orders/${o.order_id}/verify`, await body(), u.t))).data.status).toBe('CREATED');
    expect((await me(u)).tier).toBe('FREE');
  });

  it("another user's order is not found", async () => {
    const a = await newUser();
    const b = await newUser();
    const o = (await order(a, 'plus_monthly')).body.data;
    const pay = 'pay_OTHERUSER1234';
    const r = await post(`/billing/orders/${o.order_id}/verify`, { razorpay_order_id: o.razorpay_order_id, razorpay_payment_id: pay, razorpay_signature: await sign(o.razorpay_order_id, pay) }, b.t);
    expect(r.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('refunds, expiry, promo cap', () => {
  it('a partial refund keeps access; completing the refund revokes it; a repeated refund id is a duplicate', async () => {
    const u = await newUser();
    const o = (await order(u, 'plus_quarterly')).body.data;
    const pay = 'pay_REFUND123456';
    expect((await j(await webhook(paid(o.razorpay_order_id, o.amount_paise, pay)))).data.outcome).toBe('granted');
    expect((await j(await webhook(refund(pay, 5000, 'rfnd_a')))).data.outcome).toBe('partial_refund');
    expect((await me(u)).tier).toBe('PLUS');
    expect((await j(await webhook(refund(pay, 5000, 'rfnd_a')))).data.outcome).toBe('duplicate');
    expect((await me(u)).tier).toBe('PLUS');
    expect((await j(await webhook(refund(pay, o.amount_paise - 5000, 'rfnd_b')))).data.outcome).toBe('refunded');
    expect((await me(u)).tier).toBe('FREE');
  });

  it('Plus expires on time with no job: the user is back on the free tier and eligible for ads again', async () => {
    const u = await newUser();
    const o = (await order(u, 'plus_monthly')).body.data;
    await webhook(paid(o.razorpay_order_id, o.amount_paise, 'pay_EXPIRE123456'));
    let e = (await j(await get('/entitlements', u.t))).data;
    expect(e.tier).toBe('PLUS');
    expect(e.features.ad_free).toBe(true);
    expect(e.ads.eligible).toBe(false);
    const saved = now;
    now = new Date(saved.getTime() + 31 * DAY);
    e = (await j(await get('/entitlements', u.t))).data;
    expect(e.tier).toBe('FREE');
    expect(e.features.ad_free).toBe(false);
    expect(e.ads.eligible).toBe(true);
    expect((await me(u)).tier).toBe('FREE');
    now = saved;
  });

  it('promo cap counts open checkouts, so two concurrent buyers cannot both use a single-use code', async () => {
    const r = await post('/admin/billing/promo-codes', { code: 'ONLYONE', percent_off: 50, max_redemptions: 1, new_users_only: false }, adminT);
    expect(r.status).toBe(201);
    const a = await newUser();
    const b = await newUser();
    expect((await order(a, 'plus_monthly', { promo_code: 'ONLYONE' })).status).toBe(201);
    const second = await order(b, 'plus_monthly', { promo_code: 'ONLYONE' });
    expect(second.status).toBe(400);
    expect(second.body.error.details.reason).toBe('PROMO_EXHAUSTED');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('entitlements', () => {
  it('signed out: free tier, ads eligible, rewarded off by default, payments on', async () => {
    const e = (await j(await get('/entitlements'))).data;
    expect(e.tier).toBe('FREE');
    expect(e.features.ad_free).toBe(false);
    expect(e.features.study_plan).toBe(true);
    expect(e.features.study_plan_full).toBe(false);
    expect(e.ads).toEqual({ eligible: true, rewarded_enabled: false });
    expect(e.limits.full_papers_per_month).toBe(2);
    expect(e.limits.plan_max_days).toBe(7);
  });

  it('ADS_ENABLED=false turns ads off for everyone', async () => {
    setEnv({ ADS_ENABLED: 'false' });
    expect((await j(await get('/entitlements'))).data.ads.eligible).toBe(false);
    setEnv({});
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('rewarded-ad credits', () => {
  it('are off unless REWARDED_ADS_ENABLED (and never offered when payments are off)', async () => {
    const u = await newUser();
    const off = (await j(await get('/rewards/offers', u.t))).data.offers[0];
    expect(off.available).toBe(false);
    expect(off.reason).toBe('DISABLED');
    expect((await post('/rewards/offers/extra_full_paper/start', {}, u.t)).status).toBe(403);
    h.deps.config = parseConfig({ ...baseEnv, RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined, RAZORPAY_WEBHOOK_SECRET: undefined, REWARDED_ADS_ENABLED: 'true' } as never);
    expect((await j(await get('/rewards/offers', u.t))).data.offers[0].reason).toBe('NOT_NEEDED');
    setEnv({});
  });

  it('grant needs a nonce, GPT GRANTED, the minimum time and the caps; it adds one full paper this month', async () => {
    setEnv({ REWARDED_ADS_ENABLED: 'true' });
    const u = await newUser();
    const offer = (await j(await get('/rewards/offers', u.t))).data.offers[0];
    expect(offer).toMatchObject({ code: 'extra_full_paper', available: true, amount: 1, daily_cap: 1, monthly_cap: 3 });

    // Closed early: no reward, and that nonce is used up.
    let s = (await j(await post('/rewards/offers/extra_full_paper/start', {}, u.t))).data;
    now = new Date(now.getTime() + 30_000);
    let c = (await j(await post('/rewards/claim', { nonce: s.nonce, outcome: 'CLOSED' }, u.t))).data;
    expect(c).toMatchObject({ status: 'NOT_GRANTED', reason: 'CLOSED' });
    expect((await j(await post('/rewards/claim', { nonce: s.nonce, outcome: 'GRANTED' }, u.t))).data.reason).toBe('ALREADY_USED');

    // Faster than the rule's minimum seconds: refused.
    s = (await j(await post('/rewards/offers/extra_full_paper/start', {}, u.t))).data;
    c = (await j(await post('/rewards/claim', { nonce: s.nonce, outcome: 'GRANTED' }, u.t))).data;
    expect(c).toMatchObject({ status: 'NOT_GRANTED', reason: 'TOO_FAST' });

    // A real completion after the minimum time: granted.
    s = (await j(await post('/rewards/offers/extra_full_paper/start', {}, u.t))).data;
    now = new Date(now.getTime() + 31_000);
    c = (await j(await post('/rewards/claim', { nonce: s.nonce, outcome: 'GRANTED' }, u.t))).data;
    expect(c.status).toBe('GRANTED');
    expect(c.offer).toMatchObject({ available: false, reason: 'DAILY_CAP', granted_today: 1 });

    const m = await me(u);
    expect(m.quota.full_papers.limit).toBe(3);
    expect(m.quota.full_papers.rewarded).toBe(1);
    expect((await j(await get('/entitlements', u.t))).data.limits.full_papers_rewarded).toBe(1);

    // Daily cap: a second start the same day is refused.
    const again = await post('/rewards/offers/extra_full_paper/start', {}, u.t);
    expect(again.status).toBe(403);
    expect((await j(again)).error.details.reason).toBe('REWARD_DAILY_CAP');

    // The credit is real quota: a third full paper is allowed, a fourth is not.
    const bd: BillingDeps = { db, config: h.deps.config, clock: () => now, logger: silentLogger, razorpay: fake };
    for (let i = 0; i < 3; i++) {
      const crid = uuid();
      await assertFullPaperAllowed(bd, u.id, crid);
      await recordFullPaper(bd, u.id, crid);
    }
    await expect(assertFullPaperAllowed(bd, u.id, uuid())).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    setEnv({});
  });

  it("a nonce is single-user and Plus users don't get rewards", async () => {
    setEnv({ REWARDED_ADS_ENABLED: 'true' });
    const a = await newUser();
    const b = await newUser();
    const s = (await j(await post('/rewards/offers/extra_full_paper/start', {}, a.t))).data;
    expect((await post('/rewards/claim', { nonce: s.nonce, outcome: 'GRANTED' }, b.t)).status).toBe(404);
    await sql(`insert into billing_entitlements (user_id, source, starts_at, ends_at, note) values ($1,'SUPPORT_GRANT', $2::timestamptz - interval '1 day', $2::timestamptz + interval '30 days','t')`, [b.id, now.toISOString()]);
    expect((await j(await get('/rewards/offers', b.t))).data.offers[0].reason).toBe('PLUS');
    setEnv({});
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('admin classification', () => {
  let physics: { id: string; exam_id: string };
  let kinematics: { id: string; slug: string };
  let chemChapter: { slug: string };
  const ids: string[] = [];

  beforeAll(async () => {
    physics = (await sql<{ id: string; exam_id: string }>(`select id, exam_id from subjects where slug='jee-main-physics'`))[0]!;
    kinematics = (await sql<{ id: string; slug: string }>(`select id, slug from chapters where slug='jee-main-physics-kinematics'`))[0]!;
    chemChapter = (await sql<{ slug: string }>(`select c.slug from chapters c join subjects s on s.id=c.subject_id where s.slug='jee-main-chemistry' limit 1`))[0]!;
    for (let i = 0; i < 3; i++) {
      const [r] = await sql<{ id: string }>(
        `insert into questions (exam_id, subject_id, origin, question_type, question_text, structured_content, year, question_number)
         values ($1, $2, 'EDITORIAL', 'NUMERICAL', $3, $4::jsonb, 2024, $5) returning id`,
        [physics.exam_id, physics.id, `Classify me test question number ${i} about a ball thrown upward`, JSON.stringify([{ type: 'paragraph', text: `Q ${i}` }]), String(i + 1)],
      );
      ids.push(r!.id);
    }
  });

  it('is reviewer/admin only', async () => {
    const u = await newUser();
    expect((await get('/admin/classify/questions', u.t)).status).toBe(403);
    expect((await post('/admin/classify/bulk', { ids, difficulty: 'EASY' }, u.t)).status).toBe(403);
    expect((await get('/admin/classify/questions')).status).toBe(401);
  });

  it('lists unclassified questions with counts, and finds one by id', async () => {
    const r = await j(await get('/admin/classify/questions?exam=jee-main&difficulty=UNCLASSIFIED&year=2024&limit=100', adminT));
    const mine = r.data.items.filter((x: { id: string }) => ids.includes(x.id));
    expect(mine).toHaveLength(3);
    expect(mine[0].difficulty).toBeNull();
    expect(r.data.counts.UNCLASSIFIED).toBeGreaterThanOrEqual(3);
    expect(r.data.total).toBe(r.data.counts.UNCLASSIFIED);
    const one = await j(await get(`/admin/classify/questions?q=${ids[0]}`, adminT));
    expect(one.data.items.map((x: { id: string }) => x.id)).toEqual([ids[0]]);
  });

  it('bulk sets difficulty + chapter, records ADMIN provenance and an audit row, leaves content intact', async () => {
    const before = await sql<{ n: string }>(`select count(*)::text as n from questions`);
    const texts = await sql<{ id: string; question_text: string }>(`select id, question_text from questions where id = any($1::uuid[])`, [ids]);
    const r = await j(await post('/admin/classify/bulk', { ids: ids.slice(0, 2), difficulty: 'MEDIUM', chapter: kinematics.slug, note: 'test' }, adminT));
    expect(r.data).toEqual({ updated: 2, skipped: [] });
    const rows = await sql<{ id: string; difficulty: string; difficulty_source: string; difficulty_set_by: string; chapter_id: string; question_text: string }>(
      `select id, difficulty::text, difficulty_source, difficulty_set_by, chapter_id, question_text from questions where id = any($1::uuid[]) order by question_number`,
      [ids],
    );
    expect(rows[0]).toMatchObject({ difficulty: 'MEDIUM', difficulty_source: 'ADMIN', difficulty_set_by: adminId, chapter_id: kinematics.id });
    expect(rows[2]!.difficulty).toBeNull();
    for (const t of texts) expect(rows.find((x) => x.id === t.id)!.question_text).toBe(t.question_text);
    expect((await sql<{ n: string }>(`select count(*)::text as n from questions`))[0]!.n).toBe(before[0]!.n);
    const audit = await sql(`select details from audit_log where action='question.bulk_classify' and actor_id=$1`, [adminId]);
    expect(audit.length).toBeGreaterThanOrEqual(1);

    // Re-classifying keeps ADMIN provenance (the trigger reads the transaction setting, not "did the column change").
    await post('/admin/classify/bulk', { ids: [ids[0]], difficulty: 'HARD' }, adminT);
    const [again] = await sql<{ difficulty: string; difficulty_source: string }>(`select difficulty::text, difficulty_source from questions where id=$1`, [ids[0]]);
    expect(again).toMatchObject({ difficulty: 'HARD', difficulty_source: 'ADMIN' });

    // Filter by difficulty now finds them.
    const hard = await j(await get('/admin/classify/questions?difficulty=HARD&chapter=' + kinematics.slug, adminT));
    expect(hard.data.items.map((x: { id: string }) => x.id)).toContain(ids[0]);
  });

  it('a difficulty change made without declaring a source is stored as "not recorded", never mislabelled', async () => {
    await sql(`update questions set difficulty='EASY' where id=$1`, [ids[2]]);
    const [r] = await sql<{ difficulty_source: string | null; difficulty_set_at: string | null }>(`select difficulty_source, difficulty_set_at from questions where id=$1`, [ids[2]]);
    expect(r!.difficulty_source).toBeNull();
    expect(r!.difficulty_set_at).not.toBeNull();
  });

  it('skips rule-breaking rows with a reason instead of failing the batch', async () => {
    const missing = uuid();
    const r = await j(await post('/admin/classify/bulk', { ids: [ids[2], missing], chapter: chemChapter.slug }, adminT));
    expect(r.data.updated).toBe(0);
    expect(r.data.skipped).toEqual(
      expect.arrayContaining([
        { id: ids[2], reason: 'chapter belongs to a different subject' },
        { id: missing, reason: 'not found' },
      ]),
    );
    const pub = (await sql<{ id: string }>(`select id from questions where publication_status='PUBLISHED' limit 1`))[0];
    if (pub) {
      const u = await j(await post('/admin/classify/bulk', { ids: [pub.id], difficulty: 'UNCLASSIFIED' }, adminT));
      expect(u.data.skipped[0].reason).toBe('a published question must keep a difficulty');
      expect((await sql<{ d: string | null }>(`select difficulty::text as d from questions where id=$1`, [pub.id]))[0]!.d).not.toBeNull();
    }
  });

  it('preview signs private crops; the preview file route serves only content images', async () => {
    const assetId = uuid();
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', png)), (b) => b.toString(16).padStart(2, '0')).join('');
    await h.storage.SOURCE_DOCS.put('crops/test.png', png, { contentType: 'image/png' });
    await sql(
      `insert into question_assets (id, question_id, kind, bucket, r2_key, mime_type, sha256, width, height, bytes) values ($1,$2,'IMAGE','SOURCE_DOCS','crops/test.png','image/png',$3,10,10,11)`,
      [assetId, ids[1], sha],
    );
    await sql(`update questions set structured_content=$2::jsonb where id=$1`, [ids[1], JSON.stringify([{ type: 'image', asset_id: assetId, alt: 'crop' }])]);
    const p = (await j(await get(`/admin/classify/questions/${ids[1]}/preview`, adminT))).data;
    const block = p.content[0];
    expect(block.type).toBe('image');
    expect(block.url).toMatch(/^https:\/\/api\.test\/api\/v1\/files\/preview\//);
    const tok = block.url.split('/files/preview/')[1];
    const img = await h.req(`/files/preview/${tok}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('Content-Type')).toBe('image/png');
    expect(img.headers.get('Content-Disposition')).toBe('inline');
    // The user-upload route refuses a SOURCE_DOCS token, and a tampered token is refused here.
    expect((await h.req(`/files/${tok}`)).status).toBe(403);
    expect((await h.req(`/files/preview/${tok.slice(0, -2)}xx`)).status).toBe(403);
  });
});

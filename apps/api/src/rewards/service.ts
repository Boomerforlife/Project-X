/**
 * Rewarded-ad credits. Rules live in `ad_reward_rules` (migration 0026), so amounts, caps and the minimum time are data.
 *
 * Flow: the student chooses to watch -> POST start issues a single-use nonce -> the web shows a Google Ad Manager
 * rewarded ad -> on GPT's `rewardedSlotGranted` the web posts claim(GRANTED); on close/no fill it posts the outcome so
 * nothing is granted. Never granted for a click, never simulated, never granted without a nonce.
 *
 * Limit (stated honestly in the UI copy and docs): Google's server-side verification exists for apps only, so on the web
 * the completion signal comes from GPT in the browser. Mitigations: nonce issued only to signed-in free users who
 * pressed "watch", single use, 15-minute expiry, minimum seconds between issue and claim, daily/monthly caps enforced
 * under a per-user lock, and a small reward (one extra full paper).
 */
import type { Db, SqlTx } from '@projectx/db';
import type { RewardClaimBody, RewardClaimResult, RewardOffer, RewardStart } from '@projectx/contracts';
import type { AppConfig } from '../config';
import type { Logger } from '../deps';
import { ApiError, notFound } from '../lib/errors';
import { plusUntil, quotaPeriod } from '../billing/service';

export interface RewardDeps {
  db: Db;
  config: AppConfig;
  clock: () => Date;
  logger: Logger;
}

type Tx = SqlTx;
const NONCE_TTL_MS = 15 * 60_000;
const MAX_OPEN_NONCES = 3;

interface RuleRow {
  code: string;
  benefit: 'FULL_PAPER_CREDIT';
  amount: number;
  daily_cap: number;
  monthly_cap: number;
  min_seconds: number;
  label: string;
  description: string;
  active: boolean;
}
interface ClaimRow {
  id: string;
  user_id: string;
  rule_code: string;
  status: 'ISSUED' | 'GRANTED' | 'NOT_GRANTED';
  issued_at: string;
  expires_at: string;
  period: string;
}

const RULE_COLS = 'code, benefit, amount, daily_cap, monthly_cap, min_seconds, label, description, active';

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Rewards only exist where a free user has a limit to lift: payments on (quota enforced), rewarded ads on. */
function enabled(config: AppConfig): boolean {
  return config.ADS_ENABLED && config.REWARDED_ADS_ENABLED && config.billingEnabled;
}

async function counts(tx: Tx, userId: string, rule: string, now: Date, period: string): Promise<{ today: number; month: number }> {
  const r = await tx.query<{ today: number; month: number }>(
    `select count(*) filter (where (resolved_at at time zone 'Asia/Kolkata')::date = ($3::timestamptz at time zone 'Asia/Kolkata')::date)::int as today,
            count(*) filter (where period = $4::date)::int as month
       from public.ad_reward_claims where user_id=$1 and rule_code=$2 and status='GRANTED'`,
    [userId, rule, now.toISOString(), period],
  );
  return { today: Number(r.rows[0]?.today ?? 0), month: Number(r.rows[0]?.month ?? 0) };
}

async function offerFor(tx: Tx, d: RewardDeps, userId: string, rule: RuleRow, now: Date, plus: boolean): Promise<RewardOffer> {
  const { period } = await quotaPeriod(tx, now);
  const c = await counts(tx, userId, rule.code, now, period);
  let reason: RewardOffer['reason'] = null;
  if (!enabled(d.config) || !rule.active) reason = d.config.billingEnabled || !rule.active ? 'DISABLED' : 'NOT_NEEDED';
  else if (plus) reason = 'PLUS';
  else if (c.today >= rule.daily_cap) reason = 'DAILY_CAP';
  else if (c.month >= rule.monthly_cap) reason = 'MONTHLY_CAP';
  return {
    code: rule.code,
    label: rule.label,
    description: rule.description,
    benefit: rule.benefit,
    amount: Number(rule.amount),
    min_seconds: Number(rule.min_seconds),
    available: reason === null,
    reason,
    granted_today: c.today,
    granted_this_month: c.month,
    daily_cap: Number(rule.daily_cap),
    monthly_cap: Number(rule.monthly_cap),
  };
}

async function isPlusTx(tx: Tx, userId: string, now: Date): Promise<boolean> {
  const until = await plusUntil(tx, userId);
  return !!until && until > now;
}

async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.query(`select pg_advisory_xact_lock(hashtext('rewards:' || $1::text))`, [userId]);
}

export async function listOffers(d: RewardDeps, userId: string): Promise<{ offers: RewardOffer[] }> {
  const now = d.clock();
  return d.db.withService(async (tx) => {
    const rules = (await tx.query<RuleRow>(`select ${RULE_COLS} from public.ad_reward_rules where active order by sort_order, code`)).rows;
    const plus = await isPlusTx(tx, userId, now);
    const offers: RewardOffer[] = [];
    for (const r of rules) offers.push(await offerFor(tx, d, userId, r, now, plus));
    return { offers };
  });
}

export async function startOffer(d: RewardDeps, userId: string, code: string): Promise<RewardStart> {
  const now = d.clock();
  return d.db.withService(async (tx) => {
    await lockUser(tx, userId);
    const rule = (await tx.query<RuleRow>(`select ${RULE_COLS} from public.ad_reward_rules where code=$1`, [code])).rows[0];
    if (!rule) throw notFound('Reward');
    const offer = await offerFor(tx, d, userId, rule, now, await isPlusTx(tx, userId, now));
    if (!offer.available) {
      throw new ApiError('FORBIDDEN', 'This reward is not available right now', { details: { reason: `REWARD_${offer.reason}` } });
    }
    const open = await tx.query<{ n: number }>(
      `select count(*)::int as n from public.ad_reward_claims where user_id=$1 and status='ISSUED' and expires_at > $2`,
      [userId, now.toISOString()],
    );
    if (Number(open.rows[0]?.n ?? 0) >= MAX_OPEN_NONCES) throw new ApiError('RATE_LIMITED', 'Finish or close the ad you already started');
    const { period } = await quotaPeriod(tx, now);
    const nonce = randomHex(24);
    const expires = new Date(now.getTime() + NONCE_TTL_MS);
    await tx.query(
      `insert into public.ad_reward_claims (user_id, rule_code, nonce, benefit, amount, period, issued_at, expires_at)
       values ($1,$2,$3,$4,$5,$6::date,$7,$8)`,
      [userId, rule.code, nonce, rule.benefit, rule.amount, period, now.toISOString(), expires.toISOString()],
    );
    return { nonce, expires_at: expires.toISOString(), min_seconds: Number(rule.min_seconds) };
  });
}

export async function claim(d: RewardDeps, userId: string, body: RewardClaimBody): Promise<RewardClaimResult> {
  const now = d.clock();
  return d.db.withService(async (tx) => {
    await lockUser(tx, userId);
    const cl = (
      await tx.query<ClaimRow>(
        `select id, user_id, rule_code, status, issued_at, expires_at, period::text as period from public.ad_reward_claims
          where nonce=$1 and user_id=$2 for update`,
        [body.nonce, userId],
      )
    ).rows[0];
    if (!cl) throw notFound('Reward');
    const rule = (await tx.query<RuleRow>(`select ${RULE_COLS} from public.ad_reward_rules where code=$1`, [cl.rule_code])).rows[0]!;
    const plus = await isPlusTx(tx, userId, now);

    const finish = async (status: 'GRANTED' | 'NOT_GRANTED', reason: RewardClaimResult['reason']): Promise<RewardClaimResult> => {
      await tx.query(`update public.ad_reward_claims set status=$2, resolved_at=$3, outcome=$4 where id=$1`, [
        cl.id,
        status,
        now.toISOString(),
        reason ?? 'GRANTED',
      ]);
      if (status === 'GRANTED') d.logger.info('reward granted', { rule: rule.code });
      return { status, reason, offer: await offerFor(tx, d, userId, rule, now, plus) };
    };

    if (cl.status !== 'ISSUED') {
      return { status: 'NOT_GRANTED', reason: 'ALREADY_USED', offer: await offerFor(tx, d, userId, rule, now, plus) };
    }
    if (new Date(cl.expires_at) <= now) return finish('NOT_GRANTED', 'EXPIRED');
    if (body.outcome !== 'GRANTED') return finish('NOT_GRANTED', body.outcome);
    if (plus) return finish('NOT_GRANTED', 'PLUS');
    if (now.getTime() - new Date(cl.issued_at).getTime() < Number(rule.min_seconds) * 1000) return finish('NOT_GRANTED', 'TOO_FAST');
    const c = await counts(tx, userId, rule.code, now, cl.period);
    if (!enabled(d.config) || !rule.active || c.today >= rule.daily_cap || c.month >= rule.monthly_cap) return finish('NOT_GRANTED', 'CAP_REACHED');
    return finish('GRANTED', null);
  });
}

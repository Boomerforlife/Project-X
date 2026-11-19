/**
 * Freemium policy: the one table of what each tier gets. Numbers come from config (env), so limits change without
 * code changes; feature membership changes here, in one place.
 *
 * Enforcement stays on the server where each feature is served (problems/access.ts, billing quota, plans routes).
 * This module describes that same policy for clients (GET /entitlements) and for new code paths.
 */
import type { Entitlements, FeatureKey } from '@projectx/contracts';
import type { AppConfig } from '../config';

export type Tier = 'FREE' | 'PLUS';

export const ALL_FEATURES: readonly FeatureKey[] = [
  'ad_free',
  'cbt_unlimited',
  'premium_problems',
  'unlimited_variants',
  'solution_extras',
  'study_plan',
  'study_plan_full',
  'diagnostic_full_report',
];

/** Free keeps the core loop: the question bank within limits, step-by-step solutions, a basic study plan, progress. */
const FREE: ReadonlySet<FeatureKey> = new Set<FeatureKey>(['study_plan']);
const PLUS: ReadonlySet<FeatureKey> = new Set<FeatureKey>(ALL_FEATURES);

export function hasFeature(tier: Tier, feature: FeatureKey): boolean {
  return (tier === 'PLUS' ? PLUS : FREE).has(feature);
}

export interface PlanLimits {
  maxDays: number;
  maxDailyMinutes: number;
}

/** The longest plan / most minutes a day this tier may create. Plus: the largest values the plan builder supports. */
export function planLimits(tier: Tier, config: Pick<AppConfig, 'FREE_PLAN_MAX_DAYS' | 'FREE_PLAN_MAX_DAILY_MINUTES'>): PlanLimits {
  return tier === 'PLUS' ? { maxDays: 14, maxDailyMinutes: 120 } : { maxDays: config.FREE_PLAN_MAX_DAYS, maxDailyMinutes: config.FREE_PLAN_MAX_DAILY_MINUTES };
}

/** Does a stored plan fit inside a tier's limits (a free user keeps using a basic plan; a lapsed Plus plan locks)? */
export function planWithinLimits(plan: { days: number; daily_minutes: number }, limits: PlanLimits): boolean {
  return plan.days <= limits.maxDays && plan.daily_minutes <= limits.maxDailyMinutes;
}

export function buildEntitlements(input: {
  tier: Tier;
  plusUntil: Date | null;
  config: AppConfig;
  fullPapersUsed: number;
  fullPapersRewarded: number;
}): Entitlements {
  const { tier, config } = input;
  const features = Object.fromEntries(ALL_FEATURES.map((f) => [f, hasFeature(tier, f)])) as Entitlements['features'];
  const limits = planLimits(tier, config);
  return {
    tier,
    plus_until: tier === 'PLUS' && input.plusUntil ? input.plusUntil.toISOString() : null,
    features,
    limits: {
      // No paywall exists while payments are off, so there is nothing to limit (same rule as the billing quota).
      full_papers_per_month: tier === 'PLUS' || !config.billingEnabled ? null : config.FREE_FULL_PAPERS_PER_MONTH + input.fullPapersRewarded,
      full_papers_used: input.fullPapersUsed,
      full_papers_rewarded: input.fullPapersRewarded,
      variants_per_problem: tier === 'PLUS' ? null : config.FREE_VARIANTS_PER_PROBLEM,
      plan_max_days: limits.maxDays,
      plan_max_daily_minutes: limits.maxDailyMinutes,
    },
    ads: {
      eligible: tier === 'FREE' && config.ADS_ENABLED,
      rewarded_enabled: tier === 'FREE' && config.ADS_ENABLED && config.REWARDED_ADS_ENABLED && config.billingEnabled,
    },
    payments_enabled: config.billingEnabled,
  };
}

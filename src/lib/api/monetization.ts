/**
 * Entitlements, rewarded-ad credits, checkout verification and admin classification (API contracts in
 * packages/contracts/src/dto/monetization.ts). Browser-only calls.
 */
import { z } from "zod";
import {
  BulkClassifyResultSchema,
  ClassifyListSchema,
  ClassifyPreviewSchema,
  EntitlementsSchema,
  OrderSchema,
  RewardClaimResultSchema,
  RewardOffersSchema,
  RewardStartSchema,
  type BulkClassifyBody,
  type ClassifyQuery,
  type Entitlements,
  type RewardClaimBody,
  type VerifyPaymentBody,
} from "@projectx/contracts";
import { getToken } from "./auth";
import { apiEnabled } from "./env";
import { ApiError } from "./errors";
import { apiFetch } from "./http";

async function authed<S extends z.ZodType>(path: string, opts: { schema: S; method?: "GET" | "POST"; body?: unknown }) {
  const token = await getToken();
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Not signed in");
  return (await apiFetch(path, { ...opts, token, base: "browser", retry: opts.method && opts.method !== "GET" ? 0 : 2 })).data;
}

/** Mock builds: the free tier as the server would describe it, with ads eligible so placements can be reviewed. */
export const DEMO_ENTITLEMENTS: Entitlements = {
  tier: "FREE",
  plus_until: null,
  features: {
    ad_free: false,
    cbt_unlimited: false,
    premium_problems: false,
    unlimited_variants: false,
    solution_extras: false,
    study_plan: true,
    study_plan_full: false,
    diagnostic_full_report: false,
  },
  limits: {
    full_papers_per_month: null,
    full_papers_used: 0,
    full_papers_rewarded: 0,
    variants_per_problem: 3,
    plan_max_days: 7,
    plan_max_daily_minutes: 60,
  },
  ads: { eligible: true, rewarded_enabled: false },
  payments_enabled: false,
};

/** Signed in or not (the endpoint is optional-auth). Fails closed to "no ads" so an outage never shows ads to Plus users. */
export async function entitlements(): Promise<Entitlements | null> {
  if (!apiEnabled()) return DEMO_ENTITLEMENTS;
  try {
    const token = await getToken();
    return (await apiFetch("/entitlements", { schema: EntitlementsSchema, token, base: "browser" })).data;
  } catch {
    return null;
  }
}

/** The anonymous (free-tier) view, for public pages such as /pricing/. Never sends a token, so it is safe to cache. */
export async function freeTierEntitlements(): Promise<Entitlements | null> {
  if (!apiEnabled()) return DEMO_ENTITLEMENTS;
  try {
    return (await apiFetch("/entitlements", { schema: EntitlementsSchema })).data;
  } catch {
    return null;
  }
}

export const rewardOffers = () => authed("/rewards/offers", { schema: RewardOffersSchema });
export const startReward = (code: string) => authed(`/rewards/offers/${encodeURIComponent(code)}/start`, { schema: RewardStartSchema, method: "POST", body: {} });
export const claimReward = (body: RewardClaimBody) => authed("/rewards/claim", { schema: RewardClaimResultSchema, method: "POST", body });

export const verifyPayment = (orderId: string, body: VerifyPaymentBody) =>
  authed(`/billing/orders/${encodeURIComponent(orderId)}/verify`, { schema: OrderSchema, method: "POST", body });

// ---- admin classification
type ClassifyFilters = Partial<Omit<ClassifyQuery, "difficulty">> & { difficulty?: string[] };
export function classifyList(f: ClassifyFilters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return authed(`/admin/classify/questions?${p.toString()}`, { schema: ClassifyListSchema });
}
export const classifyBulk = (body: BulkClassifyBody) => authed("/admin/classify/bulk", { schema: BulkClassifyResultSchema, method: "POST", body });
export const classifyPreview = (id: string) => authed(`/admin/classify/questions/${encodeURIComponent(id)}/preview`, { schema: ClassifyPreviewSchema });

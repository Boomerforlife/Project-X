/**
 * Tabby Plus billing calls. Prices always come from the API (`GET /billing/plans`); the browser never sends an amount.
 * Access is granted only by the server's Razorpay webhook, so the success page polls `getOrder` / `billingMe`.
 */
import { z } from "zod";
import {
  BillingMeSchema,
  BillingPlansSchema,
  CheckoutOrderSchema,
  OrderSchema,
  PaymentLinkSchema,
  PublicPaymentLinkSchema,
  type BillingPlans,
} from "@projectx/contracts";
import { getToken } from "./auth";
import { apiEnabled } from "./env";
import { ApiError } from "./errors";
import { apiFetch } from "./http";

async function authed<S extends z.ZodType>(path: string, opts: { schema: S; method?: "GET" | "POST"; body?: unknown }) {
  const token = await getToken();
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Not signed in");
  return (await apiFetch(path, { ...opts, token, base: "browser" })).data;
}

/**
 * Mock-data builds only: the same price list the server seeds (supabase/migrations/0018_billing.sql), so the demo
 * pricing page renders. `payments_enabled: false` keeps every checkout button disabled in mock mode.
 */
export const DEMO_PLANS: BillingPlans = {
  plans: [
    { code: "plus_launch", name: "Launch Pass", price_paise: 2900, currency: "INR", duration_days: 30, badge: "LAUNCH", launch_only: true, features: [] },
    { code: "plus_monthly", name: "Plus Monthly", price_paise: 5900, currency: "INR", duration_days: 30, badge: null, launch_only: false, features: [] },
    { code: "plus_quarterly", name: "Plus Quarterly", price_paise: 14900, currency: "INR", duration_days: 90, badge: "RECOMMENDED", launch_only: false, features: [] },
    { code: "plus_annual", name: "Plus Annual", price_paise: 49900, currency: "INR", duration_days: 365, badge: "BEST_VALUE", launch_only: false, features: [] },
  ],
  free: { full_papers_per_month: 2 },
  payments_enabled: false,
};

/** Server or browser. Returns null when the API is unreachable so the page can say so instead of inventing prices. */
export async function plans(): Promise<BillingPlans | null> {
  if (!apiEnabled()) return DEMO_PLANS;
  try {
    return (await apiFetch("/billing/plans", { schema: BillingPlansSchema })).data;
  } catch {
    return null;
  }
}

export const billingMe = () => authed("/billing/me", { schema: BillingMeSchema });
export const createOrder = (body: { client_request_id: string; plan_code: string; promo_code?: string }) =>
  authed("/billing/orders", { schema: CheckoutOrderSchema, method: "POST", body });
export const getOrder = (id: string) => authed(`/billing/orders/${encodeURIComponent(id)}`, { schema: OrderSchema });
export const listOrders = () => authed("/billing/orders", { schema: z.array(OrderSchema) });
export const createPaymentLink = (plan_code: string) =>
  authed("/billing/payment-links", { schema: PaymentLinkSchema, method: "POST", body: { plan_code } });

export async function publicPaymentLink(token: string) {
  return (await apiFetch(`/billing/payment-links/${encodeURIComponent(token)}`, { schema: PublicPaymentLinkSchema, base: "browser" })).data;
}
export async function createLinkOrder(token: string) {
  return (
    await apiFetch(`/billing/payment-links/${encodeURIComponent(token)}/order`, { schema: CheckoutOrderSchema, method: "POST", base: "browser" })
  ).data;
}

export function formatInr(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees.toLocaleString("en-IN") : rupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export function perMonth(paise: number, days: number): string {
  return formatInr(Math.round((paise / days) * 30));
}

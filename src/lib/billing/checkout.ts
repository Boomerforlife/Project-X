"use client";
/**
 * Razorpay Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/).
 * The handler's payment id/signature are NOT trusted for access: we only navigate to the success page, which polls the
 * server until the webhook has marked the order PAID.
 */
import type { CheckoutOrder } from "@projectx/contracts";
import { SITE } from "@/lib/site";

const SRC = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayCtor = new (opts: Record<string, unknown>) => { open(): void; on(ev: string, cb: (r: unknown) => void): void };
declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

let loading: Promise<RazorpayCtor> | null = null;
function loadCheckout(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Checkout did not load")));
    s.onerror = () => {
      loading = null;
      reject(new Error("Could not load the payment window. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export type CheckoutResult = "submitted" | "dismissed" | "failed";

export async function openCheckout(order: CheckoutOrder, opts: { description: string; email?: string | null }): Promise<CheckoutResult> {
  const Razorpay = await loadCheckout();
  return new Promise<CheckoutResult>((resolve) => {
    let settled = false;
    const done = (r: CheckoutResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const rzp = new Razorpay({
      key: order.key_id,
      order_id: order.razorpay_order_id,
      amount: order.amount_paise,
      currency: order.currency,
      name: SITE.name,
      description: opts.description,
      prefill: opts.email ? { email: opts.email } : undefined,
      notes: { order_id: order.order_id },
      theme: { color: "#111111" },
      handler: () => done("submitted"),
      modal: { ondismiss: () => done("dismissed"), confirm_close: true },
    });
    rzp.on("payment.failed", () => {
      /* Razorpay shows its own retry UI; the modal stays open, so wait for handler/dismiss. */
    });
    rzp.open();
  });
}

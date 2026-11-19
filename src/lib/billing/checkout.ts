"use client";
/**
 * Razorpay Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/).
 * The handler's payment id/signature are NOT trusted by the browser for access. They are handed to `onPayment`, which
 * sends them to the API (POST /billing/orders/{id}/verify): the server checks the HMAC signature with the key secret
 * and Razorpay's own payment record before granting. The success page then polls; the webhook remains the backstop.
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

export interface CheckoutPayment {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export async function openCheckout(
  order: CheckoutOrder,
  opts: { description: string; email?: string | null; onPayment?: (p: CheckoutPayment) => void },
): Promise<CheckoutResult> {
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
      handler: (resp: Partial<CheckoutPayment>) => {
        if (resp?.razorpay_order_id && resp.razorpay_payment_id && resp.razorpay_signature) {
          opts.onPayment?.({ razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature });
        }
        done("submitted");
      },
      modal: { ondismiss: () => done("dismissed"), confirm_close: true },
    });
    rzp.on("payment.failed", () => {
      /* Razorpay shows its own retry UI; the modal stays open, so wait for handler/dismiss. */
    });
    rzp.open();
  });
}

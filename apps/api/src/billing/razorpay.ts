/**
 * Minimal Razorpay REST client (Orders + Refunds) and signature helpers. Web Crypto only, so it runs on Node and Workers.
 * Docs: https://razorpay.com/docs/api/orders/ , /docs/api/refunds/ , /docs/webhooks/validate-test/
 */

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}
export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
}

export interface RazorpayClient {
  readonly keyId: string;
  createOrder(input: { amount: number; currency: 'INR'; receipt: string; notes: Record<string, string> }): Promise<RazorpayOrder>;
  refundPayment(paymentId: string, input: { notes: Record<string, string> }): Promise<RazorpayRefund>;
  /** GET /payments/{id}: the provider's own record, used to confirm a checkout before granting access. */
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
}

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RazorpayError';
  }
}

export function createRazorpayClient(opts: {
  keyId: string;
  keySecret: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}): RazorpayClient {
  const f = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? 'https://api.razorpay.com/v1';
  const auth = `Basic ${btoa(`${opts.keyId}:${opts.keySecret}`)}`;
  async function call<T>(path: string, body: unknown, method: 'GET' | 'POST' = 'POST'): Promise<T> {
    const res = await f(`${base}${path}`, {
      method,
      headers: method === 'POST' ? { Authorization: auth, 'Content-Type': 'application/json' } : { Authorization: auth },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      // Razorpay error bodies never contain secrets; keep only the description for logs.
      let desc = text.slice(0, 300);
      try {
        desc = (JSON.parse(text) as { error?: { description?: string } }).error?.description ?? desc;
      } catch {
        /* non-JSON body */
      }
      throw new RazorpayError(`Razorpay ${path} failed: ${desc}`, res.status);
    }
    return JSON.parse(text) as T;
  }
  return {
    keyId: opts.keyId,
    createOrder: (input) => call<RazorpayOrder>('/orders', input),
    refundPayment: (paymentId, input) => call<RazorpayRefund>(`/payments/${encodeURIComponent(paymentId)}/refund`, input),
    fetchPayment: (paymentId) => call<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`, null, 'GET'),
  };
}

const enc = new TextEncoder();

export async function hmacSha256Hex(secret: string, data: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new Uint8Array(bytes)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Webhook: X-Razorpay-Signature = hex HMAC-SHA256(raw body, webhook secret). */
export async function verifyWebhookSignature(rawBody: Uint8Array, signature: string | undefined, secret: string): Promise<boolean> {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqualHex(await hmacSha256Hex(secret, rawBody), signature.toLowerCase());
}

/**
 * Standard Checkout handler: razorpay_signature = hex HMAC-SHA256(`${razorpay_order_id}|${razorpay_payment_id}`, key secret).
 * https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/#15-verify-payment-signature
 */
export async function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, keySecret: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqualHex(await hmacSha256Hex(keySecret, `${orderId}|${paymentId}`), signature.toLowerCase());
}

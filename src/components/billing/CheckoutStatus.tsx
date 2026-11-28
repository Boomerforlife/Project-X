"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Order } from "@projectx/contracts";
import { useEntitlements } from "@/components/ads/AdsProvider";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { billingMe, getOrder } from "@/lib/api/billing";
import { track } from "@/lib/analytics";
import { routes, safeNext } from "@/lib/routes";
import { pricingHref } from "./pricingNext";

const POLL_MS = 2500;
const MAX_WAIT_MS = 90_000;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/**
 * After Razorpay's checkout handler fires. Access is granted by the webhook only, so we poll the order until it is
 * PAID. Copy never claims money moved unless the server says so. The moment the order is PAID we refresh the shared
 * entitlements, so the header badge and ads switch to Plus without a reload.
 */
export function CheckoutSuccess() {
  const params = useSearchParams();
  const orderId = params.get("order");
  const rawNext = params.get("next");
  const next = rawNext ? safeNext(rawNext, "") : "";
  const { refresh } = useEntitlements();
  const [order, setOrder] = useState<Order | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let live = true;
    const started = Date.now();
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const o = await getOrder(orderId);
        if (!live) return;
        setOrder(o);
        if (o.status === "PAID") {
          track("payment_confirmed", { plan: o.plan_code });
          // One shared source for plan status: refresh it (badge, ads, locks) and read the expiry from it.
          const fresh = await refresh();
          let plusUntil = fresh?.tier === "PLUS" ? fresh.plus_until : null;
          if (!plusUntil) plusUntil = (await billingMe().catch(() => null))?.plus_until ?? null;
          if (live) setUntil(plusUntil);
          return;
        }
        if (o.status !== "CREATED") return;
      } catch {
        if (live) setError(true);
      }
      if (Date.now() - started > MAX_WAIT_MS) {
        if (live) setTimedOut(true);
        return;
      }
      t = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [orderId, refresh]);

  if (!orderId) return <Shell title="No order to show" body="Open this page from checkout, or see your payments in Account & billing." />;
  if (order?.status === "PAID") {
    return (
      <Shell title="Plus is active" body={until ? `Your Plus access runs until ${fmt(until)}. A receipt is in Account & billing.` : "Your payment is confirmed. A receipt is in Account & billing."}>
        {next ? (
          <ButtonLink href={next}>Continue where you left off</ButtonLink>
        ) : (
          <ButtonLink href={routes.home}>Go to Home</ButtonLink>
        )}
      </Shell>
    );
  }
  if (order?.status === "FAILED") {
    return (
      <Shell title="The payment didn't go through" body="Razorpay reported this payment as failed, so access wasn't added. If money left your account, it is normally returned by your bank automatically.">
        <ButtonLink href={pricingHref(next)} variant="secondary">
          Try again
        </ButtonLink>
      </Shell>
    );
  }
  if (timedOut || error) {
    return (
      <Shell
        title="Still waiting for confirmation"
        body="We haven't received confirmation from Razorpay yet. If you completed the payment, Plus is added automatically as soon as it arrives, usually within a few minutes. You don't need to pay again."
      >
        <ButtonLink href="/account/" variant="secondary">
          Check Account & billing
        </ButtonLink>
      </Shell>
    );
  }
  return (
    <Shell title="Confirming your payment…" body="This usually takes a few seconds. You can keep this page open." live>
      <div aria-hidden className="h-1 w-40 overflow-hidden rounded bg-surface-2">
        <div className="h-full w-1/3 animate-pulse bg-fg" />
      </div>
    </Shell>
  );
}

export function CheckoutCancelled() {
  const params = useSearchParams();
  const orderId = params.get("order");
  const rawNext = params.get("next");
  const next = rawNext ? safeNext(rawNext, "") : "";
  const { refresh } = useEntitlements();
  const [paid, setPaid] = useState<boolean | null>(null);
  useEffect(() => {
    if (!orderId) return;
    getOrder(orderId)
      .then((o) => {
        setPaid(o.status === "PAID");
        if (o.status === "PAID") void refresh();
      })
      .catch(() => setPaid(null));
  }, [orderId, refresh]);
  if (paid) {
    return (
      <Shell title="This order is already paid" body="Plus is on your account. Nothing else to do.">
        <ButtonLink href={next || routes.home}>{next ? "Continue where you left off" : "Go to Home"}</ButtonLink>
      </Shell>
    );
  }
  return (
    <Shell
      title="Checkout closed"
      body={paid === false ? "No payment was completed for this order, so nothing was charged." : "You closed the payment window. If you didn't finish paying, nothing was charged."}
    >
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={pricingHref(next)}>Back to pricing</ButtonLink>
        <ButtonLink href="/account/#billing" variant="secondary">
          Ask a parent to pay
        </ButtonLink>
      </div>
    </Shell>
  );
}

function Shell({ title, body, children, live }: { title: string; body: string; children?: React.ReactNode; live?: boolean }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <Card className="p-8">
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-fg-muted" role={live ? "status" : undefined} aria-live={live ? "polite" : undefined}>
          {body}
        </p>
        {children ? <div className="mt-6">{children}</div> : null}
      </Card>
    </div>
  );
}

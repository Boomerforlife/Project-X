"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BillingMe, BillingPlan, BillingPlans } from "@projectx/contracts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { billingMe, createOrder, formatInr, perMonth } from "@/lib/api/billing";
import { apiEnabled } from "@/lib/api/env";
import { isApiError } from "@/lib/api/errors";
import { openCheckout } from "@/lib/billing/checkout";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { useAuthStatus } from "@/lib/session/store";

/** Copy for feature codes that are actually enforced by the API. Unknown codes are not shown (no promises). */
const FEATURE_COPY: Record<string, string> = {
  cbt_unlimited: "Unlimited full papers and CBT mocks",
};

const BADGE: Record<NonNullable<BillingPlan["badge"]>, string> = {
  RECOMMENDED: "Recommended",
  BEST_VALUE: "Best value",
  LAUNCH: "Launch offer",
};

const newId = () => crypto.randomUUID();

function useBillingMe(): { me: BillingMe | null; signedIn: boolean; ready: boolean } {
  const { status } = useAuthStatus();
  const [me, setMe] = useState<BillingMe | null>(null);
  const [fetched, setFetched] = useState(false);
  useEffect(() => {
    if (!apiEnabled() || status !== "ready") return;
    let live = true;
    billingMe()
      .then((m) => live && setMe(m))
      .catch(() => undefined)
      .finally(() => live && setFetched(true));
    return () => {
      live = false;
    };
  }, [status]);
  const ready = !apiEnabled() || (status !== "loading" && (status !== "ready" || fetched));
  return { me, signedIn: status === "ready", ready };
}

export function PricingPlans({ data }: { data: BillingPlans }) {
  const { me, signedIn, ready } = useBillingMe();
  const enabled = data.payments_enabled && apiEnabled();
  const paid = data.plans.filter((p) => !p.launch_only);
  const launch = data.plans.find((p) => p.launch_only);
  const showLaunch = !!launch && (!signedIn || !!me?.launch_eligible) && me?.tier !== "PLUS";

  useEffect(() => {
    track("pricing_view");
  }, []);

  return (
    <div className="space-y-8">
      {me?.tier === "PLUS" && me.plus_until ? (
        <p role="status" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          You have Plus until <strong>{new Date(me.plus_until).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</strong>.
          Buying another pass adds its days after that date.
        </p>
      ) : null}

      {showLaunch && launch ? (
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-fg-muted">{BADGE.LAUNCH}</p>
            <p className="mt-1 font-medium">
              {launch.name}: {formatInr(launch.price_paise)} for {launch.duration_days} days
            </p>
            <p className="mt-1 text-sm text-fg-muted">For new accounts, once, on your first purchase. One payment; it does not renew.</p>
          </div>
          <PlanButton plan={launch} enabled={enabled} signedIn={signedIn} ready={ready} variant="secondary" />
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col p-6">
          <h2 className="font-display text-lg font-semibold">Free</h2>
          <p className="mt-3 text-3xl font-semibold">₹0</p>
          <p className="mt-1 text-sm text-fg-muted">Always free</p>
          <ul className="mt-5 flex-1 space-y-2 text-sm">
            <Li>Unlimited chapter, subject and mixed practice</Li>
            <Li>All solutions and verification labels</Li>
            <Li>Bookmarks, review list and mistake notebook</Li>
            <Li>{data.free.full_papers_per_month} full papers a month (CBT included)</Li>
          </ul>
          <ButtonLink href={signedIn ? "/dashboard/" : "/signup/"} variant="secondary" className="mt-6 w-full">
            {signedIn ? "Go to dashboard" : "Start free"}
          </ButtonLink>
        </Card>

        {paid.map((p) => (
          <Card key={p.code} className={cn("relative flex flex-col p-6", p.badge === "RECOMMENDED" && "border-fg")}>
            {p.badge ? (
              <span className="absolute -top-3 left-6 rounded-full border border-line-strong bg-bg px-2.5 py-0.5 text-xs font-medium">{BADGE[p.badge]}</span>
            ) : null}
            <h2 className="font-display text-lg font-semibold">{p.name}</h2>
            <p className="mt-3 text-3xl font-semibold">{formatInr(p.price_paise)}</p>
            <p className="mt-1 text-sm text-fg-muted">
              {p.duration_days} days{p.duration_days > 31 ? ` · about ${perMonth(p.price_paise, p.duration_days)}/month` : ""}
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              <Li>Everything in Free</Li>
              {p.features.filter((f) => FEATURE_COPY[f]).map((f) => (
                <Li key={f}>{FEATURE_COPY[f]}</Li>
              ))}
              <Li>One payment. No auto-renewal.</Li>
            </ul>
            <PlanButton plan={p} enabled={enabled} signedIn={signedIn} ready={ready} variant={p.badge === "RECOMMENDED" ? "primary" : "secondary"} extend={me?.tier === "PLUS"} />
          </Card>
        ))}
      </div>

      {!enabled ? (
        <p className="text-sm text-fg-muted" role="note">
          {apiEnabled() ? "Payments are not open yet. Everything in Free works today." : "Demo build: checkout is switched off."}
        </p>
      ) : null}
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-fg" />
      <span>{children}</span>
    </li>
  );
}

export function PlanButton({
  plan,
  enabled,
  signedIn,
  ready,
  variant,
  extend = false,
}: {
  plan: BillingPlan;
  enabled: boolean;
  signedIn: boolean;
  ready: boolean;
  variant: "primary" | "secondary";
  extend?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(newId);

  if (ready && !signedIn) {
    return (
      <ButtonLink href={`/login/?next=${encodeURIComponent("/pricing/")}`} variant={variant} className="mt-6 w-full">
        Sign in to buy
      </ButtonLink>
    );
  }

  async function buy() {
    setBusy(true);
    setError(null);
    track("checkout_start", { plan: plan.code });
    try {
      const order = await createOrder({ client_request_id: requestId, plan_code: plan.code });
      const r = await openCheckout(order, { description: `${plan.name} · ${plan.duration_days} days` });
      if (r === "submitted") {
        track("checkout_submitted", { plan: plan.code });
        router.push(`/billing/success/?order=${order.order_id}`);
      } else {
        track("checkout_dismissed", { plan: plan.code });
        router.push(`/billing/cancelled/?order=${order.order_id}`);
      }
    } catch (e) {
      setError(
        isApiError(e) && e.code === "FORBIDDEN"
          ? "This offer is only for a first purchase on a new account."
          : isApiError(e) && e.code === "SERVICE_UNAVAILABLE"
            ? "Payments are unavailable right now. Nothing was charged. Please try again later."
            : e instanceof Error && e.message.startsWith("Could not load")
              ? e.message
              : "Something went wrong before payment. Nothing was charged.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <Button variant={variant} className="w-full" disabled={!enabled || busy || !ready} onClick={() => void buy()} aria-busy={busy}>
        {busy ? "Opening checkout…" : extend ? `Add ${plan.duration_days} days` : `Get ${plan.name.replace(/^Plus /, "")}`}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

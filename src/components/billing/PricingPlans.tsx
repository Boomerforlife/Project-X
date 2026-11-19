"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BillingMe, BillingPlan, BillingPlans } from "@projectx/contracts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { billingMe, createOrder, formatInr } from "@/lib/api/billing";
import { apiEnabled } from "@/lib/api/env";
import { isApiError } from "@/lib/api/errors";
import { verifyPayment } from "@/lib/api/monetization";
import { openCheckout } from "@/lib/billing/checkout";
import { track } from "@/lib/analytics";
import type { CompareGroup } from "@/lib/billing/compare";
import { cn } from "@/lib/cn";
import { useAuthStatus } from "@/lib/session/store";
import { PlusBadge } from "./PlusBadge";

const BADGE: Record<NonNullable<BillingPlan["badge"]>, string> = {
  RECOMMENDED: "Recommended",
  BEST_VALUE: "Best value",
  LAUNCH: "Launch offer",
};

/** Passes are one-time, so they are named by length ("90 days"), never "Monthly" / "Quarterly" (those read as renewals). */
export function passLength(days: number): string {
  if (days === 365 || days === 366) return "1 year";
  return `${days} days`;
}

/** Whole rupees per 30 days, for comparing passes ("about ₹50 a month"). */
function perMonthRupees(p: BillingPlan): number {
  return Math.round((p.price_paise / 100 / p.duration_days) * 30);
}

/** Saving per day against the shortest paid pass, in whole percent (server prices, nothing invented). */
export function savingPercent(p: BillingPlan, base: BillingPlan | undefined): number {
  if (!base || base.code === p.code) return 0;
  const pct = Math.round((1 - p.price_paise / p.duration_days / (base.price_paise / base.duration_days)) * 100);
  return pct >= 5 ? pct : 0;
}

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

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

export function PricingPlans({ data, groups, highlights }: { data: BillingPlans; groups: CompareGroup[]; highlights: string[] }) {
  const { me, signedIn, ready } = useBillingMe();
  const enabled = data.payments_enabled && apiEnabled();
  const paid = data.plans.filter((p) => !p.launch_only).sort((a, b) => a.duration_days - b.duration_days);
  const launch = data.plans.find((p) => p.launch_only);
  const showLaunch = !!launch && (!signedIn || !!me?.launch_eligible) && me?.tier !== "PLUS";
  const isPlus = me?.tier === "PLUS";
  const [selected, setSelected] = useState<string>(() => (paid.find((p) => p.badge === "RECOMMENDED") ?? paid[0])?.code ?? "");
  const plan = paid.find((p) => p.code === selected) ?? paid[0];
  const groupId = useId();

  useEffect(() => {
    track("pricing_view");
  }, []);

  const freeLines = groups
    .flatMap((g) => g.rows)
    .filter((r) => r.free.kind !== "no")
    .map((r) => (r.free.kind === "limited" ? `${r.feature}: ${r.free.text.charAt(0).toLowerCase()}${r.free.text.slice(1)}` : r.free.text === "Unlimited" ? `Unlimited ${r.feature.toLowerCase()}` : r.feature));

  return (
    <div className="space-y-6">
      {isPlus && me?.plus_until ? (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-plus/40 bg-plus/5 px-4 py-3 text-sm">
          <PlusBadge />
          <span>
            You have Plus until <strong>{fmtDate(me.plus_until)}</strong>. Another pass adds its days after that date.
          </span>
        </p>
      ) : null}

      {showLaunch && launch ? (
        <div className="flex flex-col gap-4 rounded-xl border border-dashed border-plus/50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-plus">{BADGE.LAUNCH}</p>
            <p className="mt-1.5 font-medium">
              Try Plus for {passLength(launch.duration_days)} at {formatInr(launch.price_paise)}
            </p>
            <p className="mt-1 text-sm text-fg-muted">For new accounts, once, on the first purchase. One payment; it does not renew.</p>
          </div>
          <div className="sm:w-56">
            <PlanButton plan={launch} enabled={enabled} signedIn={signedIn} ready={ready} variant="secondary" label={`Get ${passLength(launch.duration_days)} for ${formatInr(launch.price_paise)}`} />
          </div>
        </div>
      ) : null}

      <div className="grid items-stretch gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Free: approachable and complete for daily practice, not a crippled teaser. */}
        <section aria-labelledby="free-h" className="surface flex flex-col p-6 sm:p-7">
          <h2 id="free-h" className="font-display text-xl font-semibold">
            Free
          </h2>
          <p className="mt-1 text-sm text-fg-muted">Everything you need to practise every day.</p>
          <p className="mt-5 flex items-baseline gap-2">
            <span className="font-display text-4xl font-semibold tabular-nums">₹0</span>
            <span className="text-sm text-fg-muted">forever</span>
          </p>
          <ul className="mt-6 flex-1 space-y-2.5 text-sm">
            {freeLines.map((l) => (
              <Li key={l}>{l}</Li>
            ))}
          </ul>
          <ButtonLink href={signedIn ? "/practice/" : "/signup/"} variant="secondary" className="mt-7 w-full">
            {signedIn ? "Go to practice" : "Start practising free"}
          </ButtonLink>
        </section>

        {/* Plus: the featured plan. Elevated, accent border, pass picker, one clear action. */}
        <section aria-labelledby="plus-h" className="relative flex flex-col rounded-2xl border border-plus/50 bg-surface p-6 shadow-[0_0_0_4px_color-mix(in_srgb,var(--plus)_8%,transparent)] sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <PlusBadge size="md" />
            <h2 id="plus-h" className="font-display text-xl font-semibold">
              Tabby Plus
            </h2>
          </div>
          <p className="mt-1 text-sm text-fg-soft">Everything in Free, with more room to plan, diagnose and repeat.</p>

          {paid.length > 0 && plan ? (
            <>
              <fieldset className="mt-5">
                <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-muted">Choose a pass</legend>
                {/* Native radios inside a fieldset: arrow keys, focus and the group name come from the browser. */}
                <div className="grid gap-2 sm:grid-cols-3">
                  {paid.map((p) => {
                    const on = p.code === plan.code;
                    const save = savingPercent(p, paid[0]);
                    return (
                      <label
                        key={p.code}
                        className={cn(
                          "relative flex cursor-pointer flex-col rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-plus",
                          on ? "border-plus bg-plus/10" : "border-line hover:border-line-strong",
                        )}
                      >
                        <input type="radio" name={`${groupId}-pass`} value={p.code} checked={on} onChange={() => setSelected(p.code)} className="sr-only" />
                        <span className="flex items-center justify-between gap-2 text-sm font-medium">
                          {passLength(p.duration_days)}
                          <span aria-hidden className={cn("size-3 rounded-full border", on ? "border-plus bg-plus" : "border-line-strong")} />
                        </span>
                        <span className="mt-1 font-display text-2xl font-semibold tabular-nums">{formatInr(p.price_paise)}</span>
                        <span className="text-xs text-fg-muted">{p.duration_days > 31 ? `about ₹${perMonthRupees(p)} a month` : "one month"}</span>
                        {p.badge || save ? (
                          <span className="mt-2 flex flex-wrap gap-1">
                            {p.badge ? <span className="rounded-sm bg-fg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bg">{BADGE[p.badge]}</span> : null}
                            {save ? <span className="rounded-sm border border-plus/50 px-1.5 py-0.5 text-[10px] font-semibold text-plus">Save {save}%</span> : null}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <h3 className="mt-6 text-xs font-medium uppercase tracking-wider text-fg-muted">What Plus adds</h3>
              <ul className="mt-3 flex-1 space-y-2.5 text-sm">
                {highlights.map((h) => (
                  <Li key={h} plus>
                    {h}
                  </Li>
                ))}
              </ul>

              <div className="mt-7">
                <PlanButton
                  plan={plan}
                  enabled={enabled}
                  signedIn={signedIn}
                  ready={ready}
                  variant="plus"
                  label={isPlus ? `Add ${passLength(plan.duration_days)} for ${formatInr(plan.price_paise)}` : `Get Plus for ${formatInr(plan.price_paise)}`}
                />
                <p className="mt-2 text-center text-xs text-fg-muted">
                  One payment for {passLength(plan.duration_days)}. No auto-renewal. Secure checkout by Razorpay.
                </p>
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm text-fg-muted">Plus passes are not on sale right now.</p>
          )}
        </section>
      </div>

      {!enabled ? (
        <p className="text-sm text-fg-muted" role="note">
          {apiEnabled() ? "Payments are not open yet. Everything in Free works today." : "Demo build: checkout is switched off."}
        </p>
      ) : null}
    </div>
  );
}

function Li({ children, plus = false }: { children: React.ReactNode; plus?: boolean }) {
  return (
    <li className="flex gap-2.5">
      {plus ? (
        <svg aria-hidden viewBox="0 0 8 8" className="mt-1 size-2.5 shrink-0 text-plus" shapeRendering="crispEdges" fill="currentColor">
          <path d="M3 0h2v3h3v2H5v3H3V5H0V3h3z" />
        </svg>
      ) : (
        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-fg-muted" />
      )}
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
  label,
}: {
  plan: BillingPlan;
  enabled: boolean;
  signedIn: boolean;
  ready: boolean;
  variant: "primary" | "secondary" | "plus";
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Created on first click (not during render: prerendering forbids random values). Reused for retries of this checkout,
  // and reset when the student picks a different pass (the server rejects one request id for two plans).
  const requestId = useRef<{ plan: string; id: string } | null>(null);

  if (ready && !signedIn) {
    return (
      <ButtonLink href={`/login/?next=${encodeURIComponent("/pricing/")}`} variant={variant} size="lg" className="w-full">
        Sign in to get Plus
      </ButtonLink>
    );
  }

  async function buy() {
    setBusy(true);
    setError(null);
    track("checkout_start", { plan: plan.code });
    try {
      if (requestId.current?.plan !== plan.code) requestId.current = { plan: plan.code, id: crypto.randomUUID() };
      const order = await createOrder({ client_request_id: requestId.current.id, plan_code: plan.code });
      let verifying: Promise<unknown> | null = null;
      const r = await openCheckout(order, {
        description: `Tabby Plus · ${passLength(plan.duration_days)}`,
        // Server-side verification (signature + Razorpay's record). Failure is fine: the webhook still completes it.
        onPayment: (p) => {
          verifying = verifyPayment(order.order_id, p).catch(() => undefined);
        },
      });
      if (r === "submitted") {
        track("checkout_submitted", { plan: plan.code });
        if (verifying) await Promise.race([verifying, new Promise((res) => setTimeout(res, 8000))]);
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
    <div>
      <Button variant={variant} size="lg" className="w-full" disabled={!enabled || busy || !ready} onClick={() => void buy()} aria-busy={busy}>
        {busy ? "Opening checkout…" : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";
/**
 * One clearly labelled ad unit at a page end or between list rows. Renders nothing unless every gate passes:
 * server eligibility (free tier), the placement's allowed routes, the page and session budgets, and a configured
 * AdSense unit. Lazy: the AdSense script and the request start only when the slot is near the viewport. A slot takes
 * up no space (no label, rule or empty box) until it is likely to fill: height is reserved once the request is made,
 * the label and rule appear only when an ad actually rendered, and unfilled, blocked or timed-out slots collapse. Below each unit a quiet "Go ad-free" line points to Plus. No ad is ever placed between a
 * question's options or inside a solution (the practice-session unit sits below the question tools).
 *
 * Mock data / NEXT_PUBLIC_ADS=test without unit ids: a dashed preview box marks where the unit would go.
 */
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ADS_CONFIG, adsenseReady } from "@/lib/ads/config";
import { loadAdSense } from "@/lib/ads/loaders";
import { PLACEMENTS, canShowDisplay, infeedPositions, placementAllowed, type PlacementId } from "@/lib/ads/policy";
import { DATA_SOURCE } from "@/lib/site";
import { cn } from "@/lib/cn";
import { useAds } from "./AdsProvider";
import { useNoAds } from "./NoAds";

type Phase = "off" | "preview" | "pending" | "requested" | "filled" | "hidden";

const MIN_HEIGHT: Record<"display" | "infeed" | "multiplex", string> = {
  display: "min-h-[100px] md:min-h-[120px]",
  infeed: "min-h-[110px]",
  multiplex: "min-h-[280px]",
};

export function AdSlot({ placement, className }: { placement: PlacementId; className?: string }) {
  const ads = useAds();
  const noAds = useNoAds();
  const [phase, setPhase] = useState<Phase>("off");
  const box = useRef<HTMLDivElement>(null);
  const ins = useRef<HTMLModElement>(null);
  const format = PLACEMENTS[placement].format;
  const { ready, eligible, claim, release, session, policy } = ads;

  // Gate + reserve a slot of this page's budget.
  useEffect(() => {
    if (!ready || !eligible || noAds) return;
    if (!placementAllowed(placement, window.location.pathname)) return;
    if (!canShowDisplay(session(), policy)) return;
    const real = adsenseReady(format);
    const preview = !real && (ADS_CONFIG.mode === "test" || DATA_SOURCE === "mock");
    if (!real && !preview) return;
    if (!claim()) return;
    let live = true;
    // Async on purpose: the slot is reserved here (a side effect), the render follows on the next tick.
    void Promise.resolve().then(() => live && setPhase(real ? "pending" : "preview"));
    return () => {
      live = false;
      release();
      setPhase("off");
    };
  }, [ready, eligible, noAds, placement, format, claim, release, session, policy]);

  // Lazy request when near the viewport.
  useEffect(() => {
    if (phase !== "pending" || !box.current) return;
    const el = box.current;
    let done = false;
    const go = async () => {
      if (done) return;
      done = true;
      io.disconnect();
      if (!(await loadAdSense())) return setPhase("hidden");
      try {
        (window.adsbygoogle = window.adsbygoogle || ([] as unknown as NonNullable<Window["adsbygoogle"]>)).push({});
        setPhase("requested");
      } catch {
        setPhase("hidden");
      }
    };
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && void go(), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [phase]);

  // Collapse unfilled units; count filled ones toward the session cap.
  useEffect(() => {
    if (phase !== "requested" || !ins.current) return;
    const el = ins.current;
    const check = () => {
      const s = el.getAttribute("data-ad-status");
      if (s === "unfilled") setPhase("hidden");
      else if (s === "filled") {
        setPhase("filled");
        ads.noteDisplay();
      }
    };
    const mo = new MutationObserver(check);
    mo.observe(el, { attributes: true, attributeFilter: ["data-ad-status"] });
    check();
    // No status and nothing rendered after a while (blocked, throttled): give the space back.
    const giveUp = window.setTimeout(() => {
      if (!el.getAttribute("data-ad-status") && el.childElementCount === 0) setPhase("hidden");
    }, 10_000);
    return () => {
      mo.disconnect();
      window.clearTimeout(giveUp);
    };
  }, [phase, ads]);

  if (phase === "off" || phase === "hidden") return null;
  // Label, rule and spacing only once there is something to label; until then the slot is a zero-height anchor.
  const visible = phase === "filled" || phase === "preview";

  const label = <p className="mb-2 text-[0.6875rem] uppercase tracking-wider text-muted">Advertisement</p>;
  // Shown once the unit has rendered (or while it loads), never on a collapsed slot.
  const upsell = ads.entitlements?.payments_enabled !== false && visible && (
    <p className="mt-2 flex flex-wrap items-center justify-end gap-x-1.5 text-xs text-fg-muted">
      <span>Tired of ads?</span>
      <Link href="/pricing/?ref=ad" className="font-medium text-fg underline-offset-2 hover:underline">
        Go ad-free with Plus →
      </Link>
    </p>
  );

  return (
    // Generous spacing and a rule above keep the unit visually separate from buttons and rows (no accidental taps).
    <aside
      aria-label={visible ? "Advertisement" : undefined}
      aria-hidden={visible ? undefined : true}
      data-ad-placement={placement}
      className={cn(visible ? "my-8 border-t border-line pt-3" : phase === "requested" ? "my-8" : "", className)}
    >
      {visible && label}
      <div ref={box}>
        {phase === "preview" ? (
          <div className={cn("grid place-items-center rounded-md border border-dashed border-line text-xs text-muted", MIN_HEIGHT[format])}>
            Ad placement preview · {placement} ({format})
          </div>
        ) : (
          <ins
            ref={ins}
            className={cn("adsbygoogle block", phase !== "pending" && MIN_HEIGHT[format])}
            style={{ display: "block" }}
            data-ad-client={ADS_CONFIG.client}
            data-ad-slot={ADS_CONFIG.slots[format]}
            {...(format === "display" ? { "data-ad-format": "auto", "data-full-width-responsive": "true" } : {})}
            {...(format === "infeed" ? { "data-ad-format": "fluid", "data-ad-layout-key": ADS_CONFIG.slots.infeedLayoutKey } : {})}
            {...(format === "multiplex" ? { "data-ad-format": "autorelaxed" } : {})}
            {...(ADS_CONFIG.mode === "test" ? { "data-adtest": "on" } : {})}
          />
        )}
      </div>
      {upsell}
    </aside>
  );
}

/**
 * Where to put in-feed units in a list of `rows` items: indexes after which a unit goes, or [] when no unit would
 * render (ads off, Plus, wrong page, not configured). Lists only split into chunks when an ad will really be there.
 * `every` overrides the policy spacing (e.g. 1 = between groups/sections).
 */
export function useInfeedPositions(rows: number, placement: PlacementId, opts: { every?: number; max?: number } = {}): number[] {
  const ads = useAds();
  const noAds = useNoAds();
  const path = useSyncExternalStore(noopSubscribe, () => window.location.pathname, () => null);
  if (!ads.ready || !ads.eligible || noAds || path === null || !placementAllowed(placement, path)) return [];
  const format = PLACEMENTS[placement].format;
  if (!adsenseReady(format) && !(ADS_CONFIG.mode === "test" || DATA_SOURCE === "mock")) return [];
  const policy = opts.every
    ? { ...ads.policy, infeedEvery: { mobile: opts.every, desktop: opts.every }, infeedMaxPerList: opts.max ?? ads.policy.infeedMaxPerList }
    : ads.policy;
  return infeedPositions(rows, policy, ads.device);
}

const noopSubscribe = () => () => {};

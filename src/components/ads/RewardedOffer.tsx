"use client";
/**
 * Optional rewarded ad: "watch one short ad for one extra full paper this month". Opt-in only, always with a way out
 * (No thanks / keep practising / go ad-free). The reward is granted by the server, and only when Google's ad tag reported
 * the reward (rewardedSlotGranted) for a nonce the server issued when the student pressed "Watch". Closing the ad early
 * is always allowed: Google's ad player shows its own close / skip control and timer; we never add a fake one, never
 * delay it, and never claim a reward that was not earned.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RewardOffer } from "@projectx/contracts";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";
import { rewardedUnit } from "@/lib/ads/config";
import { showRewarded, type RewardedOutcome } from "@/lib/ads/loaders";
import { rewardedBlock } from "@/lib/ads/policy";
import { claimReward, rewardOffers, startReward } from "@/lib/api/monetization";
import { useAuthStatus } from "@/lib/session/store";
import { useAds } from "./AdsProvider";

type Phase = "idle" | "starting" | "loading" | "playing" | "claiming" | "done" | "dismissed";

const RESULT: Record<string, string> = {
  GRANTED: "Done. One extra full paper has been added for this month.",
  CLOSED: "The ad was closed before the end, so there's no reward this time. That's completely fine.",
  NO_FILL: "No ad is available right now. Nothing was charged against you; you can try again later.",
  ERROR: "The ad couldn't load (an ad blocker or a slow connection can cause this). Everything else works as normal.",
  TOO_FAST: "That ad finished unusually fast, so it couldn't be counted. You can try again in a little while.",
  EXPIRED: "That took too long to confirm. Please try again.",
  CAP_REACHED: "You've already used the ad rewards available for now.",
  ALREADY_USED: "That ad was already counted.",
  PLUS: "You're on Plus, so there's no limit to lift.",
};

export function RewardedOffer({ code = "extra_full_paper", onGranted }: { code?: string; onGranted?: () => void }) {
  const ads = useAds();
  const { status } = useAuthStatus();
  const [offer, setOffer] = useState<RewardOffer | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [paced, setPaced] = useState<ReturnType<typeof rewardedBlock>>(null);
  const cancelled = useRef(false);
  const unit = rewardedUnit();
  const enabled = ads.ready && !!ads.entitlements?.ads.rewarded_enabled && !!unit && status === "ready";

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    rewardOffers()
      .then((r) => {
        if (!live) return;
        setOffer(r.offers.find((o) => o.code === code) ?? null);
        setPaced(rewardedBlock(ads.session(), Date.now(), ads.policy));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled, code, ads]);

  // Re-check pacing after the minimum interval (the button re-enables on its own).
  useEffect(() => {
    if (paced !== "TOO_SOON") return;
    const t = window.setTimeout(() => setPaced(rewardedBlock(ads.session(), Date.now(), ads.policy)), ads.policy.rewardedMinIntervalSec * 1000 + 500);
    return () => window.clearTimeout(t);
  }, [paced, ads]);

  if (!enabled || !offer || phase === "dismissed") return null;
  if (!offer.available && phase === "idle") {
    if (offer.reason !== "DAILY_CAP" && offer.reason !== "MONTHLY_CAP") return null;
    return (
      <p className="mt-4 text-sm text-fg-muted" role="status">
        {offer.reason === "DAILY_CAP" ? "You've used today's ad reward. It's available again tomorrow." : "You've used this month's ad rewards."}
      </p>
    );
  }

  async function watch() {
    if (!unit) return;
    cancelled.current = false;
    setMessage(null);
    setPhase("starting");
    let nonce: string;
    try {
      nonce = (await startReward(code)).nonce;
    } catch {
      setPhase("done");
      setMessage("Couldn't start the ad right now. Please try again later.");
      return;
    }
    ads.noteRewardedStart();
    setPhase("loading");
    let outcome: RewardedOutcome = await showRewarded(unit, { onVisible: () => setPhase("playing") });
    if (cancelled.current && outcome === "GRANTED") outcome = "CLOSED";
    setPhase("claiming");
    try {
      const r = await claimReward({ nonce, outcome: cancelled.current ? "CLOSED" : outcome });
      setOffer(r.offer);
      setMessage(r.status === "GRANTED" ? RESULT.GRANTED! : RESULT[r.reason ?? outcome] ?? RESULT.ERROR!);
      if (r.status === "GRANTED") {
        ads.refresh();
        onGranted?.();
      }
    } catch {
      setMessage("We couldn't confirm the reward. If the ad finished, please check again in a minute.");
    }
    setPhase("done");
    setPaced(rewardedBlock(ads.session(), Date.now(), ads.policy));
  }

  const busy = phase === "starting" || phase === "loading" || phase === "playing" || phase === "claiming";
  return (
    <Card className="mt-6 p-5" role="region" aria-label="Optional: watch an ad for a reward">
      <h3 className="font-display text-base font-semibold">{offer.label}</h3>
      <p className="mt-1 text-sm text-fg-muted">
        {offer.description} Up to {offer.daily_cap} a day and {offer.monthly_cap} a month.
      </p>
      <p className="mt-3 min-h-5 text-sm" role="status" aria-live="polite">
        {phase === "starting" && "Preparing the ad…"}
        {phase === "loading" && "Loading the ad… if nothing is available we'll tell you."}
        {phase === "playing" && "The ad is playing. You can close it at any time (you'd just skip the reward)."}
        {phase === "claiming" && "Checking the reward…"}
        {phase === "done" && message}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {phase !== "done" || offer.available ? (
          <Button onClick={() => void watch()} disabled={busy || !offer.available || paced !== null} variant="secondary">
            {busy ? "Please wait…" : paced === "TOO_SOON" ? "Available again in a minute" : "Watch a short ad"}
          </Button>
        ) : null}
        {phase === "loading" && (
          <Button variant="ghost" onClick={() => (cancelled.current = true)}>
            Cancel
          </Button>
        )}
        {!busy && (
          <Button variant="ghost" onClick={() => setPhase("dismissed")}>
            No thanks
          </Button>
        )}
        {ads.entitlements?.payments_enabled && (
          <Link href="/pricing/" className="text-sm text-fg-muted underline-offset-2 hover:underline">
            Go ad-free with Plus
          </Link>
        )}
      </div>
    </Card>
  );
}

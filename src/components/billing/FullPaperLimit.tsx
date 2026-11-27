"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { RewardedOffer } from "@/components/ads/RewardedOffer";
import { ButtonLink } from "@/components/ui/Button";
import { PlusLock } from "./PlusLock";

export function FullPaperLimit() {
  const p = useSearchParams();
  const limit = Number(p.get("limit") ?? 2);
  const used = Number(p.get("used") ?? limit);
  const resets = p.get("resets") ?? "";
  const [granted, setGranted] = useState(false);
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <PlusLock used={used} limit={limit} resetsOn={/^\d{4}-\d{2}-\d{2}$/.test(resets) ? resets : new Date().toISOString().slice(0, 10)} />
      {/* Optional, only when rewarded ads are switched on and configured; renders nothing otherwise. */}
      <RewardedOffer onGranted={() => setGranted(true)} />
      {granted && (
        <ButtonLink href="/jee/pyq/" className="mt-4">
          Choose your paper
        </ButtonLink>
      )}
    </div>
  );
}

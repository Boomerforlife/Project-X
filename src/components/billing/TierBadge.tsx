"use client";
/**
 * Free / Plus indicator for the app header. Comes from the server's entitlements (never inferred client-side).
 * Free users see a quiet "Free · Upgrade" link only while payments are switched on (no upsell for something unbuyable).
 */
import Link from "next/link";
import { useAds } from "@/components/ads/AdsProvider";
import { cn } from "@/lib/cn";

const until = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function TierBadge({ className }: { className?: string }) {
  const { ready, entitlements: e } = useAds();
  if (!ready || !e) return null;
  if (e.tier === "PLUS") {
    return (
      <Link
        href="/account/"
        title={e.plus_until ? `Tabby Plus until ${until(e.plus_until)}` : "Tabby Plus"}
        className={cn("pixel-corners inline-flex h-7 items-center bg-review/15 px-2 text-xs font-semibold uppercase tracking-wider text-review", className)}
      >
        Plus
      </Link>
    );
  }
  if (!e.payments_enabled) return null;
  return (
    <Link href="/pricing/" className={cn("inline-flex h-7 items-center rounded-md border border-line px-2 text-xs text-fg-muted hover:border-fg hover:text-fg", className)}>
      Free · Upgrade
    </Link>
  );
}

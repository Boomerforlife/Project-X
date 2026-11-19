"use client";
import { usePathname } from "next/navigation";
import { AdSlot } from "./AdSlot";

/**
 * The (site) layout persists across client navigations, so its ad unit is keyed by path: it remounts per page and the
 * placement rules are re-checked (a unit from /jee/... must never linger on /pricing/).
 */
export function SiteContentAd() {
  const path = usePathname() ?? "";
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <AdSlot key={path} placement="content-bottom" />
    </div>
  );
}

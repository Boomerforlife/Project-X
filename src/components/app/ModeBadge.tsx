import { DemoBadge as BaseBadge } from "@/components/ui/Primitives";
import { DATA_SOURCE } from "@/lib/site";

/**
 * "Demo" chip for mock mode. In API mode real data is on screen, so it renders
 * nothing, except for genuinely demo-only surfaces (flagged papers) via `force`.
 */
export function DemoBadge({ force = false, className, children }: { force?: boolean; className?: string; children?: React.ReactNode }) {
  if (DATA_SOURCE === "api" && !force) return null;
  return <BaseBadge className={className}>{children}</BaseBadge>;
}

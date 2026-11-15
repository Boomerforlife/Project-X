/**
 * Legacy pose API, kept so existing call sites stay small. It renders the one
 * shared character from `components/mascot`; prefer `<TabbyMascot state=… />`
 * in new code.
 *
 * Rules (CLAUDE.md §11): the kitty never speaks, never appears in CBT, and
 * animation respects prefers-reduced-motion.
 */
import { BODY, HEAD, TAIL } from "@/components/mascot/geometry";
import type { KittyCosmetic, MascotState } from "@/components/mascot/mascot-types";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";

type Pose = "sit" | "sleep" | "lost";

const POSE_STATE: Record<Pose, MascotState> = { sit: "idle", sleep: "sleeping", lost: "curious" };

export type { KittyCosmetic };

export function Kitty({
  pose = "sit",
  animated = false,
  className,
  title,
  cosmetic = null,
}: {
  pose?: Pose;
  animated?: boolean;
  className?: string;
  /** Provide only when the image carries meaning; otherwise it is decorative. */
  title?: string;
  cosmetic?: KittyCosmetic | null;
}) {
  return <TabbyMascot state={POSE_STATE[pose]} animated={animated} className={className} label={title} cosmetic={cosmetic} />;
}

/** Simplified face mark derived from the same geometry (navbar, compact UI). */
export function KittyMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="72 82 342 228"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={HEAD} fill="currentColor" />
      <g fill="var(--kitty-eye, #000)">
        <rect x="123" y="189" width="24" height="52" rx="5" />
        <rect x="209" y="189" width="25" height="52" rx="5" />
      </g>
    </svg>
  );
}

export const KITTY_PATHS = { BODY, TAIL, HEAD };

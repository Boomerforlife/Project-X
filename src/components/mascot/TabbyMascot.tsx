import { cn } from "@/lib/cn";
import "./mascot-animations.css";
import { TabbyCharacter } from "./TabbyCharacter";
import type { KittyCosmetic, MascotState } from "./mascot-types";

/**
 * The animated Tabby mascot. Server-safe (no hooks); all motion is CSS.
 *
 * Rules (CLAUDE.md §11): the kitty never speaks, never interrupts, and never
 * appears in the CBT exam shell. Motion is off under prefers-reduced-motion,
 * where each state falls back to its static pose.
 *
 *   <TabbyMascot state="loading" size={96} />
 *   <TabbyMascot state="confused" label="A confused cat" className="h-32" />
 */
export function TabbyMascot({
  state = "idle",
  animated = true,
  size,
  className,
  label,
  cosmetic = null,
}: {
  state?: MascotState;
  /** false renders the state's static pose with no motion. */
  animated?: boolean;
  /** Rendered height in px. Alternatively size it with a height class. */
  size?: number;
  className?: string;
  /** Accessible name. Omit when the mascot is decorative (most of the time). */
  label?: string;
  cosmetic?: KittyCosmetic | null;
}) {
  return (
    <svg
      viewBox={cosmetic === "crown" ? "70 50 430 430" : "70 80 430 400"}
      data-state={state}
      data-motion={animated ? "on" : "off"}
      className={cn("tabby-mascot w-auto", className)}
      style={size ? { height: size } : undefined}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      focusable="false"
    >
      <TabbyCharacter state={state} cosmetic={cosmetic} />
    </svg>
  );
}

export type { KittyCosmetic, MascotState } from "./mascot-types";

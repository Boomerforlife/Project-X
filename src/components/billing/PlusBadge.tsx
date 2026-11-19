import { cn } from "@/lib/cn";

/**
 * The one Tabby Plus mark: pixel-cornered, Plus accent, small caps. Use it wherever a feature or plan is Plus, so
 * Premium reads the same everywhere (pricing, plan, library, header). Decorative text only; pair it with words.
 */
export function PlusBadge({ className, label = "Plus", size = "sm" }: { className?: string; label?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "pixel-corners inline-flex shrink-0 items-center gap-1 bg-plus/15 font-pixel uppercase tracking-wider text-plus",
        size === "md" ? "h-7 px-2.5 text-[11px]" : "h-5 px-1.5 text-[9px]",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 8 8" className={size === "md" ? "size-2.5" : "size-2"} shapeRendering="crispEdges" fill="currentColor">
        <path d="M3 0h2v3h3v2H5v3H3V5H0V3h3z" />
      </svg>
      {label}
    </span>
  );
}

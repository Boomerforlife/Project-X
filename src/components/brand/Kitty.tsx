/**
 * Kitty mascot — vector trace of the canonical reference at
 * `assets/mascot-reference.jpg` (554×541). Geometry is traced 1:1 from that
 * image; do not redraw the silhouette freehand. Alternate poses only change the
 * eyes/tail so the identity stays intact.
 *
 * Rules (CLAUDE.md §11): the kitty never speaks, never appears in CBT, and
 * animation must respect prefers-reduced-motion (handled in globals.css).
 */

type Pose = "sit" | "sleep" | "lost";

const BODY =
  "M80 126 Q80 116 88 110 L113 92 Q120 87 126 93 L146 124 L398 106 Q410 105 406 117 L330 297 Q328 302 322 302 L296 302 L362 452 Q368 470 352 470 L152 470 Q138 470 138 456 L138 302 L94 302 Q80 302 80 288 Z";

const TAIL =
  "M481 318 C472 296 440 291 414 299 C387 308 378 336 398 354 C418 372 462 378 473 409 C482 438 458 458 428 458 C408 458 388 454 372 446";

/** Head-only silhouette for compact marks (favicon, navbar). */
const HEAD =
  "M80 126 Q80 116 88 110 L113 92 Q120 87 126 93 L146 124 L398 106 Q410 105 406 117 L330 297 Q328 302 322 302 L94 302 Q80 302 80 288 Z";

function Eyes({ pose }: { pose: Pose }) {
  if (pose === "sleep") {
    return (
      <g fill="var(--kitty-eye, #000)">
        <rect x="120" y="214" width="30" height="9" rx="4.5" />
        <rect x="206" y="214" width="30" height="9" rx="4.5" />
      </g>
    );
  }
  // "lost" glances sideways: same eyes, shifted toward the left edge.
  const dx = pose === "lost" ? -14 : 0;
  return (
    <g className="kitty-eyes" fill="var(--kitty-eye, #000)">
      <rect x={123 + dx} y="189" width="21" height="49" rx="5" />
      <rect x={209 + dx} y="189" width="22" height="49" rx="5" />
    </g>
  );
}

export type KittyCosmetic = "glasses" | "scarf" | "bowtie" | "crown";

/** Cosmetic unlocks, drawn in the kitty's own coordinate space so they never distort its identity. */
function Cosmetic({ id }: { id: KittyCosmetic }) {
  if (id === "glasses") {
    return (
      <g fill="none" stroke="var(--kitty-eye, #000)" strokeWidth="9" strokeLinecap="round">
        <circle cx="133.5" cy="213.5" r="36" />
        <circle cx="220" cy="213.5" r="36" />
        <path d="M169.5 210h14.5M97.5 205 84 198" />
      </g>
    );
  }
  if (id === "scarf") {
    return (
      <g fill="var(--review)">
        <path d="M120 286h204l-6 30H126z" />
        <path d="M262 312h34l14 74-30 6z" />
        <path d="M136 296h12v14h-12zM172 296h12v14h-12zM208 296h12v14h-12zM244 296h12v14h-12zM280 296h12v14h-12z" fill="var(--kitty-eye, #000)" opacity="0.35" />
      </g>
    );
  }
  if (id === "bowtie") {
    return (
      <g fill="var(--kitty-eye, #000)">
        <path d="M216 322 178 300v44zM216 322l38-22v44z" />
        <rect x="204" y="310" width="24" height="24" rx="4" />
      </g>
    );
  }
  return <path d="M148 120V72l26 22 26-34 26 34 26-22v42z" fill="var(--mathematics)" />;
}

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
  return (
    <svg
      viewBox={cosmetic === "crown" ? "70 50 430 430" : "70 80 430 400"}
      className={[animated ? "kitty-animated" : "", className].filter(Boolean).join(" ")}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={BODY} fill="currentColor" />
      <Eyes pose={pose} />
      <path
        className="kitty-tail"
        d={TAIL}
        fill="none"
        stroke="currentColor"
        strokeWidth="15"
        strokeLinecap="round"
      />
      {cosmetic && <Cosmetic id={cosmetic} />}
    </svg>
  );
}

/** Simplified face mark derived from the same geometry. */
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

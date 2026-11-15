import { BODY_SHAPE, EAR_L, EAR_R, EYE_L, EYE_R, HEAD_SHAPE, QUESTION_PIXELS, TAIL } from "./geometry";
import type { KittyCosmetic, MascotState } from "./mascot-types";

/**
 * The mascot as a layered SVG. Pure markup, no hooks: every motion lives in
 * `mascot-animations.css`, keyed off the `data-state` attribute that
 * `TabbyMascot` sets on the root <svg>. Each part is its own element so the
 * head, ears, eyes and tail can move independently.
 */
export function TabbyCharacter({ state, cosmetic }: { state: MascotState; cosmetic: KittyCosmetic | null }) {
  const asleep = state === "sleeping";
  return (
    <g className="tm-cat">
      <path className="tm-tail" d={TAIL} fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="round" />
      <path d={BODY_SHAPE} fill="currentColor" />

      <g className="tm-head">
        <path className="tm-ear tm-ear-l" d={EAR_L} fill="currentColor" />
        <path d={HEAD_SHAPE} fill="currentColor" />
        <path className="tm-ear tm-ear-r" d={EAR_R} fill="currentColor" />
        {asleep ? (
          <g fill="var(--kitty-eye, #000)">
            <rect x="120" y="214" width="30" height="9" rx="4.5" />
            <rect x="206" y="214" width="30" height="9" rx="4.5" />
          </g>
        ) : (
          <g className="tm-eyes" fill="var(--kitty-eye, #000)">
            <g className="tm-eye">
              <rect className="tm-iris" {...EYE_L} rx="5" />
            </g>
            <g className="tm-eye">
              <rect className="tm-iris" {...EYE_R} rx="5" />
            </g>
          </g>
        )}
        {(cosmetic === "glasses" || cosmetic === "crown") && <Cosmetic id={cosmetic} />}
      </g>
      {/* Neckwear sits over the chin, as in the original drawing order. */}
      {(cosmetic === "scarf" || cosmetic === "bowtie") && <Cosmetic id={cosmetic} />}

      {state === "confused" && (
        <g className="tm-question" fill="currentColor">
          {QUESTION_PIXELS.map(([c, r]) => (
            <rect key={`${c}-${r}`} x={428 + c * 10} y={92 + r * 10} width="10" height="10" />
          ))}
        </g>
      )}

      {state === "disconnected" && (
        <g className="tm-signal">
          <rect className="tm-bar tm-bar-1" x="432" y="194" width="12" height="18" rx="2" fill="currentColor" />
          <rect className="tm-bar tm-bar-2" x="450" y="178" width="12" height="34" rx="2" fill="currentColor" />
          <rect className="tm-bar tm-bar-3" x="468" y="162" width="12" height="50" rx="2" fill="currentColor" />
          <rect className="tm-signal-dot" x="432" y="170" width="12" height="12" fill="var(--review)" />
        </g>
      )}

      {state === "success" && (
        <g className="tm-sparkles" fill="var(--review)">
          <rect className="tm-spark" x="52" y="96" width="8" height="8" />
          <rect className="tm-spark" x="428" y="86" width="8" height="8" />
          <rect className="tm-spark" x="448" y="132" width="6" height="6" />
        </g>
      )}
    </g>
  );
}

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

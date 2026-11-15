/**
 * Mascot geometry — vector trace of the canonical reference at
 * `assets/mascot-reference.jpg` (554×541). Traced 1:1; never redraw the
 * silhouette freehand.
 *
 * The animated character splits the trace into parts that overlap at rest, so
 * the union is pixel-identical to the original silhouette:
 *   - HEAD_SHAPE  the head with the left ear cut away (flat top-left corner)
 *   - EAR_L       the left ear, with a base that sinks into the head
 *   - EAR_R       a copy of the top-right corner, drawn over the head; it only
 *                 ever rotates upward (a twitch) so the silhouette never shrinks
 *   - BODY_SHAPE  the body, extended 16 units up under the head so a head tilt
 *                 never opens a gap at the neck
 */

/** Original single-piece silhouette (head + body). Used by the OG image. */
export const BODY =
  "M80 126 Q80 116 88 110 L113 92 Q120 87 126 93 L146 124 L398 106 Q410 105 406 117 L330 297 Q328 302 322 302 L296 302 L362 452 Q368 470 352 470 L152 470 Q138 470 138 456 L138 302 L94 302 Q80 302 80 288 Z";

export const TAIL =
  "M481 318 C472 296 440 291 414 299 C387 308 378 336 398 354 C418 372 462 378 473 409 C482 438 458 458 428 458 C408 458 388 454 372 446";

/** Head-only silhouette for compact marks (favicon, navbar). */
export const HEAD =
  "M80 126 Q80 116 88 110 L113 92 Q120 87 126 93 L146 124 L398 106 Q410 105 406 117 L330 297 Q328 302 322 302 L94 302 Q80 302 80 288 Z";

export const HEAD_SHAPE =
  "M80 128 L146 124 L398 106 Q410 105 406 117 L330 297 Q328 302 322 302 L94 302 Q80 302 80 288 Z";

export const EAR_L = "M80 150 L80 126 Q80 116 88 110 L113 92 Q120 87 126 93 L146 124 L148 150 Z";

export const EAR_R = "M300 113 L398 106 Q410 105 406 117 L372.6 196 Z";

export const BODY_SHAPE = "M138 286 L289 286 L296 302 L362 452 Q368 470 352 470 L152 470 Q138 470 138 456 Z";

/** Open eyes (rounded bars) in the reference positions. */
export const EYE_L = { x: 123, y: 189, width: 21, height: 49 };
export const EYE_R = { x: 209, y: 189, width: 22, height: 49 };

/** A 4×6 pixel question mark, drawn beside the right ear (cells of 10 units). */
export const QUESTION_PIXELS: [number, number][] = [
  [1, 0], [2, 0],
  [0, 1], [3, 1],
  [3, 2],
  [2, 3],
  [2, 5],
];

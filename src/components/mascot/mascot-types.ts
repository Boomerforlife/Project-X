/**
 * Animation states for the Tabby mascot. Every state has a static pose (used
 * when motion is off or the user prefers reduced motion) and an optional
 * motion layer defined in `mascot-animations.css`.
 */
export const MASCOT_STATES = [
  "idle", // natural blinking, an occasional ear twitch, slow tail
  "blink", // blinking only — the quietest animated state
  "loading", // looks around, blinks, gently bobs
  "curious", // head tilted, glancing sideways
  "confused", // tilts side to side, a small pixel "?" appears
  "happy", // gentle nod and an occasional small hop
  "surprised", // eyes widen, head pulls back, brief glitch, then idle
  "error", // lowered head, half-lidded eyes, drooped ear
  "disconnected", // looks toward a weak signal and waits
  "success", // one small celebratory hop, then idle
  "sleeping", // eyes closed, slow breathing
] as const;

export type MascotState = (typeof MASCOT_STATES)[number];

export type KittyCosmetic = "glasses" | "scarf" | "bowtie" | "crown";

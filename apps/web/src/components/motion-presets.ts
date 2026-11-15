/**
 * T-711: animation settings of the visual pass, in one place. Presentation only: nothing here
 * reads a measured value, a status or any mission data, so every element animates the same way.
 * With reduced motion every preset returns "no animation".
 */

export type RevealKind = "rise" | "fade";

export interface RevealMotion {
  initial: false | { opacity: number; y?: number };
  animate: { opacity: number; y?: number };
  transition: { duration: number; ease?: "easeOut" };
}

const RISE_DISTANCE_PX = 8;
const RISE_DURATION_S = 0.22;
const FADE_DURATION_S = 0.15;

/** Entry of a card, a row or a section. `initial: false` renders the final state at once. */
export function revealMotion(kind: RevealKind, reduced: boolean): RevealMotion {
  const rise = kind === "rise";
  const final = rise ? { opacity: 1, y: 0 } : { opacity: 1 };
  if (reduced) return { initial: false, animate: final, transition: { duration: 0 } };
  return {
    initial: rise ? { opacity: 0, y: RISE_DISTANCE_PX } : { opacity: 0 },
    animate: final,
    transition: { duration: rise ? RISE_DURATION_S : FADE_DURATION_S, ease: "easeOut" },
  };
}

export interface WaveMotion {
  initial: { scale: number; opacity: number };
  animate: { scale: number[]; opacity: number[] };
  transition: { duration: number; repeat: number; ease: "easeOut" };
}

/** Expanding wave of the "in transit" marker on the body map; `null` means "draw no wave". */
export function transitWaveMotion(reduced: boolean): WaveMotion | null {
  if (reduced) return null;
  return {
    initial: { scale: 1, opacity: 0.5 },
    animate: { scale: [1, 2.2], opacity: [0.5, 0] },
    transition: { duration: 1.8, repeat: Infinity, ease: "easeOut" },
  };
}

/**
 * `useReducedMotion()` gives `null` while the preference is unknown. Unknown is treated as
 * "reduce", so nothing ever moves without a known `no-preference`.
 */
export function isReducedMotion(preference: boolean | null): boolean {
  return preference !== false;
}

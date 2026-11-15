import type { Indicator } from "@astra/contracts";

/**
 * Body zones of the outline (T-606 §3.3). The locations are illustrative only; they have no clinical meaning.
 * Coordinates are in the SVG viewBox (VIEW_WIDTH × VIEW_HEIGHT).
 */
export type BodyZoneId = "head" | "chest" | "torso" | "arm";

export interface BodyZone {
  id: BodyZoneId;
  labelKey: string;
  indicators: readonly Indicator[];
  /** Small marker on the body. */
  marker: { x: number; y: number };
  /** Where the label block starts horizontally and which side of the figure it is on. */
  label: { x: number; side: "left" | "right" };
}

export const VIEW_WIDTH = 720;
export const VIEW_HEIGHT = 440;

export const BODY_ZONES: readonly BodyZone[] = [
  {
    id: "head",
    labelKey: "pages.bodyMap.zones.head",
    indicators: ["MOOD", "SLEEP"],
    marker: { x: 360, y: 50 },
    label: { x: 240, side: "left" },
  },
  {
    id: "chest",
    labelKey: "pages.bodyMap.zones.chest",
    indicators: ["HEART_RATE", "BLOOD_PRESSURE"],
    marker: { x: 360, y: 130 },
    label: { x: 480, side: "right" },
  },
  {
    id: "torso",
    labelKey: "pages.bodyMap.zones.torso",
    indicators: ["BODY_TEMPERATURE"],
    marker: { x: 360, y: 205 },
    label: { x: 480, side: "right" },
  },
  {
    // Glucose: the usual finger-prick site. Arm on the left side of the screen.
    id: "arm",
    labelKey: "pages.bodyMap.zones.arm",
    indicators: ["BLOOD_GLUCOSE"],
    marker: { x: 291, y: 240 },
    label: { x: 240, side: "left" },
  },
];

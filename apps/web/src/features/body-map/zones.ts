import type { Indicator } from "@astra/contracts";

/**
 * Body zones of the outline (T-606 §3.3). The locations are illustrative only; they have no clinical meaning.
 * Coordinates are in the SVG viewBox. The outline itself is unchanged (x 278–442, y 20–420).
 */
export type BodyZoneId = "head" | "chest" | "torso" | "arm";

export interface BodyZone {
  id: BodyZoneId;
  labelKey: string;
  indicators: readonly Indicator[];
}

export const BODY_ZONES: readonly BodyZone[] = [
  { id: "head", labelKey: "pages.bodyMap.zones.head", indicators: ["MOOD", "SLEEP"] },
  { id: "chest", labelKey: "pages.bodyMap.zones.chest", indicators: ["HEART_RATE", "BLOOD_PRESSURE"] },
  { id: "torso", labelKey: "pages.bodyMap.zones.torso", indicators: ["BODY_TEMPERATURE"] },
  // Glucose: the usual finger-prick site. Arm on the left side of the screen.
  { id: "arm", labelKey: "pages.bodyMap.zones.arm", indicators: ["BLOOD_GLUCOSE"] },
];

/** T-606b: one marker per indicator (its color is the state of its latest record). */
export interface IndicatorPlacement {
  marker: { x: number; y: number };
  side: "left" | "right";
  /** Vertical center of the label block (wide layout only). */
  labelY: number;
}

/**
 * Two markers of the same zone are 32 units apart, so their 24-unit touch areas never overlap.
 * Three labels per side, so the blocks never overlap.
 */
export const INDICATOR_PLACEMENTS: Record<Indicator, IndicatorPlacement> = {
  MOOD: { marker: { x: 344, y: 50 }, side: "left", labelY: 50 },
  SLEEP: { marker: { x: 376, y: 50 }, side: "right", labelY: 50 },
  HEART_RATE: { marker: { x: 344, y: 130 }, side: "left", labelY: 150 },
  BLOOD_PRESSURE: { marker: { x: 376, y: 130 }, side: "right", labelY: 150 },
  BODY_TEMPERATURE: { marker: { x: 360, y: 205 }, side: "right", labelY: 255 },
  BLOOD_GLUCOSE: { marker: { x: 291, y: 240 }, side: "left", labelY: 260 },
};

export const MARKER_RADIUS = 5;
/** Invisible touch area around each marker (diameter 24 units). */
export const MARKER_HIT_RADIUS = 12;

export const VIEW_HEIGHT = 440;

/** Wide layout: outline plus a label column on each side. */
export const WIDE_VIEW = { minX: -50, width: 820 } as const;
/** Narrow layout: only the outline and its markers, no labels. */
export const NARROW_VIEW = { minX: 262, width: 196 } as const;

/** Labels: right edge of the left column and left edge of the right column. */
export const LEFT_LABEL_X = 252;
export const RIGHT_LABEL_X = 468;
/** Horizontal room of each label column, inside the wide viewBox. */
export const LABEL_COLUMN_WIDTH = 290;

export const LABEL_FONT_SIZE = 13;
export const LABEL_LINE_HEIGHT = 17;

/**
 * Conservative width of one character (0.62 em, more than the average of a sans font),
 * so a line with at most LABEL_MAX_CHARS characters always fits in its column.
 */
export const LABEL_CHAR_WIDTH = LABEL_FONT_SIZE * 0.62;
export const LABEL_MAX_CHARS = Math.floor(LABEL_COLUMN_WIDTH / LABEL_CHAR_WIDTH);

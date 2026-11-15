import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import { DISPLAY_STATUSES } from "../../components/StatusBadge";
import {
  INDICATOR_PLACEMENTS,
  LABEL_COLUMN_WIDTH,
  LABEL_LINE_HEIGHT,
  LABEL_MAX_CHARS,
  LEFT_LABEL_X,
  MARKER_HIT_RADIUS,
  NARROW_VIEW,
  RIGHT_LABEL_X,
  VIEW_HEIGHT,
  WIDE_VIEW,
} from "./zones";

/**
 * T-606b bug: labels were cut on the right in Spanish. Each SVG label line must fit its column
 * (with a conservative character width) in both languages. Longest sample values are used.
 */
const SAMPLE_VALUE = "188/124";
const SAMPLE_TIME = "2026-11-14 16:08 UTC";

function labelLines(texts: typeof en): string[] {
  const page = texts.pages.recordMeasurement;
  const names = Object.values(page.indicators);
  const values = Object.values(page.units).map((unit) => `${SAMPLE_VALUE} ${unit}`);
  const statuses = DISPLAY_STATUSES.map((status) => texts.status[status]);
  const details = [texts.pages.bodyMap.capturedSim.replace("{{time}}", SAMPLE_TIME), texts.pages.bodyMap.empty];
  return [...names, ...values, ...statuses, ...details];
}

describe("body map labels fit", () => {
  it.each([
    ["en", en],
    ["es", es],
  ])("every label line fits its column (%s)", (_language, texts) => {
    for (const line of labelLines(texts)) {
      expect(line.length, line).toBeLessThanOrEqual(LABEL_MAX_CHARS);
    }
  });

  it("both label columns are inside the wide viewBox", () => {
    expect(LEFT_LABEL_X - LABEL_COLUMN_WIDTH).toBeGreaterThanOrEqual(WIDE_VIEW.minX);
    expect(RIGHT_LABEL_X + LABEL_COLUMN_WIDTH).toBeLessThanOrEqual(WIDE_VIEW.minX + WIDE_VIEW.width);
  });

  it("label blocks of the same side never overlap and stay inside the figure height", () => {
    const blockHeight = 4 * LABEL_LINE_HEIGHT;
    for (const side of ["left", "right"] as const) {
      const centers = Object.values(INDICATOR_PLACEMENTS)
        .filter((placement) => placement.side === side)
        .map((placement) => placement.labelY)
        .sort((a, b) => a - b);
      expect(centers[0]! - blockHeight / 2).toBeGreaterThanOrEqual(0);
      expect(centers[centers.length - 1]! + blockHeight / 2).toBeLessThanOrEqual(VIEW_HEIGHT);
      for (let index = 1; index < centers.length; index++) {
        expect(centers[index]! - centers[index - 1]!).toBeGreaterThan(blockHeight);
      }
    }
  });

  it("touch areas of two markers never overlap and fit the narrow viewBox", () => {
    const markers = Object.values(INDICATOR_PLACEMENTS).map((placement) => placement.marker);
    for (const [index, a] of markers.entries()) {
      expect(a.x - MARKER_HIT_RADIUS).toBeGreaterThanOrEqual(NARROW_VIEW.minX);
      expect(a.x + MARKER_HIT_RADIUS).toBeLessThanOrEqual(NARROW_VIEW.minX + NARROW_VIEW.width);
      for (const b of markers.slice(index + 1)) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * MARKER_HIT_RADIUS);
      }
    }
  });
});

import type { Indicator } from "@astra/contracts";
import { TREND_INDICATORS, type TrendIndicator } from "../trend/build-trend-series";

/** T-606b: which indicator is highlighted on the figure and which one the trend shows. */
export interface IndicatorSelection {
  selected: Indicator | null;
  trend: TrendIndicator;
}

export const INITIAL_SELECTION: IndicatorSelection = { selected: null, trend: "HEART_RATE" };

/** Pure: the trend indicator for an indicator, or null for Mood (only history in the MVP). */
export function trendIndicatorFor(indicator: Indicator): TrendIndicator | null {
  return TREND_INDICATORS.find((item) => item === indicator) ?? null;
}

/**
 * Pure: selecting an indicator highlights it and, when it has a trend, changes the trend.
 * Mood is highlighted but the trend keeps its current indicator. The input is not changed.
 */
export function selectIndicator(state: IndicatorSelection, indicator: Indicator): IndicatorSelection {
  return { selected: indicator, trend: trendIndicatorFor(indicator) ?? state.trend };
}

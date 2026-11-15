import type { TrendResult, TrendSeriesId } from "./build-trend-series";

/** Fixed viewBox of the chart; the SVG itself takes the available width. */
export const TREND_VIEW = {
  width: 320,
  height: 160,
  left: 56,
  right: 12,
  top: 12,
  bottom: 28,
} as const;

export interface PlotPoint {
  id: string;
  x: number;
  y: number;
}

export interface PlotSeries {
  seriesId: TrendSeriesId;
  points: PlotPoint[];
  /** SVG path ("M x y L x y …") through the points, in order. */
  path: string;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Linear scale. When min equals max (one value only) the result is the middle, never NaN. */
export function scaleLinear(value: number, min: number, max: number, outStart: number, outEnd: number): number {
  if (max === min) return (outStart + outEnd) / 2;
  return outStart + ((value - min) / (max - min)) * (outEnd - outStart);
}

/**
 * Pure: viewBox coordinates of each point. X follows simulated time; if every point has the
 * same time, they are spread evenly. Y grows upward. No bands or thresholds are produced.
 */
export function plotTrend(trend: Extract<TrendResult, { kind: "series" }>): PlotSeries[] {
  const xStart = TREND_VIEW.left;
  const xEnd = TREND_VIEW.width - TREND_VIEW.right;
  const yBottom = TREND_VIEW.height - TREND_VIEW.bottom;
  const yTop = TREND_VIEW.top;
  const minMs = Date.parse(trend.minTime);
  const maxMs = Date.parse(trend.maxTime);

  return trend.series.map((series) => {
    const lastIndex = Math.max(series.points.length - 1, 1);
    const points = series.points.map((point, index) => ({
      id: point.id,
      x: round(
        minMs === maxMs
          ? scaleLinear(index, 0, lastIndex, xStart, xEnd)
          : scaleLinear(Date.parse(point.capturedAtSim), minMs, maxMs, xStart, xEnd),
      ),
      y: round(scaleLinear(point.value, trend.minValue, trend.maxValue, yBottom, yTop)),
    }));
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    return { seriesId: series.seriesId, points, path };
  });
}

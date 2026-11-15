import type { Indicator } from "@astra/contracts";
import type { LocalMeasurementRecord } from "../../db/schema";

/** Indicators with a trend. Mood is only history in the MVP, so it has no trend. */
export type TrendIndicator = Exclude<Indicator, "MOOD">;

export const TREND_INDICATORS: readonly TrendIndicator[] = [
  "HEART_RATE",
  "BODY_TEMPERATURE",
  "BLOOD_GLUCOSE",
  "BLOOD_PRESSURE",
  "SLEEP",
];

/** The trend shows only the most recent records (T-605 §3.1). */
export const TREND_MAX_POINTS = 14;

/** A trend needs at least this many records. */
export const TREND_MIN_POINTS = 2;

/** Blood pressure has two series; every other indicator has one ("value"). */
export type TrendSeriesId = "value" | "systolic" | "diastolic";

export interface TrendPoint {
  id: string;
  capturedAtSim: string;
  value: number;
}

export interface TrendSeries {
  seriesId: TrendSeriesId;
  points: TrendPoint[];
}

export type TrendResult =
  | { kind: "empty" }
  | {
      kind: "series";
      indicator: TrendIndicator;
      /** One series, or systolic and diastolic. Points of both share the same index. */
      series: TrendSeries[];
      /** First and last simulated time (ISO), the X axis. */
      minTime: string;
      maxTime: string;
      /** Lowest and highest value across all series, the Y axis. */
      minValue: number;
      maxValue: number;
    };

const EMPTY: TrendResult = { kind: "empty" };

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Same order as the engine and the local list: capturedAtSim, capturedAtReal, then id (ordinal). */
function compareRecords(a: LocalMeasurementRecord, b: LocalMeasurementRecord): number {
  return (
    Date.parse(a.capturedAtSim) - Date.parse(b.capturedAtSim) ||
    Date.parse(a.capturedAtReal) - Date.parse(b.capturedAtReal) ||
    compareText(a.id, b.id)
  );
}

function isTrendIndicator(indicator: string): indicator is TrendIndicator {
  return (TREND_INDICATORS as readonly string[]).includes(indicator);
}

/**
 * Pure: the points of one indicator for a line chart, from the local records of ONE astronaut.
 * Never throws: an indicator without a trend (mood) or too few records give `{ kind: "empty" }`.
 * No ranges or labels: only the astronaut's own values.
 */
export function buildTrendSeries(records: readonly LocalMeasurementRecord[], indicator: TrendIndicator): TrendResult {
  if (!isTrendIndicator(indicator)) return EMPTY;

  const latest = records
    .filter((record) => record.indicator === indicator)
    .sort(compareRecords)
    .slice(-TREND_MAX_POINTS);
  if (latest.length < TREND_MIN_POINTS) return EMPTY;

  const series: TrendSeries[] = [];
  if (indicator === "BLOOD_PRESSURE") {
    const systolic: TrendPoint[] = [];
    const diastolic: TrendPoint[] = [];
    for (const record of latest) {
      if (typeof record.value === "number") return EMPTY;
      systolic.push({ id: record.id, capturedAtSim: record.capturedAtSim, value: record.value.systolic });
      diastolic.push({ id: record.id, capturedAtSim: record.capturedAtSim, value: record.value.diastolic });
    }
    series.push({ seriesId: "systolic", points: systolic }, { seriesId: "diastolic", points: diastolic });
  } else {
    const points: TrendPoint[] = [];
    for (const record of latest) {
      if (typeof record.value !== "number") return EMPTY;
      points.push({ id: record.id, capturedAtSim: record.capturedAtSim, value: record.value });
    }
    series.push({ seriesId: "value", points });
  }

  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const first = latest[0];
  const last = latest[latest.length - 1];
  if (!first || !last) return EMPTY;
  return {
    kind: "series",
    indicator,
    series,
    minTime: first.capturedAtSim,
    maxTime: last.capturedAtSim,
    minValue: Math.min(...values),
    maxValue: Math.max(...values),
  };
}

import { describe, expect, it } from "vitest";
import type { LocalMeasurementRecord } from "../../db/schema";
import { buildTrendSeries, TREND_MAX_POINTS, type TrendIndicator } from "./build-trend-series";
import { plotTrend, scaleLinear } from "./trend-geometry";

// Fictitious values for the T-605 tests only.
const T0 = Date.parse("2031-03-01T08:00:00.000Z");
const HOUR = 3_600_000;

function at(hours: number): string {
  return new Date(T0 + hours * HOUR).toISOString();
}

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
}

function record(overrides: Partial<LocalMeasurementRecord> = {}): LocalMeasurementRecord {
  return {
    id: uuid(1),
    astronautId: "astro-a",
    indicator: "HEART_RATE",
    value: 70,
    unit: "bpm",
    context: "AT_REST",
    origin: "MANUAL",
    capturedAtReal: at(0),
    capturedAtSim: at(0),
    clockVersion: 1,
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
    syncState: "SAVED_LOCAL",
    localOrigin: "CAPTURED",
    savedAtReal: at(0),
    ...overrides,
  } as LocalMeasurementRecord;
}

function ids(result: ReturnType<typeof buildTrendSeries>): string[] {
  if (result.kind !== "series") return [];
  return result.series[0]?.points.map((point) => point.id) ?? [];
}

describe("buildTrendSeries (T-605 §3.1)", () => {
  it("orders by capturedAtSim", () => {
    const result = buildTrendSeries(
      [
        record({ id: uuid(1), capturedAtSim: at(3), value: 73 }),
        record({ id: uuid(2), capturedAtSim: at(1), value: 71 }),
        record({ id: uuid(3), capturedAtSim: at(2), value: 72 }),
      ],
      "HEART_RATE",
    );
    expect(ids(result)).toEqual([uuid(2), uuid(3), uuid(1)]);
  });

  it("breaks a capturedAtSim tie by capturedAtReal", () => {
    const result = buildTrendSeries(
      [
        record({ id: uuid(1), capturedAtSim: at(1), capturedAtReal: at(5) }),
        record({ id: uuid(2), capturedAtSim: at(1), capturedAtReal: at(4) }),
      ],
      "HEART_RATE",
    );
    expect(ids(result)).toEqual([uuid(2), uuid(1)]);
  });

  it("breaks a capturedAtSim and capturedAtReal tie by id (ordinal)", () => {
    // Ordinal order: "B" (0x42) comes before "a" (0x61); localeCompare would say otherwise.
    const result = buildTrendSeries(
      [
        record({ id: "a-record", capturedAtSim: at(1) }),
        record({ id: "B-record", capturedAtSim: at(1) }),
      ],
      "HEART_RATE",
    );
    expect(ids(result)).toEqual(["B-record", "a-record"]);
  });

  it("keeps only the latest 14 records", () => {
    const records = Array.from({ length: 20 }, (_, index) =>
      record({ id: uuid(index + 1), capturedAtSim: at(index), value: 60 + index }),
    );
    const result = buildTrendSeries(records, "HEART_RATE");
    expect(TREND_MAX_POINTS).toBe(14);
    expect(ids(result)).toEqual(records.slice(-14).map((item) => item.id));
    if (result.kind !== "series") throw new Error("expected a series");
    expect(result.minTime).toBe(at(6));
    expect(result.maxTime).toBe(at(19));
    expect(result.minValue).toBe(66);
    expect(result.maxValue).toBe(79);
  });

  it("gives blood pressure two series, systolic and diastolic", () => {
    const result = buildTrendSeries(
      [
        record({ id: uuid(1), indicator: "BLOOD_PRESSURE", unit: "mmHg", value: { systolic: 118, diastolic: 76 }, capturedAtSim: at(1) }),
        record({ id: uuid(2), indicator: "BLOOD_PRESSURE", unit: "mmHg", value: { systolic: 122, diastolic: 80 }, capturedAtSim: at(2) }),
      ],
      "BLOOD_PRESSURE",
    );
    if (result.kind !== "series") throw new Error("expected a series");
    expect(result.series.map((item) => item.seriesId)).toEqual(["systolic", "diastolic"]);
    expect(result.series[0]?.points.map((point) => point.value)).toEqual([118, 122]);
    expect(result.series[1]?.points.map((point) => point.value)).toEqual([76, 80]);
    expect(result.minValue).toBe(76);
    expect(result.maxValue).toBe(122);
  });

  it("returns empty with fewer than 2 points", () => {
    expect(buildTrendSeries([], "HEART_RATE")).toEqual({ kind: "empty" });
    expect(buildTrendSeries([record()], "HEART_RATE")).toEqual({ kind: "empty" });
  });

  it("does not mix indicators", () => {
    const records = [
      record({ id: uuid(1), capturedAtSim: at(1) }),
      record({ id: uuid(2), indicator: "SLEEP", unit: "h", value: 7.5, capturedAtSim: at(2) }),
      record({ id: uuid(3), capturedAtSim: at(3) }),
      record({ id: uuid(4), indicator: "SLEEP", unit: "h", value: 6.5, capturedAtSim: at(4) }),
    ];
    expect(ids(buildTrendSeries(records, "HEART_RATE"))).toEqual([uuid(1), uuid(3)]);
    expect(ids(buildTrendSeries(records, "SLEEP"))).toEqual([uuid(2), uuid(4)]);
    expect(buildTrendSeries(records, "BODY_TEMPERATURE")).toEqual({ kind: "empty" });
  });

  it("does not accept mood: returns empty, never throws", () => {
    const moods = [
      record({ id: uuid(1), indicator: "MOOD", unit: "scale_1_5", value: 3, capturedAtSim: at(1) }),
      record({ id: uuid(2), indicator: "MOOD", unit: "scale_1_5", value: 4, capturedAtSim: at(2) }),
    ];
    // @ts-expect-error MOOD is not a TrendIndicator; the compiler rejects it.
    const result = buildTrendSeries(moods, "MOOD");
    expect(result).toEqual({ kind: "empty" });
    expect(() => buildTrendSeries(moods, "MOOD" as TrendIndicator)).not.toThrow();
  });

  it("does not change the input array", () => {
    const records = [record({ id: uuid(2), capturedAtSim: at(2) }), record({ id: uuid(1), capturedAtSim: at(1) })];
    buildTrendSeries(records, "HEART_RATE");
    expect(records.map((item) => item.id)).toEqual([uuid(2), uuid(1)]);
  });
});

describe("trend geometry", () => {
  it("never produces NaN when every value or time is the same", () => {
    expect(scaleLinear(5, 5, 5, 0, 100)).toBe(50);
    const result = buildTrendSeries(
      [record({ id: uuid(1), capturedAtSim: at(1) }), record({ id: uuid(2), capturedAtSim: at(1) })],
      "HEART_RATE",
    );
    if (result.kind !== "series") throw new Error("expected a series");
    const [series] = plotTrend(result);
    const coordinates = series?.points.flatMap((point) => [point.x, point.y]) ?? [];
    expect(coordinates.every(Number.isFinite)).toBe(true);
    // Same time: spread evenly, not stacked.
    expect(series?.points[0]?.x).not.toBe(series?.points[1]?.x);
    expect(series?.path.startsWith("M ")).toBe(true);
  });

  it("puts the highest value above the lowest (SVG y grows downward)", () => {
    const result = buildTrendSeries(
      [record({ id: uuid(1), capturedAtSim: at(1), value: 60 }), record({ id: uuid(2), capturedAtSim: at(2), value: 80 })],
      "HEART_RATE",
    );
    if (result.kind !== "series") throw new Error("expected a series");
    const [series] = plotTrend(result);
    const [low, high] = series?.points ?? [];
    expect(high!.y).toBeLessThan(low!.y);
    expect(high!.x).toBeGreaterThan(low!.x);
  });
});

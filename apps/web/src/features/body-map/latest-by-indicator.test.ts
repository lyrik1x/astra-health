import { describe, expect, it } from "vitest";
import type { LocalMeasurementRecord } from "../../db/schema";
import { latestByIndicator } from "./latest-by-indicator";

/** Fictional heart-rate record; only the fields under test change. */
function heartRate(overrides: Partial<LocalMeasurementRecord> & { id: string }): LocalMeasurementRecord {
  return {
    astronautId: "astro-1",
    indicator: "HEART_RATE",
    unit: "bpm",
    value: 70,
    context: "AT_REST",
    origin: "MANUAL",
    capturedAtReal: "2026-11-14T10:00:00.000Z",
    capturedAtSim: "2026-11-14T10:00:00.000Z",
    clockVersion: 1,
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
    syncState: "SAVED_LOCAL",
    localOrigin: "CAPTURED",
    savedAtReal: "2026-11-14T10:00:00.000Z",
    ...overrides,
  } as LocalMeasurementRecord;
}

function sleep(id: string, capturedAtSim: string): LocalMeasurementRecord {
  return {
    ...heartRate({ id, capturedAtSim }),
    indicator: "SLEEP",
    unit: "h",
    value: 7.5,
  } as LocalMeasurementRecord;
}

describe("latestByIndicator", () => {
  it("picks the most recent record by capturedAtSim", () => {
    const older = heartRate({ id: "b", capturedAtSim: "2026-11-14T08:00:00.000Z" });
    const newer = heartRate({ id: "a", capturedAtSim: "2026-11-14T09:00:00.000Z" });
    expect(latestByIndicator([older, newer]).HEART_RATE?.id).toBe("a");
    expect(latestByIndicator([newer, older]).HEART_RATE?.id).toBe("a");
  });

  it("breaks a capturedAtSim tie with capturedAtReal (same order as the engine)", () => {
    const earlierReal = heartRate({ id: "z", capturedAtReal: "2026-11-14T10:00:00.000Z" });
    const laterReal = heartRate({ id: "a", capturedAtReal: "2026-11-14T10:00:01.000Z" });
    expect(latestByIndicator([earlierReal, laterReal]).HEART_RATE?.id).toBe("a");
    expect(latestByIndicator([laterReal, earlierReal]).HEART_RATE?.id).toBe("a");
  });

  it("breaks a full time tie with id, compared ordinally", () => {
    const upper = heartRate({ id: "B" });
    const lower = heartRate({ id: "a" });
    // Ordinal: "a" (0x61) > "B" (0x42); localeCompare would say the opposite.
    expect(latestByIndicator([lower, upper]).HEART_RATE?.id).toBe("a");
    expect(latestByIndicator([upper, lower]).HEART_RATE?.id).toBe("a");
  });

  it("omits indicators without records", () => {
    const result = latestByIndicator([heartRate({ id: "a" }), sleep("s", "2026-11-14T07:00:00.000Z")]);
    expect(Object.keys(result).sort()).toEqual(["HEART_RATE", "SLEEP"]);
    expect(result.MOOD).toBeUndefined();
    expect(latestByIndicator([])).toEqual({});
  });

  it("does not change the input", () => {
    const records = [
      heartRate({ id: "b", capturedAtSim: "2026-11-14T09:00:00.000Z" }),
      heartRate({ id: "a", capturedAtSim: "2026-11-14T08:00:00.000Z" }),
    ];
    const snapshot = structuredClone(records);
    const frozen = Object.freeze([...records]);
    latestByIndicator(frozen);
    expect(records).toEqual(snapshot);
    expect(records.map((record) => record.id)).toEqual(["b", "a"]);
  });
});

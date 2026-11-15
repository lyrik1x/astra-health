import { describe, expect, it } from "vitest";
import type { Transmission } from "@astra/contracts";
import type { LocalMeasurementRecord, LocalMissionConfig } from "../../db/schema";
import { latestByIndicator } from "./latest-by-indicator";
import { markerColorFor, NO_RECORDS_COLOR, STATUS_COLOR_TOKEN, statusByIndicator } from "./indicator-status";

// Fictional clock: factor 60, so 1 real minute = 60 simulated minutes.
const EPOCH = "2026-11-14T00:00:00.000Z";
const config: Pick<LocalMissionConfig, "clock"> = {
  clock: { simEpoch: EPOCH, realEpoch: EPOCH, factor: 60, clockVersion: 1 },
};
const realAt = (realMs: number) => new Date(Date.parse(EPOCH) + realMs);

// Delivered at simulated 02:00 (= 2 real minutes after the epoch).
const transmission: Transmission = {
  id: "00000000-0000-4000-8000-000000000001",
  direction: "SHIP_TO_EARTH",
  contentKind: "MEASUREMENT",
  contentId: "00000000-0000-4000-8000-000000000002",
  acceptedAtReal: EPOCH,
  acceptedAtSim: EPOCH,
  deliverAt: "2026-11-14T02:00:00.000Z",
  envProfile: "MARS_TRANSIT",
  envVersion: 1,
};

/** Fictional record; only the fields under test change. */
function record(overrides: Partial<LocalMeasurementRecord> & { id: string }): LocalMeasurementRecord {
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

const statusOf = (records: LocalMeasurementRecord[], now = realAt(0)) =>
  statusByIndicator(latestByIndicator(records), config, now);

describe("statusByIndicator", () => {
  it("uses the state of the LATEST record of each indicator", () => {
    const older = record({ id: "a", capturedAtSim: "2026-11-14T08:00:00.000Z", syncState: "SYNC_ERROR" });
    const newer = record({ id: "b", capturedAtSim: "2026-11-14T09:00:00.000Z", syncState: "PENDING_SYNC" });
    expect(statusOf([older, newer]).HEART_RATE?.status).toBe("PENDING_SYNC");
    expect(statusOf([newer, older]).HEART_RATE?.status).toBe("PENDING_SYNC");
  });

  it("gives each indicator its own state", () => {
    const states = statusOf([
      record({ id: "hr", syncState: "SAVED_LOCAL" }),
      record({ id: "sl", indicator: "SLEEP", unit: "h", value: 7, syncState: "SYNC_ERROR", lastError: "UUID_CONFLICT: x" }),
    ]);
    expect(states.HEART_RATE?.status).toBe("SAVED_LOCAL");
    expect(states.SLEEP).toEqual({ status: "SYNC_ERROR", badges: [{ status: "SYNC_ERROR", errorCode: "UUID_CONFLICT" }] });
  });

  it("CONFIRMED shows IN_TRANSIT before deliverAt and DELIVERED after, keeping both badges", () => {
    const confirmed = record({ id: "c", syncState: "CONFIRMED", transmission });
    expect(statusOf([confirmed], realAt(60_000)).HEART_RATE).toEqual({
      status: "IN_TRANSIT",
      badges: [{ status: "CONFIRMED" }, { status: "IN_TRANSIT" }],
    });
    expect(statusOf([confirmed], realAt(2 * 60_000)).HEART_RATE?.status).toBe("DELIVERED");
  });

  it("CONFIRMED without a transmission stays CONFIRMED", () => {
    expect(statusOf([record({ id: "c", syncState: "CONFIRMED" })]).HEART_RATE?.status).toBe("CONFIRMED");
  });

  it("an indicator without records has no state", () => {
    const states = statusOf([record({ id: "a" })]);
    expect(states.MOOD).toBeUndefined();
    expect(Object.keys(states)).toEqual(["HEART_RATE"]);
  });
});

describe("markerColorFor", () => {
  it("uses the same status tokens as StatusBadge", () => {
    expect(STATUS_COLOR_TOKEN.IN_TRANSIT).toBe("var(--color-status-transit)");
    expect(STATUS_COLOR_TOKEN.SYNC_ERROR).toBe("var(--color-status-error)");
    expect(markerColorFor(undefined)).toBe(NO_RECORDS_COLOR);
  });

  it("never depends on the measured value", () => {
    const values = [1, 40, 70, 250, 9999];
    const colors = values.map((value) => {
      const state = statusOf([record({ id: "x", value, syncState: "PENDING_SYNC" })]).HEART_RATE?.status;
      return markerColorFor(state);
    });
    expect(new Set(colors)).toEqual(new Set([STATUS_COLOR_TOKEN.PENDING_SYNC]));

    const lowBp = record({ id: "p1", indicator: "BLOOD_PRESSURE", unit: "mmHg", value: { systolic: 80, diastolic: 50 } as never });
    const highBp = record({ id: "p2", indicator: "BLOOD_PRESSURE", unit: "mmHg", value: { systolic: 190, diastolic: 120 } as never });
    expect(statusOf([lowBp]).BLOOD_PRESSURE).toEqual(statusOf([highBp]).BLOOD_PRESSURE);
  });
});

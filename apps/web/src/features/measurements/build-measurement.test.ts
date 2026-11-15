import { describe, expect, it } from "vitest";
import { MeasurementSchema, computeSimNow, type Indicator } from "@astra/contracts";
import { buildMeasurement, type MeasurementValue } from "./build-measurement";
import { devMissionConfig } from "./dev-fixtures";

const REAL_NOW = new Date("2026-11-14T10:30:00.000Z");
const FIXED_ID = "11111111-1111-4111-8111-111111111111";
const newId = () => FIXED_ID;

// Fictional, format-valid values for each indicator (not clinical references).
const SAMPLE_VALUES: Record<Indicator, MeasurementValue> = {
  HEART_RATE: 80,
  BODY_TEMPERATURE: 36.6,
  BLOOD_GLUCOSE: 95.5,
  BLOOD_PRESSURE: { systolic: 120, diastolic: 80 },
  MOOD: 3,
  SLEEP: 7.25,
};

describe("buildMeasurement", () => {
  for (const [indicator, value] of Object.entries(SAMPLE_VALUES) as Array<[Indicator, MeasurementValue]>) {
    it(`builds a contract-valid ${indicator} measurement`, () => {
      const measurement = buildMeasurement(
        { astronautId: "sam", indicator, context: "AT_REST", value },
        devMissionConfig,
        REAL_NOW,
        newId,
      );
      expect(MeasurementSchema.safeParse(measurement).success).toBe(true);
    });
  }

  it("fills id, times, origin, versions and the fixed unit", () => {
    const measurement = buildMeasurement(
      { astronautId: "alex", indicator: "BLOOD_GLUCOSE", context: "BEFORE_MEAL", value: 95.5 },
      devMissionConfig,
      REAL_NOW,
      newId,
    );
    expect(measurement).toEqual({
      id: FIXED_ID,
      astronautId: "alex",
      indicator: "BLOOD_GLUCOSE",
      value: 95.5,
      unit: "mg_dL",
      context: "BEFORE_MEAL",
      origin: "MANUAL",
      capturedAtReal: "2026-11-14T10:30:00.000Z",
      capturedAtSim: computeSimNow(devMissionConfig.clock, REAL_NOW),
      clockVersion: 1,
      envProfile: "MARS_TRANSIT",
      envVersion: 1,
    });
  });

  it("takes capturedAtSim from computeSimNow with the injected realNow", () => {
    const measurement = buildMeasurement(
      { astronautId: "sam", indicator: "HEART_RATE", context: "AT_REST", value: 80 },
      devMissionConfig,
      REAL_NOW,
      newId,
    );
    // 10.5 h real × factor 60 after the epoch.
    expect(measurement.capturedAtSim).toBe(computeSimNow(devMissionConfig.clock, REAL_NOW));
    expect(measurement.capturedAtSim).toBe("2026-12-10T06:00:00.000Z");
  });

  it("calls newId once per measurement", () => {
    let calls = 0;
    buildMeasurement(
      { astronautId: "sam", indicator: "MOOD", context: "AT_REST", value: 4 },
      devMissionConfig,
      REAL_NOW,
      () => {
        calls += 1;
        return FIXED_ID;
      },
    );
    expect(calls).toBe(1);
  });
});

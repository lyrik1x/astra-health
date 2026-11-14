import { describe, expect, it } from "vitest";
import { MAX_DB_INT, MeasurementSchema, hasAtMostTwoDecimals } from "./index.js";
import { measurements, parses } from "./test-fixtures.js";

const ok = (value: unknown) => parses(MeasurementSchema, value);

describe("MeasurementSchema: one shape per indicator", () => {
  it.each(Object.keys(measurements))("accepts the correct shape of %s", (indicator) => {
    expect(ok(measurements[indicator as keyof typeof measurements])).toBe(true);
  });

  it("rejects the value shape of another indicator", () => {
    const { HEART_RATE, BLOOD_PRESSURE } = measurements;
    expect(ok({ ...BLOOD_PRESSURE, value: 120 })).toBe(false);
    expect(ok({ ...HEART_RATE, value: { systolic: 120, diastolic: 80 } })).toBe(false);
    expect(ok({ ...HEART_RATE, value: "80" })).toBe(false);
  });

  it("rejects a wrong unit for each indicator", () => {
    const wrongUnits: Record<keyof typeof measurements, string> = {
      HEART_RATE: "mmHg",
      BODY_TEMPERATURE: "degF",
      BLOOD_GLUCOSE: "mmol_L",
      BLOOD_PRESSURE: "bpm",
      MOOD: "scale_1_10",
      SLEEP: "min",
    };
    for (const [indicator, unit] of Object.entries(wrongUnits)) {
      expect(ok({ ...measurements[indicator as keyof typeof measurements], unit })).toBe(false);
    }
  });

  it("rejects an unknown indicator", () => {
    expect(ok({ ...measurements.HEART_RATE, indicator: "WEIGHT" })).toBe(false);
  });
});

describe("MeasurementSchema: common fields", () => {
  const base = measurements.HEART_RATE;

  it("accepts every context of the catalog", () => {
    for (const context of ["AT_REST", "AFTER_EXERCISE", "AFTER_WAKING", "BEFORE_MEAL", "AFTER_MEAL"]) {
      expect(ok({ ...base, context })).toBe(true);
    }
  });

  it("rejects a context outside the catalog", () => {
    expect(ok({ ...base, context: "DURING_EVA" })).toBe(false);
  });

  it("rejects an unknown key, at the top level and inside the blood pressure value", () => {
    expect(ok({ ...base, notes: "x" })).toBe(false);
    expect(ok({ ...measurements.BLOOD_PRESSURE, value: { systolic: 120, diastolic: 80, pulse: 70 } })).toBe(false);
  });

  it("rejects dates without milliseconds or with another zone", () => {
    expect(ok({ ...base, capturedAtReal: "2026-11-14T16:08:43Z" })).toBe(false);
    expect(ok({ ...base, capturedAtSim: "2026-11-14T16:08:43.193-06:00" })).toBe(false);
  });

  it("rejects an origin other than MANUAL, an invalid astronautId and a missing field", () => {
    expect(ok({ ...base, origin: "DEVICE" })).toBe(false);
    expect(ok({ ...base, astronautId: "Sam" })).toBe(false);
    const { capturedAtSim: _omitted, ...missing } = base;
    expect(ok(missing)).toBe(false);
  });

  it("rejects integers above MAX_DB_INT (M-15)", () => {
    expect(ok({ ...base, value: MAX_DB_INT })).toBe(true);
    expect(ok({ ...base, value: MAX_DB_INT + 1 })).toBe(false);
    expect(ok({ ...base, clockVersion: MAX_DB_INT + 1 })).toBe(false);
    expect(ok({ ...base, envVersion: MAX_DB_INT + 1 })).toBe(false);
    expect(ok({ ...measurements.BLOOD_PRESSURE, value: { systolic: MAX_DB_INT + 1, diastolic: 80 } })).toBe(false);
  });
});

describe("MeasurementSchema: technical value limits", () => {
  it("heart rate: integer > 0", () => {
    expect(ok({ ...measurements.HEART_RATE, value: 1 })).toBe(true);
    expect(ok({ ...measurements.HEART_RATE, value: 0 })).toBe(false);
    expect(ok({ ...measurements.HEART_RATE, value: 80.5 })).toBe(false);
  });

  it("temperature and glucose: finite decimal > 0", () => {
    expect(ok({ ...measurements.BODY_TEMPERATURE, value: 0.1 })).toBe(true);
    expect(ok({ ...measurements.BODY_TEMPERATURE, value: 0 })).toBe(false);
    expect(ok({ ...measurements.BODY_TEMPERATURE, value: Number.POSITIVE_INFINITY })).toBe(false);
    expect(ok({ ...measurements.BLOOD_GLUCOSE, value: 0.1 })).toBe(true);
    expect(ok({ ...measurements.BLOOD_GLUCOSE, value: -5 })).toBe(false);
    expect(ok({ ...measurements.BLOOD_GLUCOSE, value: Number.NaN })).toBe(false);
  });

  it("blood pressure: each component an integer > 0", () => {
    const bp = measurements.BLOOD_PRESSURE;
    expect(ok({ ...bp, value: { systolic: 1, diastolic: 1 } })).toBe(true);
    expect(ok({ ...bp, value: { systolic: 0, diastolic: 80 } })).toBe(false);
    expect(ok({ ...bp, value: { systolic: 120, diastolic: 80.5 } })).toBe(false);
    expect(ok({ ...bp, value: { systolic: 120 } })).toBe(false);
  });

  it("mood: 1 to 5 accepted; 0, 6 and 2.5 rejected", () => {
    for (const value of [1, 2, 3, 4, 5]) {
      expect(ok({ ...measurements.MOOD, value })).toBe(true);
    }
    for (const value of [0, 6, 2.5]) {
      expect(ok({ ...measurements.MOOD, value })).toBe(false);
    }
  });

  it("sleep: 0, 7.1, 7.5, 7.25 and 24 accepted; -1, 24.01 and 7.125 rejected", () => {
    for (const value of [0, 7.1, 7.5, 7.25, 24]) {
      expect(ok({ ...measurements.SLEEP, value })).toBe(true);
    }
    for (const value of [-1, 24.01, 7.125]) {
      expect(ok({ ...measurements.SLEEP, value })).toBe(false);
    }
  });
});

describe("hasAtMostTwoDecimals (floating-point tolerance)", () => {
  it("accepts values whose float representation is not exact", () => {
    for (const value of [7.1, 0.29, 1.15, 23.99]) {
      expect(hasAtMostTwoDecimals(value)).toBe(true);
    }
  });

  it("rejects three decimals", () => {
    expect(hasAtMostTwoDecimals(7.125)).toBe(false);
    expect(hasAtMostTwoDecimals(0.001)).toBe(false);
  });
});

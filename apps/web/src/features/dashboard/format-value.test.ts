import { describe, expect, it } from "vitest";
import { formatMeasurementValue, formatUtcMinute } from "./format-value";

describe("formatUtcMinute", () => {
  it("shows an ISO date as YYYY-MM-DD HH:mm UTC", () => {
    expect(formatUtcMinute("2026-11-14T16:08:43.193Z")).toBe("2026-11-14 16:08 UTC");
  });
});

// Fictional values; only the display format is checked (T-005 §3.1).
describe("formatMeasurementValue", () => {
  it("uses 0 decimals for heart rate, glucose and mood", () => {
    expect(formatMeasurementValue("HEART_RATE", 80)).toBe("80");
    expect(formatMeasurementValue("BLOOD_GLUCOSE", 95.5)).toBe("96");
    expect(formatMeasurementValue("BLOOD_GLUCOSE", 95.4)).toBe("95");
    expect(formatMeasurementValue("MOOD", 3)).toBe("3");
  });

  it("uses 1 decimal for temperature and sleep", () => {
    expect(formatMeasurementValue("BODY_TEMPERATURE", 36.64)).toBe("36.6");
    expect(formatMeasurementValue("BODY_TEMPERATURE", 37)).toBe("37.0");
    expect(formatMeasurementValue("SLEEP", 7.25)).toBe("7.3");
    expect(formatMeasurementValue("SLEEP", 0)).toBe("0.0");
  });

  it("shows blood pressure as systolic/diastolic", () => {
    expect(formatMeasurementValue("BLOOD_PRESSURE", { systolic: 120, diastolic: 80 })).toBe("120/80");
  });
});

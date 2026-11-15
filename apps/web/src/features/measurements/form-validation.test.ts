import { describe, expect, it } from "vitest";
import type { Indicator } from "@astra/contracts";
import { en } from "../../i18n/en";
import { buildMeasurement } from "./build-measurement";
import { devMissionConfig } from "./dev-fixtures";
import {
  ERROR_KEYS,
  parseFormValue,
  validateMeasurement,
  validateMeasurementForm,
  type MeasurementFormValues,
} from "./form-validation";

const REAL_NOW = new Date("2026-11-14T10:30:00.000Z");
const newId = () => "11111111-1111-4111-8111-111111111111";

function form(indicator: Indicator, patch: Partial<MeasurementFormValues> = {}): MeasurementFormValues {
  return {
    astronautId: "sam",
    indicator,
    context: "AT_REST",
    valueText: "",
    systolicText: "",
    diastolicText: "",
    mood: null,
    ...patch,
  };
}

function validate(values: MeasurementFormValues) {
  return validateMeasurementForm(values, devMissionConfig, REAL_NOW, newId);
}

describe("parseFormValue (strict)", () => {
  const rejectedEverywhere = ["", "  ", "1e2", "0x10", "-5", "+5", "Infinity", "NaN", "1_000", "7 5", "abc"];

  for (const text of rejectedEverywhere) {
    it(`rejects ${JSON.stringify(text)} as integer and decimal`, () => {
      expect(parseFormValue(text, "INTEGER")).toEqual({ ok: false, reason: "FORMAT" });
      expect(parseFormValue(text, "DECIMAL")).toEqual({ ok: false, reason: "FORMAT" });
    });
  }

  it("accepts \"72\" with spaces around it", () => {
    expect(parseFormValue("  72  ", "INTEGER")).toEqual({ ok: true, value: 72 });
    expect(parseFormValue("\t72 ", "DECIMAL")).toEqual({ ok: true, value: 72 });
  });

  it("accepts a dot decimal only for decimal fields", () => {
    expect(parseFormValue("36.6", "DECIMAL")).toEqual({ ok: true, value: 36.6 });
    expect(parseFormValue("72.0", "INTEGER")).toEqual({ ok: false, reason: "FORMAT" });
    expect(parseFormValue(".5", "DECIMAL")).toEqual({ ok: false, reason: "FORMAT" });
    expect(parseFormValue("5.", "DECIMAL")).toEqual({ ok: false, reason: "FORMAT" });
  });

  it("does not convert a decimal comma silently", () => {
    expect(parseFormValue("36,6", "DECIMAL")).toEqual({ ok: false, reason: "DECIMAL_COMMA" });
    expect(parseFormValue("36,6", "INTEGER")).toEqual({ ok: false, reason: "FORMAT" });
  });
});

describe("validateMeasurementForm", () => {
  it("accepts each indicator with format-valid input", () => {
    const cases: MeasurementFormValues[] = [
      form("HEART_RATE", { valueText: " 72 " }),
      form("BODY_TEMPERATURE", { valueText: "36.6" }),
      form("BLOOD_GLUCOSE", { valueText: "95.5" }),
      form("BLOOD_PRESSURE", { systolicText: "120", diastolicText: "80" }),
      form("MOOD", { mood: 3 }),
      form("SLEEP", { valueText: "7.25" }),
    ];
    for (const values of cases) {
      expect(validate(values).ok, values.indicator).toBe(true);
    }
  });

  it("returns the validated measurement", () => {
    const result = validate(form("HEART_RATE", { valueText: "72" }));
    expect(result.ok && result.measurement.value).toBe(72);
  });

  for (const text of ["", "  ", "1e2", "0x10", "-5", "0"]) {
    it(`rejects heart rate ${JSON.stringify(text)} with the whole-number message`, () => {
      expect(validate(form("HEART_RATE", { valueText: text }))).toEqual({
        ok: false,
        errors: { value: "pages.recordMeasurement.errors.wholeNumber" },
      });
    });
  }

  it("rejects \"36,6\" with the decimal-comma message", () => {
    expect(validate(form("BODY_TEMPERATURE", { valueText: "36,6" }))).toEqual({
      ok: false,
      errors: { value: ERROR_KEYS.decimalComma },
    });
  });

  it("sleep: accepts 7.25 and rejects 24.5 and 7.255", () => {
    expect(validate(form("SLEEP", { valueText: "7.25" })).ok).toBe(true);
    for (const text of ["24.5", "7.255"]) {
      expect(validate(form("SLEEP", { valueText: text }))).toEqual({
        ok: false,
        errors: { value: "pages.recordMeasurement.errors.sleepHours" },
      });
    }
  });

  it("sleep: accepts the definitional limits 0 and 24", () => {
    expect(validate(form("SLEEP", { valueText: "0" })).ok).toBe(true);
    expect(validate(form("SLEEP", { valueText: "24" })).ok).toBe(true);
  });

  it("mood: requires a choice", () => {
    expect(validate(form("MOOD"))).toEqual({ ok: false, errors: { value: "pages.recordMeasurement.errors.mood" } });
  });

  it("mood: 6 is rejected by the schema", () => {
    const candidate = buildMeasurement(
      { astronautId: "sam", indicator: "MOOD", context: "AT_REST", value: 6 },
      devMissionConfig,
      REAL_NOW,
      newId,
    );
    expect(validateMeasurement(candidate, "MOOD")).toEqual({
      ok: false,
      errors: { value: "pages.recordMeasurement.errors.mood" },
    });
  });

  it("blood pressure: a missing diastolic is rejected in the form", () => {
    expect(validate(form("BLOOD_PRESSURE", { systolicText: "120" }))).toEqual({
      ok: false,
      errors: { diastolic: "pages.recordMeasurement.errors.wholeNumber" },
    });
  });

  it("blood pressure: a missing diastolic is rejected by the schema", () => {
    const candidate = {
      ...buildMeasurement(
        { astronautId: "sam", indicator: "BLOOD_PRESSURE", context: "AT_REST", value: { systolic: 120, diastolic: 80 } },
        devMissionConfig,
        REAL_NOW,
        newId,
      ),
      value: { systolic: 120 },
    };
    expect(validateMeasurement(candidate, "BLOOD_PRESSURE")).toEqual({
      ok: false,
      errors: { diastolic: "pages.recordMeasurement.errors.wholeNumber" },
    });
  });

  it("requires a crew member", () => {
    expect(validate(form("HEART_RATE", { astronautId: "", valueText: "72" }))).toEqual({
      ok: false,
      errors: { astronautId: ERROR_KEYS.astronaut },
    });
  });

  it("never builds a measurement from an invalid realNow", () => {
    const result = validateMeasurementForm(
      form("HEART_RATE", { valueText: "72" }),
      devMissionConfig,
      new Date("invalid"),
      newId,
    );
    expect(result).toEqual({ ok: false, errors: { form: ERROR_KEYS.unexpected } });
  });
});

describe("error messages", () => {
  it("are neutral format messages, never health ranges", () => {
    const messages = Object.values(en.pages.recordMeasurement.errors);
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).not.toMatch(/\b(too high|too low|high|low|abnormal|normal|danger|risk|healthy|unhealthy)\b/i);
    }
  });
});

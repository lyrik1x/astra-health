import {
  MeasurementSchema,
  type Indicator,
  type Measurement,
  type MeasurementContext,
  type MissionConfigResponse,
} from "@astra/contracts";
import { buildMeasurement, type MeasurementValue } from "./build-measurement";
import { getIndicatorDefinition, type IndicatorDefinition } from "./indicators";

// Format checks only. Value limits are those of MeasurementSchema: technical or
// definitional, never clinical. No message may sound like a health range.

export type NumberKind = "INTEGER" | "DECIMAL";
export type ParseFailure = "FORMAT" | "DECIMAL_COMMA";
export type ParseResult = { ok: true; value: number } | { ok: false; reason: ParseFailure };

// Plain ASCII digits only: rejects "", "1e2", "0x10", "-5", "+5", "Infinity", "1_000".
const INTEGER_PATTERN = /^\d+$/;
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
// "36,6" is never converted silently; the astronaut gets a format hint instead.
const DECIMAL_COMMA_PATTERN = /^\d+,\d+$/;

/**
 * Strict text-to-number conversion. The trimmed text must match the pattern before Number()
 * is called, so Number() only ever sees plain digits (with an optional dot for decimals).
 */
export function parseFormValue(text: string, kind: NumberKind): ParseResult {
  const trimmed = text.trim();
  const pattern = kind === "INTEGER" ? INTEGER_PATTERN : DECIMAL_PATTERN;
  if (pattern.test(trimmed)) {
    return { ok: true, value: Number(trimmed) };
  }
  if (kind === "DECIMAL" && DECIMAL_COMMA_PATTERN.test(trimmed)) {
    return { ok: false, reason: "DECIMAL_COMMA" };
  }
  return { ok: false, reason: "FORMAT" };
}

export type FieldName = "astronautId" | "value" | "systolic" | "diastolic" | "form";
/** Field → i18n key of its error message. */
export type FieldErrors = Partial<Record<FieldName, string>>;

export type ValidationResult = { ok: true; measurement: Measurement } | { ok: false; errors: FieldErrors };

export const ERROR_KEYS = {
  astronaut: "pages.recordMeasurement.errors.astronaut",
  decimalComma: "pages.recordMeasurement.errors.decimalComma",
  unexpected: "pages.recordMeasurement.errors.unexpected",
} as const;

function parseErrorKey(reason: ParseFailure, definition: IndicatorDefinition): string {
  return reason === "DECIMAL_COMMA" ? ERROR_KEYS.decimalComma : definition.formatErrorKey;
}

/** The form fields as typed by the astronaut. */
export interface MeasurementFormValues {
  astronautId: string;
  indicator: Indicator;
  context: MeasurementContext;
  valueText: string;
  systolicText: string;
  diastolicText: string;
  mood: number | null;
}

interface ReadValueResult {
  value?: MeasurementValue;
  errors: FieldErrors;
}

function readValue(values: MeasurementFormValues, definition: IndicatorDefinition): ReadValueResult {
  switch (definition.captureKind) {
    case "INTEGER":
    case "DECIMAL": {
      const parsed = parseFormValue(values.valueText, definition.captureKind);
      return parsed.ok
        ? { value: parsed.value, errors: {} }
        : { errors: { value: parseErrorKey(parsed.reason, definition) } };
    }
    case "BLOOD_PRESSURE": {
      const systolic = parseFormValue(values.systolicText, "INTEGER");
      const diastolic = parseFormValue(values.diastolicText, "INTEGER");
      const errors: FieldErrors = {};
      if (!systolic.ok) errors.systolic = parseErrorKey(systolic.reason, definition);
      if (!diastolic.ok) errors.diastolic = parseErrorKey(diastolic.reason, definition);
      if (!systolic.ok || !diastolic.ok) return { errors };
      return { value: { systolic: systolic.value, diastolic: diastolic.value }, errors };
    }
    case "MOOD":
      return values.mood === null ? { errors: { value: definition.formatErrorKey } } : { value: values.mood, errors: {} };
  }
}

/** Maps a MeasurementSchema issue path to the form fields that show it. */
function fieldsForPath(path: readonly PropertyKey[], definition: IndicatorDefinition): FieldName[] {
  const [first, second] = path;
  if (first === "astronautId") return ["astronautId"];
  if (first !== "value") return ["form"];
  if (definition.captureKind !== "BLOOD_PRESSURE") return ["value"];
  if (second === "systolic" || second === "diastolic") return [second];
  return ["systolic", "diastolic"];
}

/** Validates a complete measurement object with MeasurementSchema.safeParse. */
export function validateMeasurement(candidate: unknown, indicator: Indicator): ValidationResult {
  const result = MeasurementSchema.safeParse(candidate);
  if (result.success) {
    return { ok: true, measurement: result.data };
  }
  const definition = getIndicatorDefinition(indicator);
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    for (const field of fieldsForPath(issue.path, definition)) {
      const key =
        field === "astronautId" ? ERROR_KEYS.astronaut : field === "form" ? ERROR_KEYS.unexpected : definition.formatErrorKey;
      errors[field] ??= key;
    }
  }
  return { ok: false, errors };
}

/**
 * Whole form: strict text parsing, then buildMeasurement, then MeasurementSchema.safeParse.
 * Only a successful result may be saved.
 */
export function validateMeasurementForm(
  values: MeasurementFormValues,
  config: Pick<MissionConfigResponse, "clock" | "profile">,
  realNow: Date,
  newId: () => string,
): ValidationResult {
  const definition = getIndicatorDefinition(values.indicator);
  const { value, errors } = readValue(values, definition);
  if (values.astronautId.trim() === "") {
    errors.astronautId = ERROR_KEYS.astronaut;
  }
  if (value === undefined || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  try {
    const candidate = buildMeasurement(
      { astronautId: values.astronautId, indicator: values.indicator, context: values.context, value },
      config,
      realNow,
      newId,
    );
    return validateMeasurement(candidate, values.indicator);
  } catch {
    // computeSimNow throws RangeError on an invalid date; never save in that case.
    return { ok: false, errors: { form: ERROR_KEYS.unexpected } };
  }
}

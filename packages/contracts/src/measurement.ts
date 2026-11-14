import { z } from "zod";
import { DbIntSchema, IsoDateTimeSchema, PositiveDbIntSchema, UuidSchema } from "./common.js";
import { AstronautIdSchema } from "./crew.js";
import { EnvironmentProfileIdSchema } from "./environment.js";

export const IndicatorSchema = z.enum([
  "HEART_RATE",
  "BODY_TEMPERATURE",
  "BLOOD_GLUCOSE",
  "BLOOD_PRESSURE",
  "MOOD",
  "SLEEP",
]);
export type Indicator = z.infer<typeof IndicatorSchema>;

/** One unit per indicator in the MVP (DEC-2), with the code names of T-005 §3.1. */
export const UnitSchema = z.enum(["bpm", "degC", "mg_dL", "mmHg", "scale_1_5", "h"]);
export type Unit = z.infer<typeof UnitSchema>;

/** Closed catalog of contexts, valid for every indicator (DEC-3, T-005 §3.2). */
export const MeasurementContextSchema = z.enum([
  "AT_REST",
  "AFTER_EXERCISE",
  "AFTER_WAKING",
  "BEFORE_MEAL",
  "AFTER_MEAL",
]);
export type MeasurementContext = z.infer<typeof MeasurementContextSchema>;

/** Only `MANUAL` in the contract (T-005 §2.4). */
export const MeasurementOriginSchema = z.enum(["MANUAL"]);
export type MeasurementOrigin = z.infer<typeof MeasurementOriginSchema>;

/** Integer > 0 and <= MAX_DB_INT: technical limit, not clinical. */
const positiveDbInt = DbIntSchema.gt(0);

/**
 * Sleep "up to 2 decimals" with floating-point tolerance: `value * 100` must be within
 * 1e-9 of an integer. So `7.1` (710.0000000000001) is valid and `7.125` (712.5) is not.
 */
export function hasAtMostTwoDecimals(value: number): boolean {
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

const measurementBase = {
  id: UuidSchema,
  astronautId: AstronautIdSchema,
  context: MeasurementContextSchema,
  origin: MeasurementOriginSchema,
  capturedAtReal: IsoDateTimeSchema,
  capturedAtSim: IsoDateTimeSchema,
  // 1..MAX_DB_INT: technical limit, not clinical.
  clockVersion: PositiveDbIntSchema,
  envProfile: EnvironmentProfileIdSchema,
  // 1..MAX_DB_INT: technical limit, not clinical.
  envVersion: PositiveDbIntSchema,
};

// Value rules per indicator (T-005 §3.1): technical or definitional limits, never clinical.
// In Zod 4, `z.number()` already rejects Infinity and NaN, so every decimal is finite.

const HeartRateMeasurementSchema = z
  .object({
    ...measurementBase,
    indicator: z.literal("HEART_RATE"),
    // Integer > 0 and <= MAX_DB_INT: technical limit, not clinical.
    value: positiveDbInt,
    unit: z.literal("bpm"),
  })
  .strict();

const BodyTemperatureMeasurementSchema = z
  .object({
    ...measurementBase,
    indicator: z.literal("BODY_TEMPERATURE"),
    // Finite decimal > 0: technical limit, not clinical.
    value: z.number().gt(0),
    unit: z.literal("degC"),
  })
  .strict();

const BloodGlucoseMeasurementSchema = z
  .object({
    ...measurementBase,
    indicator: z.literal("BLOOD_GLUCOSE"),
    // Finite decimal > 0: technical limit, not clinical.
    value: z.number().gt(0),
    unit: z.literal("mg_dL"),
  })
  .strict();

export const BloodPressureValueSchema = z
  .object({
    // Each component: integer > 0 and <= MAX_DB_INT (technical limit, not clinical).
    // No relation between systolic and diastolic is checked: that would be a clinical rule.
    systolic: positiveDbInt,
    diastolic: positiveDbInt,
  })
  .strict();
export type BloodPressureValue = z.infer<typeof BloodPressureValueSchema>;

const BloodPressureMeasurementSchema = z
  .object({
    ...measurementBase,
    indicator: z.literal("BLOOD_PRESSURE"),
    value: BloodPressureValueSchema,
    unit: z.literal("mmHg"),
  })
  .strict();

const MoodMeasurementSchema = z
  .object({
    ...measurementBase,
    indicator: z.literal("MOOD"),
    // Integer 1-5: definition of the self-reported scale (DEC-4), not clinical.
    value: z.number().int().gte(1).lte(5),
    unit: z.literal("scale_1_5"),
  })
  .strict();

const SleepMeasurementSchema = z
  .object({
    ...measurementBase,
    indicator: z.literal("SLEEP"),
    // 0-24 h is the definition of "hours of sleep in a day" (DEC-1), not a health threshold.
    value: z
      .number()
      .gte(0)
      .lte(24)
      .refine(hasAtMostTwoDecimals, { message: "Sleep hours allow at most 2 decimals" }),
    unit: z.literal("h"),
  })
  .strict();

/** Discriminated by `indicator`, so `value` and `unit` always match (T-005 §2.4, §3.1). */
export const MeasurementSchema = z.discriminatedUnion("indicator", [
  HeartRateMeasurementSchema,
  BodyTemperatureMeasurementSchema,
  BloodGlucoseMeasurementSchema,
  BloodPressureMeasurementSchema,
  MoodMeasurementSchema,
  SleepMeasurementSchema,
]);

export type Measurement = z.infer<typeof MeasurementSchema>;

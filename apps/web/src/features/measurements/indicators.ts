import type { Indicator, MeasurementContext, Unit } from "@astra/contracts";

/** How the form captures each indicator (T-005 §3.1). */
export type CaptureKind = "INTEGER" | "DECIMAL" | "BLOOD_PRESSURE" | "MOOD";

export interface IndicatorDefinition {
  indicator: Indicator;
  /** Fixed unit code of the contract. It is shown, never chosen. */
  unit: Unit;
  captureKind: CaptureKind;
  labelKey: string;
  unitLabelKey: string;
  /** Neutral format message (never a health range) shown when the value is rejected. */
  formatErrorKey: string;
}

export const INDICATORS: readonly IndicatorDefinition[] = [
  {
    indicator: "HEART_RATE",
    unit: "bpm",
    captureKind: "INTEGER",
    labelKey: "pages.recordMeasurement.indicators.HEART_RATE",
    unitLabelKey: "pages.recordMeasurement.units.bpm",
    formatErrorKey: "pages.recordMeasurement.errors.wholeNumber",
  },
  {
    indicator: "BODY_TEMPERATURE",
    unit: "degC",
    captureKind: "DECIMAL",
    labelKey: "pages.recordMeasurement.indicators.BODY_TEMPERATURE",
    unitLabelKey: "pages.recordMeasurement.units.degC",
    formatErrorKey: "pages.recordMeasurement.errors.positiveNumber",
  },
  {
    indicator: "BLOOD_GLUCOSE",
    unit: "mg_dL",
    captureKind: "DECIMAL",
    labelKey: "pages.recordMeasurement.indicators.BLOOD_GLUCOSE",
    unitLabelKey: "pages.recordMeasurement.units.mg_dL",
    formatErrorKey: "pages.recordMeasurement.errors.positiveNumber",
  },
  {
    indicator: "BLOOD_PRESSURE",
    unit: "mmHg",
    captureKind: "BLOOD_PRESSURE",
    labelKey: "pages.recordMeasurement.indicators.BLOOD_PRESSURE",
    unitLabelKey: "pages.recordMeasurement.units.mmHg",
    formatErrorKey: "pages.recordMeasurement.errors.wholeNumber",
  },
  {
    indicator: "MOOD",
    unit: "scale_1_5",
    captureKind: "MOOD",
    labelKey: "pages.recordMeasurement.indicators.MOOD",
    unitLabelKey: "pages.recordMeasurement.units.scale_1_5",
    formatErrorKey: "pages.recordMeasurement.errors.mood",
  },
  {
    indicator: "SLEEP",
    unit: "h",
    captureKind: "DECIMAL",
    labelKey: "pages.recordMeasurement.indicators.SLEEP",
    unitLabelKey: "pages.recordMeasurement.units.h",
    formatErrorKey: "pages.recordMeasurement.errors.sleepHours",
  },
];

export function getIndicatorDefinition(indicator: Indicator): IndicatorDefinition {
  const definition = INDICATORS.find((item) => item.indicator === indicator);
  if (!definition) {
    throw new Error(`Unknown indicator: ${indicator}`);
  }
  return definition;
}

export interface ContextDefinition {
  context: MeasurementContext;
  labelKey: string;
}

/** Closed catalog of contexts (T-005 §3.2). */
export const CONTEXTS: readonly ContextDefinition[] = [
  { context: "AT_REST", labelKey: "pages.recordMeasurement.contexts.AT_REST" },
  { context: "AFTER_EXERCISE", labelKey: "pages.recordMeasurement.contexts.AFTER_EXERCISE" },
  { context: "AFTER_WAKING", labelKey: "pages.recordMeasurement.contexts.AFTER_WAKING" },
  { context: "BEFORE_MEAL", labelKey: "pages.recordMeasurement.contexts.BEFORE_MEAL" },
  { context: "AFTER_MEAL", labelKey: "pages.recordMeasurement.contexts.AFTER_MEAL" },
];

export const DEFAULT_CONTEXT: MeasurementContext = "AT_REST";

/** The self-reported mood scale (DEC-4). */
export const MOOD_VALUES: readonly number[] = [1, 2, 3, 4, 5];

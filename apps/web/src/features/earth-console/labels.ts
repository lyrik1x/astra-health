import type { IncidentEventType, IncidentState, Indicator, MeasurementContext, Unit } from "@astra/contracts";

// Translation keys for the Earth console. Indicator, unit and context reuse the text keys of
// pages.recordMeasurement.* (Bruno, 15 nov); nothing is imported from features/measurements.

export const INDICATOR_KEYS: Record<Indicator, string> = {
  HEART_RATE: "pages.recordMeasurement.indicators.HEART_RATE",
  BODY_TEMPERATURE: "pages.recordMeasurement.indicators.BODY_TEMPERATURE",
  BLOOD_GLUCOSE: "pages.recordMeasurement.indicators.BLOOD_GLUCOSE",
  BLOOD_PRESSURE: "pages.recordMeasurement.indicators.BLOOD_PRESSURE",
  MOOD: "pages.recordMeasurement.indicators.MOOD",
  SLEEP: "pages.recordMeasurement.indicators.SLEEP",
};

export const UNIT_KEYS: Record<Unit, string> = {
  bpm: "pages.recordMeasurement.units.bpm",
  degC: "pages.recordMeasurement.units.degC",
  mg_dL: "pages.recordMeasurement.units.mg_dL",
  mmHg: "pages.recordMeasurement.units.mmHg",
  scale_1_5: "pages.recordMeasurement.units.scale_1_5",
  h: "pages.recordMeasurement.units.h",
};

export const CONTEXT_KEYS: Record<MeasurementContext, string> = {
  AT_REST: "pages.recordMeasurement.contexts.AT_REST",
  AFTER_EXERCISE: "pages.recordMeasurement.contexts.AFTER_EXERCISE",
  AFTER_WAKING: "pages.recordMeasurement.contexts.AFTER_WAKING",
  BEFORE_MEAL: "pages.recordMeasurement.contexts.BEFORE_MEAL",
  AFTER_MEAL: "pages.recordMeasurement.contexts.AFTER_MEAL",
};

/** Incident states as text (never a clinical label). `null`: Earth has no opening event yet. */
export const STATE_KEYS: Record<IncidentState, string> = {
  ACTIVE: "pages.console.states.ACTIVE",
  GUIDED: "pages.console.states.GUIDED",
  AWAITING_REVIEW: "pages.console.states.AWAITING_REVIEW",
  CLOSED: "pages.console.states.CLOSED",
  CANCELLED: "pages.console.states.CANCELLED",
};
export const UNKNOWN_STATE_KEY = "pages.console.states.unknown";

export const EVENT_TYPE_KEYS: Record<IncidentEventType, string> = {
  INCIDENT_OPENED: "pages.console.eventTypes.INCIDENT_OPENED",
  GUIDE_STARTED: "pages.console.eventTypes.GUIDE_STARTED",
  GUIDE_STEP_COMPLETED: "pages.console.eventTypes.GUIDE_STEP_COMPLETED",
  REPORT_SUBMITTED: "pages.console.eventTypes.REPORT_SUBMITTED",
  INCIDENT_CLOSED: "pages.console.eventTypes.INCIDENT_CLOSED",
  INCIDENT_CANCELLED: "pages.console.eventTypes.INCIDENT_CANCELLED",
  EARTH_REVIEW: "pages.console.eventTypes.EARTH_REVIEW",
};

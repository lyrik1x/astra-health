// Fictitious, valid sample data for the contracts tests only. Not exported from index.ts.
// UUIDs are fixed RFC 9562 v4 values (Zod 4 checks version and variant).
import type { z } from "zod";

export const IDS = {
  measurement: "11111111-1111-4111-8111-111111111111",
  incident: "22222222-2222-4222-8222-222222222222",
  event: "33333333-3333-4333-8333-333333333333",
  review: "44444444-4444-4444-8444-444444444444",
  message: "55555555-5555-4555-8555-555555555555",
  transmission: "66666666-6666-4666-8666-666666666666",
} as const;

export const T = "2026-11-14T16:08:43.193Z";
export const DELIVER_AT = "2026-11-14T18:08:43.193Z";

type Data = Record<string, unknown>;

/** true when `schema` accepts `value`. */
export function parses(schema: z.ZodType, value: unknown): boolean {
  return schema.safeParse(value).success;
}

const measurementBase = {
  id: IDS.measurement,
  astronautId: "sam",
  context: "AT_REST",
  origin: "MANUAL",
  capturedAtReal: T,
  capturedAtSim: T,
  clockVersion: 1,
  envProfile: "MARS_TRANSIT",
  envVersion: 1,
};

export const measurements = {
  HEART_RATE: { ...measurementBase, indicator: "HEART_RATE", value: 80, unit: "bpm" },
  BODY_TEMPERATURE: { ...measurementBase, indicator: "BODY_TEMPERATURE", value: 36.6, unit: "degC" },
  BLOOD_GLUCOSE: { ...measurementBase, indicator: "BLOOD_GLUCOSE", value: 95.5, unit: "mg_dL" },
  BLOOD_PRESSURE: {
    ...measurementBase,
    indicator: "BLOOD_PRESSURE",
    value: { systolic: 120, diastolic: 80 },
    unit: "mmHg",
  },
  MOOD: { ...measurementBase, indicator: "MOOD", value: 3, unit: "scale_1_5" },
  SLEEP: { ...measurementBase, indicator: "SLEEP", value: 7.5, unit: "h" },
} satisfies Record<string, Data>;

const shipEventBase = {
  id: IDS.event,
  incidentId: IDS.incident,
  astronautId: "sam",
  actor: "SHIP",
  sequence: 1,
  createdAtReal: T,
  createdAtSim: T,
  clockVersion: 1,
};

export const events = {
  opened: { ...shipEventBase, type: "INCIDENT_OPENED", data: {} },
  guideStarted: { ...shipEventBase, type: "GUIDE_STARTED", data: { guideVersion: "astra-guide-1" } },
  stepCompleted: { ...shipEventBase, type: "GUIDE_STEP_COMPLETED", data: { stepId: "rest" } },
  reportSubmitted: { ...shipEventBase, type: "REPORT_SUBMITTED", data: { note: "Fictitious note" } },
  closedReviewed: {
    ...shipEventBase,
    type: "INCIDENT_CLOSED",
    data: { closureReason: "REVIEWED", reviewEventId: IDS.review },
  },
  closedWithoutReview: {
    ...shipEventBase,
    type: "INCIDENT_CLOSED",
    data: { closureReason: "CLOSED_WITHOUT_REVIEW" },
  },
  cancelled: { ...shipEventBase, type: "INCIDENT_CANCELLED", data: { reason: "Opened by mistake" } },
  earthReview: {
    id: IDS.review,
    incidentId: IDS.incident,
    astronautId: "sam",
    actor: "EARTH",
    type: "EARTH_REVIEW",
    createdAtReal: T,
    createdAtSim: T,
    clockVersion: 1,
    data: { text: "Fictitious review" },
  },
} satisfies Record<string, Data>;

export const message: Data = {
  id: IDS.message,
  astronautId: "sam",
  direction: "SHIP_TO_EARTH",
  body: "Hello Earth",
  createdAtReal: T,
  createdAtSim: T,
  clockVersion: 1,
};

export function transmission(contentKind: string, contentId: string, direction: string): Data {
  return {
    id: IDS.transmission,
    direction,
    contentKind,
    contentId,
    acceptedAtReal: T,
    acceptedAtSim: T,
    deliverAt: DELIVER_AT,
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
  };
}

export const clock: Data = {
  simEpoch: "2026-11-14T12:00:00.000Z",
  realEpoch: "2026-11-14T16:00:00.000Z",
  factor: 60,
  clockVersion: 1,
};

export const profile: Data = {
  profile: "MARS_TRANSIT",
  version: 1,
  oneWayDelayMinutesSim: 120,
  delaySource: "SIMULATED",
  description: "Simulated one-way delay for the demo",
};

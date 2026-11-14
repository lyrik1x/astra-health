import { z } from "zod";
import { IsoDateTimeSchema, NonBlankText, PositiveDbIntSchema, UuidSchema } from "./common.js";
import { AstronautIdSchema } from "./crew.js";

export const ActorSchema = z.enum(["SHIP", "EARTH"]);
export type Actor = z.infer<typeof ActorSchema>;

export const IncidentEventTypeSchema = z.enum([
  "INCIDENT_OPENED",
  "GUIDE_STARTED",
  "GUIDE_STEP_COMPLETED",
  "REPORT_SUBMITTED",
  "INCIDENT_CLOSED",
  "INCIDENT_CANCELLED",
  "EARTH_REVIEW",
]);
export type IncidentEventType = z.infer<typeof IncidentEventTypeSchema>;

/** Persisted incident states (ARCHITECTURE §9). "No active incident" is not persisted. */
export const IncidentStateSchema = z.enum([
  "ACTIVE",
  "GUIDED",
  "AWAITING_REVIEW",
  "CLOSED",
  "CANCELLED",
]);
export type IncidentState = z.infer<typeof IncidentStateSchema>;

const eventBase = {
  id: UuidSchema,
  incidentId: UuidSchema,
  astronautId: AstronautIdSchema,
  createdAtReal: IsoDateTimeSchema,
  createdAtSim: IsoDateTimeSchema,
  // 1..MAX_DB_INT: technical limit, not clinical.
  clockVersion: PositiveDbIntSchema,
};

/** Ship events: actor fixed to SHIP (Q1) and `sequence` required. */
const shipEventBase = {
  ...eventBase,
  actor: z.literal("SHIP"),
  // 1..MAX_DB_INT, consecutive per incident (technical limit, not clinical).
  sequence: PositiveDbIntSchema,
};

const IncidentOpenedEventSchema = z
  .object({
    ...shipEventBase,
    type: z.literal("INCIDENT_OPENED"),
    data: z.object({}).strict(),
  })
  .strict();

const GuideStartedEventSchema = z
  .object({
    ...shipEventBase,
    type: z.literal("GUIDE_STARTED"),
    // 1-100 characters, free text without a fixed list (Q3): format limit, not clinical.
    data: z.object({ guideVersion: NonBlankText(1, 100) }).strict(),
  })
  .strict();

const GuideStepCompletedEventSchema = z
  .object({
    ...shipEventBase,
    type: z.literal("GUIDE_STEP_COMPLETED"),
    // 1-100 characters, free text without a fixed list (Q3): format limit, not clinical.
    data: z.object({ stepId: NonBlankText(1, 100) }).strict(),
  })
  .strict();

const ReportSubmittedEventSchema = z
  .object({
    ...shipEventBase,
    type: z.literal("REPORT_SUBMITTED"),
    // Optional; if present, 1-500 non-blank characters (Q2): format limit, not clinical.
    data: z.object({ note: NonBlankText(1, 500).optional() }).strict(),
  })
  .strict();

/** `reviewEventId` is required with REVIEWED and forbidden without it (DEC-9). */
export const IncidentClosedDataSchema = z.discriminatedUnion("closureReason", [
  z.object({ closureReason: z.literal("REVIEWED"), reviewEventId: UuidSchema }).strict(),
  z.object({ closureReason: z.literal("CLOSED_WITHOUT_REVIEW") }).strict(),
]);
export type IncidentClosedData = z.infer<typeof IncidentClosedDataSchema>;

const IncidentClosedEventSchema = z
  .object({
    ...shipEventBase,
    type: z.literal("INCIDENT_CLOSED"),
    data: IncidentClosedDataSchema,
  })
  .strict();

const IncidentCancelledEventSchema = z
  .object({
    ...shipEventBase,
    type: z.literal("INCIDENT_CANCELLED"),
    // 1-200 characters: format limit, not clinical.
    data: z.object({ reason: NonBlankText(1, 200) }).strict(),
  })
  .strict();

/** Earth review: actor fixed to EARTH (Q1); `sequence` is absent (the strict object rejects it). */
const EarthReviewEventSchema = z
  .object({
    ...eventBase,
    actor: z.literal("EARTH"),
    type: z.literal("EARTH_REVIEW"),
    // 1-500 characters: format limit, not clinical.
    data: z.object({ text: NonBlankText(1, 500) }).strict(),
  })
  .strict();

/** Discriminated by `type` (T-005 §2.5). The state machine is out of scope (T-402). */
export const IncidentEventSchema = z.discriminatedUnion("type", [
  IncidentOpenedEventSchema,
  GuideStartedEventSchema,
  GuideStepCompletedEventSchema,
  ReportSubmittedEventSchema,
  IncidentClosedEventSchema,
  IncidentCancelledEventSchema,
  EarthReviewEventSchema,
]);

export type IncidentEvent = z.infer<typeof IncidentEventSchema>;

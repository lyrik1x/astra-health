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

/** Discriminated by `type` (T-005 §2.5). The state machine is below (T-402). */
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

// ---------------------------------------------------------------------------------------------
// State machine (T-402): pure functions shared by the client and the server (T-005 §2.5).
// The table is PROJECT_SPEC §7.2, confirmed by Bruno on 15 nov 2026. Nothing else is allowed.
// ---------------------------------------------------------------------------------------------

/** Every event type except EARTH_REVIEW: the ship owns the incident (AGENTS.md §10). */
export type ShipIncidentEventType = Exclude<IncidentEventType, "EARTH_REVIEW">;
export type ShipIncidentEvent = Exclude<IncidentEvent, { type: "EARTH_REVIEW" }>;
export type EarthReviewEvent = Extract<IncidentEvent, { type: "EARTH_REVIEW" }>;

interface ShipTransition {
  /** States the event is allowed from; `null` is "no incident" (not persisted). */
  from: readonly (IncidentState | null)[];
  to: IncidentState;
}

/**
 * PROJECT_SPEC §7.2. EARTH_REVIEW is not here: it is only valid in AWAITING_REVIEW for Earth
 * and never changes the state (a late review after a terminal state is kept, ARCHITECTURE §9).
 */
const SHIP_TRANSITIONS: Readonly<Record<ShipIncidentEventType, ShipTransition>> = {
  INCIDENT_OPENED: { from: [null], to: "ACTIVE" },
  GUIDE_STARTED: { from: ["ACTIVE"], to: "GUIDED" },
  GUIDE_STEP_COMPLETED: { from: ["GUIDED"], to: "GUIDED" },
  REPORT_SUBMITTED: { from: ["ACTIVE", "GUIDED"], to: "AWAITING_REVIEW" },
  INCIDENT_CLOSED: { from: ["AWAITING_REVIEW"], to: "CLOSED" },
  INCIDENT_CANCELLED: { from: ["ACTIVE", "GUIDED", "AWAITING_REVIEW"], to: "CANCELLED" },
};

const TERMINAL_STATES: readonly IncidentState[] = ["CLOSED", "CANCELLED"];

/** CLOSED and CANCELLED accept no further ship event. */
export function isTerminalIncidentState(state: IncidentState): boolean {
  return TERMINAL_STATES.includes(state);
}

export function isShipIncidentEvent(event: IncidentEvent): event is ShipIncidentEvent {
  return event.type !== "EARTH_REVIEW";
}

/** State after applying a ship event of `type` to `state`, or `null` if §7.2 does not allow it. */
export function nextIncidentState(state: IncidentState | null, type: ShipIncidentEventType): IncidentState | null {
  const transition = SHIP_TRANSITIONS[type];
  return transition.from.includes(state) ? transition.to : null;
}

function bySequence(a: ShipIncidentEvent, b: ShipIncidentEvent): number {
  return a.sequence - b.sequence;
}

/**
 * State of ONE incident from its ship events (EARTH_REVIEW is ignored: it never changes the state).
 * The events are applied by `sequence`. Returns `null` if there is no INCIDENT_OPENED (e.g. Earth
 * does not see it yet). Throws if the events break §7.2: an accepted history never does, so that
 * is corrupted data and must not be hidden.
 */
export function projectIncidentState(events: readonly IncidentEvent[]): IncidentState | null {
  const shipEvents = events.filter(isShipIncidentEvent).sort(bySequence);
  if (!shipEvents.some((event) => event.type === "INCIDENT_OPENED")) return null;

  let state: IncidentState | null = null;
  for (const event of shipEvents) {
    const next = nextIncidentState(state, event.type);
    if (next === null) {
      throw new Error(`Incident ${event.incidentId}: ${event.type} (sequence ${event.sequence}) is not allowed from ${state ?? "no incident"}`);
    }
    state = next;
  }
  return state;
}

export type NextShipEventCheck = { ok: true } | { ok: false; code: "INVALID_TRANSITION" | "SEQUENCE_GAP" };

/**
 * Checks that `next` can follow the already accepted events of its incident (ARCHITECTURE §9.1):
 * 1. Sequence: `next.sequence` must be the number of previous ship events + 1.
 *    Higher -> SEQUENCE_GAP (a predecessor is missing; retryable).
 *    Lower -> INVALID_TRANSITION (that place of the chain is already taken; the server answers
 *    SEQUENCE_OCCUPIED before calling this function when another UUID holds it).
 * 2. Transition: exactly the table of PROJECT_SPEC §7.2. EARTH_REVIEW, or an event of another
 *    incident or astronaut, is INVALID_TRANSITION here.
 * `previousShipEvents` are the accepted events of ONE incident; EARTH_REVIEW among them is ignored.
 */
export function validateNextShipEvent(
  previousShipEvents: readonly IncidentEvent[],
  next: IncidentEvent,
): NextShipEventCheck {
  if (!isShipIncidentEvent(next)) return { ok: false, code: "INVALID_TRANSITION" };

  const previous = previousShipEvents.filter(isShipIncidentEvent);
  const expectedSequence = previous.length + 1;
  if (next.sequence > expectedSequence) return { ok: false, code: "SEQUENCE_GAP" };
  if (next.sequence < expectedSequence) return { ok: false, code: "INVALID_TRANSITION" };

  const sameIncident = previous.every(
    (event) => event.incidentId === next.incidentId && event.astronautId === next.astronautId,
  );
  if (!sameIncident) return { ok: false, code: "INVALID_TRANSITION" };

  const state = projectIncidentState(previous);
  // Previous events without INCIDENT_OPENED are not a valid chain: nothing can follow them.
  if (previous.length > 0 && state === null) return { ok: false, code: "INVALID_TRANSITION" };
  return nextIncidentState(state, next.type) === null ? { ok: false, code: "INVALID_TRANSITION" } : { ok: true };
}

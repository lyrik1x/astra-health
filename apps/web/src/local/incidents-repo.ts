import {
  IncidentEventSchema,
  isShipIncidentEvent,
  isTerminalIncidentState,
  projectIncidentState,
  validateNextShipEvent,
  type IncidentClosedData,
  type IncidentEvent,
  type IncidentEventWithTransmission,
  type IncidentState,
  type Transmission,
} from "@astra/contracts";
import { getShipDb, type ShipDb } from "../db/ship-db";
import type { LocalIncidentEventRecord, OutboxEntry } from "../db/schema";
import { canonicalJson } from "./canonical-json";
import { captureTimesFor } from "./capture-times";
import type { HydrateOutcome } from "./measurements-repo";
import { getLocalMissionConfig } from "./mission-config-repo";

// T-402 Parte B: incidents of the ship, saved on the device and sent through the outbox.
// The state is always a projection of the local events (projectIncidentState); nothing stores it.
// Every write is append-only: an event is never changed, only its local sync fields.

/** Without the local copy of the clock there are no capture times (T-202 §3.6). */
export class MissionConfigMissingError extends Error {
  constructor() {
    super("The mission clock has not been downloaded yet; sync once with the server first");
    this.name = "MissionConfigMissingError";
  }
}

/** One unfinished incident per astronaut (AGENTS.md §10, QA-301). */
export class IncidentAlreadyOpenError extends Error {
  constructor(readonly astronautId: string, readonly incidentId: string) {
    super(`Astronaut ${astronautId} already has an unfinished incident (${incidentId})`);
    this.name = "IncidentAlreadyOpenError";
  }
}

export class IncidentNotFoundError extends Error {
  constructor(readonly incidentId: string) {
    super(`There is no local incident ${incidentId}`);
    this.name = "IncidentNotFoundError";
  }
}

/** The event does not follow PROJECT_SPEC §7.2 from the current local state. */
export class IncidentTransitionError extends Error {
  constructor(readonly code: "INVALID_TRANSITION" | "SEQUENCE_GAP", readonly state: IncidentState | null) {
    super(`The event is not allowed from the state ${state ?? "no incident"} (${code})`);
    this.name = "IncidentTransitionError";
  }
}

/** REVIEWED needs an EARTH_REVIEW of this incident already received (delivered) on the ship. */
export class ReviewNotReceivedError extends Error {
  constructor(readonly reviewEventId: string) {
    super(`The review ${reviewEventId} has not been received for this incident`);
    this.name = "ReviewNotReceivedError";
  }
}

/** The unfinished incident as the ship sees it, rebuilt from Dexie (works offline and after reload). */
export interface LocalIncident {
  incidentId: string;
  astronautId: string;
  state: IncidentState;
  /** Ship events, by sequence. */
  events: LocalIncidentEventRecord[];
  /** Earth reviews received (only delivered ones reach the ship), by acceptance. */
  reviews: LocalIncidentEventRecord[];
}

export type ClosureReason = IncidentClosedData["closureReason"];

/** Only the contract payload, without local fields: what syncOnce sends (S2). */
export function toContractIncidentEvent(record: LocalIncidentEventRecord): IncidentEvent {
  const { syncState, localOrigin, savedAtReal, transmission, lastError, ...payload } = record;
  return IncidentEventSchema.parse(payload);
}

function bySequence(a: LocalIncidentEventRecord, b: LocalIncidentEventRecord): number {
  return sequenceOf(a) - sequenceOf(b);
}

function sequenceOf(record: LocalIncidentEventRecord): number {
  return record.type === "EARTH_REVIEW" ? 0 : record.sequence;
}

function byAcceptance(a: LocalIncidentEventRecord, b: LocalIncidentEventRecord): number {
  const diff = Date.parse(a.transmission?.acceptedAtSim ?? a.createdAtSim) - Date.parse(b.transmission?.acceptedAtSim ?? b.createdAtSim);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Local events of one incident, split into ship events (by sequence) and reviews. */
async function eventsOfIncident(incidentId: string, db: ShipDb) {
  const all = await db.incidentEvents.where("incidentId").equals(incidentId).toArray();
  const events = all.filter((record) => record.type !== "EARTH_REVIEW").sort(bySequence);
  const reviews = all.filter((record) => record.type === "EARTH_REVIEW").sort(byAcceptance);
  return { events, reviews };
}

/**
 * The unfinished incident of the astronaut (state not CLOSED or CANCELLED), or null.
 * Read only from Dexie: works without connection and after a reload (QA-303).
 */
export async function getOpenIncident(astronautId: string, db: ShipDb = getShipDb()): Promise<LocalIncident | null> {
  // No index on astronautId (db/ is out of scope of T-402); the ship has few incident events.
  const shipEvents = await db.incidentEvents
    .filter((record) => record.astronautId === astronautId && record.type !== "EARTH_REVIEW")
    .toArray();
  const incidentIds = [...new Set(shipEvents.map((record) => record.incidentId))];
  for (const incidentId of incidentIds) {
    const { events, reviews } = await eventsOfIncident(incidentId, db);
    const state = projectIncidentState(events);
    if (state !== null && !isTerminalIncidentState(state)) {
      return { incidentId, astronautId, state, events, reviews };
    }
  }
  return null;
}

/**
 * Builds the next ship event of an incident, validates it (IncidentEventSchema and
 * validateNextShipEvent) and saves it WITH its outbox entry. Always called inside
 * writeTransaction, so both are written or neither is. Anything invalid throws and writes nothing.
 */
async function appendShipEvent(
  incident: { incidentId: string; astronautId: string },
  previous: LocalIncidentEventRecord[],
  type: string,
  data: object,
  realNow: Date,
  db: ShipDb,
): Promise<LocalIncidentEventRecord> {
  const config = await getLocalMissionConfig(db);
  if (config === null) throw new MissionConfigMissingError();
  const times = captureTimesFor(config, realNow);

  const event = IncidentEventSchema.parse({
    id: crypto.randomUUID(),
    incidentId: incident.incidentId,
    astronautId: incident.astronautId,
    actor: "SHIP",
    sequence: previous.length + 1,
    type,
    createdAtReal: times.capturedAtReal,
    createdAtSim: times.capturedAtSim,
    clockVersion: times.clockVersion,
    data,
  });
  const check = validateNextShipEvent(previous.map(toContractIncidentEvent), event);
  if (!check.ok) throw new IncidentTransitionError(check.code, projectIncidentState(previous));

  const savedAtReal = realNow.toISOString();
  const record: LocalIncidentEventRecord = { ...event, syncState: "SAVED_LOCAL", localOrigin: "CAPTURED", savedAtReal };
  const entry: OutboxEntry = { id: event.id, kind: "INCIDENT_EVENT", savedAtReal, attempts: 0 };
  // `add` (not `put`): an existing id or (incidentId, sequence) fails instead of overwriting.
  await db.incidentEvents.add(record);
  await db.outbox.add(entry);
  return record;
}

/**
 * Reads (open incident, previous events, clock) and writes (event + outbox entry) in ONE Dexie
 * transaction: two quick taps cannot open two incidents or take the same sequence.
 */
function writeTransaction<T>(db: ShipDb, work: () => Promise<T>): Promise<T> {
  return db.transaction("rw", db.incidentEvents, db.outbox, db.config, work);
}

/** Ship events of an existing local incident; throws IncidentNotFoundError if there is none. */
async function existingIncident(incidentId: string, db: ShipDb) {
  const { events, reviews } = await eventsOfIncident(incidentId, db);
  const first = events[0];
  if (first === undefined) throw new IncidentNotFoundError(incidentId);
  return { incident: { incidentId, astronautId: first.astronautId }, events, reviews };
}

/** INCIDENT_OPENED of a new incident. Fails if the astronaut already has an unfinished one. */
export async function openIncident(
  astronautId: string,
  realNow: Date,
  db: ShipDb = getShipDb(),
): Promise<LocalIncidentEventRecord> {
  return writeTransaction(db, async () => {
    const open = await getOpenIncident(astronautId, db);
    if (open !== null) throw new IncidentAlreadyOpenError(astronautId, open.incidentId);
    return appendShipEvent({ incidentId: crypto.randomUUID(), astronautId }, [], "INCIDENT_OPENED", {}, realNow, db);
  });
}

/** GUIDE_STARTED with the version of the local guide used (ARCHITECTURE §9). */
export async function startGuide(
  incidentId: string,
  guideVersion: string,
  realNow: Date,
  db: ShipDb = getShipDb(),
): Promise<LocalIncidentEventRecord> {
  return writeTransaction(db, async () => {
    const { incident, events } = await existingIncident(incidentId, db);
    return appendShipEvent(incident, events, "GUIDE_STARTED", { guideVersion }, realNow, db);
  });
}

export async function completeGuideStep(
  incidentId: string,
  stepId: string,
  realNow: Date,
  db: ShipDb = getShipDb(),
): Promise<LocalIncidentEventRecord> {
  return writeTransaction(db, async () => {
    const { incident, events } = await existingIncident(incidentId, db);
    return appendShipEvent(incident, events, "GUIDE_STEP_COMPLETED", { stepId }, realNow, db);
  });
}

/** REPORT_SUBMITTED: the alert, sent explicitly by the astronaut (AGENTS.md §10). `note` is optional. */
export async function submitReport(
  incidentId: string,
  note: string | undefined,
  realNow: Date,
  db: ShipDb = getShipDb(),
): Promise<LocalIncidentEventRecord> {
  return writeTransaction(db, async () => {
    const { incident, events } = await existingIncident(incidentId, db);
    return appendShipEvent(incident, events, "REPORT_SUBMITTED", note === undefined ? {} : { note }, realNow, db);
  });
}

/**
 * INCIDENT_CLOSED. With REVIEWED, `reviewEventId` must be an EARTH_REVIEW of this incident
 * already received on the ship and delivered by the closure time (T-005 §5.3).
 */
export async function closeIncident(
  incidentId: string,
  reason: ClosureReason,
  reviewEventId: string | undefined,
  realNow: Date,
  db: ShipDb = getShipDb(),
): Promise<LocalIncidentEventRecord> {
  return writeTransaction(db, async () => {
    const { incident, events, reviews } = await existingIncident(incidentId, db);
    if (reason === "CLOSED_WITHOUT_REVIEW") {
      return appendShipEvent(incident, events, "INCIDENT_CLOSED", { closureReason: reason }, realNow, db);
    }

    const review = reviews.find((record) => record.id === reviewEventId);
    const config = await getLocalMissionConfig(db);
    const closureSim = config === null ? null : Date.parse(captureTimesFor(config, realNow).capturedAtSim);
    const delivered =
      review?.transmission !== undefined && closureSim !== null && Date.parse(review.transmission.deliverAt) <= closureSim;
    if (reviewEventId === undefined || !delivered) {
      throw new ReviewNotReceivedError(reviewEventId ?? "(none)");
    }
    return appendShipEvent(incident, events, "INCIDENT_CLOSED", { closureReason: reason, reviewEventId }, realNow, db);
  });
}

export async function cancelIncident(
  incidentId: string,
  reason: string,
  realNow: Date,
  db: ShipDb = getShipDb(),
): Promise<LocalIncidentEventRecord> {
  return writeTransaction(db, async () => {
    const { incident, events } = await existingIncident(incidentId, db);
    return appendShipEvent(incident, events, "INCIDENT_CANCELLED", { reason }, realNow, db);
  });
}

// ----- Sync side (T-405): same rules as the measurements (T-203). -----

/** Outbox entries of later events of the same incident that `id` no longer blocks. */
async function clearBlockedBy(id: string, db: ShipDb): Promise<void> {
  await db.outbox
    .filter((entry) => entry.blockedBy === id)
    .modify((entry) => {
      delete entry.blockedBy;
    });
}

/** ACCEPTED or DUPLICATE: CONFIRMED with its transmission; ONLY its outbox entry is pruned. */
export async function markIncidentEventConfirmed(id: string, transmission: Transmission, db: ShipDb = getShipDb()): Promise<void> {
  await db.transaction("rw", db.incidentEvents, db.outbox, async () => {
    await db.incidentEvents.update(id, { syncState: "CONFIRMED", transmission, lastError: undefined });
    await db.outbox.delete(id);
    await clearBlockedBy(id, db);
  });
}

/**
 * Permanent rejection. The event and its outbox entry are kept with the error visible, and the
 * later events of the same incident are marked `blockedBy` this event (T-005 §6.2): not sent.
 */
export async function markIncidentEventSyncError(id: string, lastError: string, db: ShipDb = getShipDb()): Promise<void> {
  await db.transaction("rw", db.incidentEvents, db.outbox, async () => {
    const record = await db.incidentEvents.get(id);
    await db.incidentEvents.update(id, { syncState: "SYNC_ERROR", lastError });
    if (record === undefined || record.type === "EARTH_REVIEW") return;
    const rejectedSequence = record.sequence;
    const laterIds = (await db.incidentEvents.where("incidentId").equals(record.incidentId).toArray())
      .filter((other) => other.type !== "EARTH_REVIEW" && other.sequence > rejectedSequence)
      .map((other) => other.id);
    await db.outbox
      .where("id")
      .anyOf(laterIds)
      .modify((entry) => {
        entry.blockedBy ??= id;
      });
  });
}

/** Transient failure or retryable INVALID (e.g. SEQUENCE_GAP): PENDING_SYNC with `attempts + 1`. */
export async function markIncidentEventPending(id: string, db: ShipDb = getShipDb()): Promise<void> {
  await db.transaction("rw", db.incidentEvents, db.outbox, async () => {
    await db.incidentEvents.update(id, { syncState: "PENDING_SYNC" });
    await db.outbox
      .where("id")
      .equals(id)
      .modify((entry) => {
        entry.attempts += 1;
      });
  });
}

/**
 * Inbound reception of one event from GET /api/incidents (D-22, T-402 §5). Never changes a
 * local payload and never deletes:
 * - not stored: added as HYDRATED + CONFIRMED (reviews and own events from another device),
 *   unless another local event already holds its (incidentId, sequence) -> MISMATCH, untouched;
 * - stored with the SAME canonical payload: transmission updated, CONFIRMED, outbox entry pruned;
 * - stored with a DIFFERENT payload: MISMATCH, untouched.
 */
export async function upsertHydratedIncidentEvent(
  item: IncidentEventWithTransmission,
  realNow: Date,
  db: ShipDb = getShipDb(),
): Promise<HydrateOutcome> {
  const incoming = IncidentEventSchema.parse(item.event);
  return db.transaction("rw", db.incidentEvents, db.outbox, async () => {
    const existing = await db.incidentEvents.get(incoming.id);
    if (existing === undefined) {
      if (isShipIncidentEvent(incoming)) {
        const holder = await db.incidentEvents
          .where("[incidentId+sequence]")
          .equals([incoming.incidentId, incoming.sequence])
          .first();
        if (holder !== undefined) return "MISMATCH";
      }
      await db.incidentEvents.add({
        ...incoming,
        syncState: "CONFIRMED",
        localOrigin: "HYDRATED",
        savedAtReal: realNow.toISOString(),
        transmission: item.transmission,
      });
      return "ADDED";
    }
    if (canonicalJson(toContractIncidentEvent(existing)) !== canonicalJson(incoming)) {
      return "MISMATCH";
    }
    await db.incidentEvents.update(incoming.id, {
      syncState: "CONFIRMED",
      transmission: item.transmission,
      lastError: undefined,
    });
    await db.outbox.delete(incoming.id);
    await clearBlockedBy(incoming.id, db);
    return "UPDATED";
  });
}

import { getShipDb, type ShipDb } from "../db/ship-db";
import type { LocalIncidentEventRecord, LocalMeasurementRecord, OutboxEntry } from "../db/schema";

/**
 * Pending items, oldest first (by savedAtReal). Read-only here: updating and pruning the outbox
 * after CONFIRMED lives in measurements-repo.ts (T-203) and incidents-repo.ts (T-405).
 */
export async function listOutbox(db: ShipDb = getShipDb()): Promise<OutboxEntry[]> {
  return db.outbox.orderBy("savedAtReal").toArray();
}

export interface PendingMeasurement {
  entry: OutboxEntry;
  record: LocalMeasurementRecord;
}

/**
 * MEASUREMENT outbox entries to send (T-203 §4.1), by savedAtReal. Entries whose record is in
 * SYNC_ERROR are skipped (no automatic resend); they and their records are kept.
 */
export async function listPendingMeasurementOutbox(db: ShipDb = getShipDb()): Promise<PendingMeasurement[]> {
  const entries = (await listOutbox(db)).filter((entry) => entry.kind === "MEASUREMENT");
  const records = await db.measurements.bulkGet(entries.map((entry) => entry.id));
  const pending: PendingMeasurement[] = [];
  entries.forEach((entry, index) => {
    const record = records[index];
    if (record !== undefined && record.syncState !== "SYNC_ERROR") {
      pending.push({ entry, record });
    }
  });
  return pending;
}

export type PendingItem =
  | { kind: "MEASUREMENT"; entry: OutboxEntry; record: LocalMeasurementRecord }
  | { kind: "INCIDENT_EVENT"; entry: OutboxEntry; record: LocalIncidentEventRecord };

function shipSequence(record: LocalIncidentEventRecord): number {
  return record.type === "EARTH_REVIEW" ? 0 : record.sequence;
}

/**
 * Everything syncOnce sends (T-005 §6.2), by savedAtReal and, inside one incident, by sequence.
 * Skipped (kept, never deleted):
 * - records in SYNC_ERROR (no automatic resend);
 * - incident events after an event of the same incident in SYNC_ERROR: their entry gets
 *   `blockedBy` = the rejected event (shown as "blocked by rejected event #n").
 */
export async function listPendingOutbox(db: ShipDb = getShipDb()): Promise<PendingItem[]> {
  const entries = await listOutbox(db);
  const measurementEntries = entries.filter((entry) => entry.kind === "MEASUREMENT");
  const eventEntries = entries.filter((entry) => entry.kind === "INCIDENT_EVENT");
  const measurements = await db.measurements.bulkGet(measurementEntries.map((entry) => entry.id));
  const events = await db.incidentEvents.bulkGet(eventEntries.map((entry) => entry.id));
  const measurementById = new Map(measurementEntries.map((entry, index) => [entry.id, measurements[index]]));
  const eventById = new Map(eventEntries.map((entry, index) => [entry.id, events[index]]));

  // First rejected ship event of each incident (lowest sequence), from every local event.
  const incidentIds = new Set(events.flatMap((record) => (record === undefined ? [] : [record.incidentId])));
  const firstRejected = new Map<string, LocalIncidentEventRecord>();
  for (const incidentId of incidentIds) {
    const rejected = (await db.incidentEvents.where("incidentId").equals(incidentId).toArray())
      .filter((record) => record.type !== "EARTH_REVIEW" && record.syncState === "SYNC_ERROR")
      .sort((a, b) => shipSequence(a) - shipSequence(b))[0];
    if (rejected !== undefined) firstRejected.set(incidentId, rejected);
  }

  const pending: PendingItem[] = [];
  for (const entry of entries) {
    if (entry.kind === "MEASUREMENT") {
      const record = measurementById.get(entry.id);
      if (record !== undefined && record.syncState !== "SYNC_ERROR") pending.push({ kind: "MEASUREMENT", entry, record });
      continue;
    }
    if (entry.kind !== "INCIDENT_EVENT") continue;
    const record = eventById.get(entry.id);
    if (record === undefined || record.syncState === "SYNC_ERROR") continue;
    const blocker = firstRejected.get(record.incidentId);
    if (blocker !== undefined && shipSequence(record) > shipSequence(blocker)) {
      if (entry.blockedBy === undefined) await db.outbox.update(entry.id, { blockedBy: blocker.id });
      continue;
    }
    pending.push({ kind: "INCIDENT_EVENT", entry, record });
  }
  return keepSequenceOrder(pending);
}

/**
 * savedAtReal already orders the list. If the device clock went back, a later event of an
 * incident could come first: the events of each incident are put back in sequence order,
 * in the positions the incident already had in the list.
 */
function keepSequenceOrder(pending: PendingItem[]): PendingItem[] {
  const positions = new Map<string, number[]>();
  pending.forEach((item, index) => {
    if (item.kind !== "INCIDENT_EVENT") return;
    const list = positions.get(item.record.incidentId) ?? [];
    list.push(index);
    positions.set(item.record.incidentId, list);
  });
  const result = [...pending];
  for (const indexes of positions.values()) {
    const items = indexes
      .map((index) => pending[index]!)
      .sort((a, b) => shipSequence(a.record as LocalIncidentEventRecord) - shipSequence(b.record as LocalIncidentEventRecord));
    indexes.forEach((index, position) => {
      result[index] = items[position]!;
    });
  }
  return result;
}

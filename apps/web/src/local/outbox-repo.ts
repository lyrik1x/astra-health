import { getShipDb, type ShipDb } from "../db/ship-db";
import type { LocalMeasurementRecord, OutboxEntry } from "../db/schema";

/**
 * Pending items, oldest first (by savedAtReal). Read-only here:
 * updating and pruning the outbox after CONFIRMED lives in measurements-repo.ts (T-203).
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

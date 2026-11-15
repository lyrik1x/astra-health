import Dexie from "dexie";
import { MeasurementSchema, type Measurement, type MeasurementWithTransmission, type Transmission } from "@astra/contracts";
import { getShipDb, type ShipDb } from "../db/ship-db";
import type { LocalMeasurementRecord, OutboxEntry } from "../db/schema";

/** A record with the same id is already stored. It is never overwritten. */
export class LocalRecordExistsError extends Error {
  constructor(id: string) {
    super(`A local record with id ${id} already exists; it is not overwritten`);
    this.name = "LocalRecordExistsError";
  }
}

/**
 * Saves a captured measurement and its outbox entry in ONE Dexie transaction:
 * either both are written or neither is (T-202 §3.3).
 * Validates with MeasurementSchema first; an invalid measurement throws and writes nothing.
 * `realNow` is the same instant as the capture (S3).
 */
export async function saveMeasurementLocal(
  measurement: unknown,
  realNow: Date,
  db: ShipDb = getShipDb(),
): Promise<LocalMeasurementRecord> {
  const valid = MeasurementSchema.parse(measurement);
  const savedAtReal = realNow.toISOString();

  const record: LocalMeasurementRecord = {
    ...valid,
    syncState: "SAVED_LOCAL",
    localOrigin: "CAPTURED",
    savedAtReal,
  };
  const entry: OutboxEntry = { id: valid.id, kind: "MEASUREMENT", savedAtReal, attempts: 0 };

  try {
    await db.transaction("rw", db.measurements, db.outbox, async () => {
      // `add` (not `put`): an existing id fails instead of overwriting.
      await db.measurements.add(record);
      await db.outbox.add(entry);
    });
  } catch (error) {
    if (isConstraintError(error)) {
      throw new LocalRecordExistsError(valid.id);
    }
    throw error;
  }
  return record;
}

/**
 * Measurements of one astronaut, ordered by capturedAtSim, capturedAtReal and id
 * (the same order as the API and the engine).
 */
export async function listMeasurementsLocal(
  astronautId: string,
  db: ShipDb = getShipDb(),
): Promise<LocalMeasurementRecord[]> {
  // Uses the [astronautId+indicator] index with any indicator, so no extra index is needed.
  const records = await db.measurements
    .where("[astronautId+indicator]")
    .between([astronautId, Dexie.minKey], [astronautId, Dexie.maxKey], true, true)
    .toArray();
  return records.sort(compareMeasurements);
}

/** Only the contract payload, without local fields: what T-203 sends (S2). */
export function toContractMeasurement(record: LocalMeasurementRecord): Measurement {
  const { syncState, localOrigin, savedAtReal, transmission, lastError, ...payload } = record;
  return MeasurementSchema.parse(payload);
}

/**
 * T-203: the channel answered ACCEPTED or DUPLICATE. In ONE transaction the record goes to
 * CONFIRMED with its transmission and ONLY its outbox entry is pruned. The record itself is kept.
 */
export async function markMeasurementConfirmed(
  id: string,
  transmission: Transmission,
  db: ShipDb = getShipDb(),
): Promise<void> {
  await db.transaction("rw", db.measurements, db.outbox, async () => {
    await db.measurements.update(id, { syncState: "CONFIRMED", transmission, lastError: undefined });
    await db.outbox.delete(id);
  });
}

/**
 * T-203: permanent rejection (CONFLICT or non-retryable INVALID). The record and its outbox
 * entry are kept; the error stays visible and the item is no longer sent automatically.
 */
export async function markMeasurementSyncError(id: string, lastError: string, db: ShipDb = getShipDb()): Promise<void> {
  await db.measurements.update(id, { syncState: "SYNC_ERROR", lastError });
}

/** T-203: transient failure or retryable INVALID. Back to PENDING_SYNC with `attempts + 1`. */
export async function markMeasurementPending(id: string, db: ShipDb = getShipDb()): Promise<void> {
  await db.transaction("rw", db.measurements, db.outbox, async () => {
    await db.measurements.update(id, { syncState: "PENDING_SYNC" });
    await db.outbox
      .where("id")
      .equals(id)
      .modify((entry) => {
        entry.attempts += 1;
      });
  });
}

/** ADDED: new HYDRATED record. UPDATED: same payload, transmission refreshed. MISMATCH: untouched. */
export type HydrateOutcome = "ADDED" | "UPDATED" | "MISMATCH";

/**
 * Inbound reception (D-22, T-203 §4.2). Never changes a local payload:
 * - not stored locally: added as HYDRATED + CONFIRMED with its transmission;
 * - stored with the SAME canonical payload: transmission updated, CONFIRMED, its outbox entry pruned;
 * - stored with a DIFFERENT payload (e.g. a local record in SYNC_ERROR by CONFLICT): nothing changes.
 * `realNow` is the savedAtReal of a hydrated record.
 */
export async function upsertHydratedMeasurement(
  item: MeasurementWithTransmission,
  realNow: Date,
  db: ShipDb = getShipDb(),
): Promise<HydrateOutcome> {
  const incoming = MeasurementSchema.parse(item.measurement);
  return db.transaction("rw", db.measurements, db.outbox, async () => {
    const existing = await db.measurements.get(incoming.id);
    if (existing === undefined) {
      await db.measurements.add({
        ...incoming,
        syncState: "CONFIRMED",
        localOrigin: "HYDRATED",
        savedAtReal: realNow.toISOString(),
        transmission: item.transmission,
      });
      return "ADDED";
    }
    if (canonicalJson(toContractMeasurement(existing)) !== canonicalJson(incoming)) {
      return "MISMATCH";
    }
    await db.measurements.update(incoming.id, {
      syncState: "CONFIRMED",
      transmission: item.transmission,
      lastError: undefined,
    });
    await db.outbox.delete(incoming.id);
    return "UPDATED";
  });
}

/**
 * Keys sorted recursively, arrays keep their order: the same rule as the server
 * (apps/api/src/common/canonical-json.ts), applied to payloads already parsed by MeasurementSchema.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function compareMeasurements(a: LocalMeasurementRecord, b: LocalMeasurementRecord): number {
  return (
    Date.parse(a.capturedAtSim) - Date.parse(b.capturedAtSim) ||
    Date.parse(a.capturedAtReal) - Date.parse(b.capturedAtReal) ||
    compareText(a.id, b.id)
  );
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && error.name === "ConstraintError";
}

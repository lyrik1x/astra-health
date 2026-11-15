import Dexie from "dexie";
import { MeasurementSchema, type Measurement } from "@astra/contracts";
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

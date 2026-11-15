import type { Measurement } from "@astra/contracts";

/**
 * Interface that T-202 implements with Dexie. Only validated measurements are saved.
 * TEMPORAL: this module keeps measurements in memory only; they are lost on reload.
 */
export interface MeasurementStore {
  saveMeasurement(measurement: Measurement): Promise<void>;
}

const captured = new Map<string, Measurement>();

/** In-memory save. A repeated id never overwrites the first record (AGENTS.md §7). */
export async function saveMeasurement(measurement: Measurement): Promise<void> {
  if (!captured.has(measurement.id)) {
    captured.set(measurement.id, measurement);
  }
}

/** Measurements captured in this session, in capture order. */
export function listCapturedMeasurements(): readonly Measurement[] {
  return [...captured.values()];
}

/** For tests only. */
export function clearCapturedMeasurements(): void {
  captured.clear();
}

export const inMemoryMeasurementStore: MeasurementStore = { saveMeasurement };

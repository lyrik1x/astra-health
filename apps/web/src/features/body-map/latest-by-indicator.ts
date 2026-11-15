import type { Indicator } from "@astra/contracts";
import type { LocalMeasurementRecord } from "../../db/schema";

/** The latest record of each indicator. An indicator without records has no entry. */
export type LatestByIndicator = Partial<Record<Indicator, LocalMeasurementRecord>>;

/** Ordinal comparison with `<` and `>` (D-49): the same on every device and locale, no `localeCompare`. */
function compareOrdinal(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Same order as the health engine (T-709): `capturedAtSim`, then `capturedAtReal`, then `id`.
 * So the body map never shows a "latest record" different from the rest of the app.
 */
function compareRecords(left: LocalMeasurementRecord, right: LocalMeasurementRecord): number {
  return (
    compareOrdinal(left.capturedAtSim, right.capturedAtSim) ||
    compareOrdinal(left.capturedAtReal, right.capturedAtReal) ||
    compareOrdinal(left.id, right.id)
  );
}

/**
 * Pure: receives the local measurements of ONE astronaut and returns the most recent one per indicator.
 * It does not change the input and does not depend on the order of the input.
 */
export function latestByIndicator(records: readonly LocalMeasurementRecord[]): LatestByIndicator {
  const latest: LatestByIndicator = {};
  for (const record of records) {
    const current = latest[record.indicator];
    if (current === undefined || compareRecords(record, current) > 0) {
      latest[record.indicator] = record;
    }
  }
  return latest;
}

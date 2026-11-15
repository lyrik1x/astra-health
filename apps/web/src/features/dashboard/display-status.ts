import { RejectionCodeSchema, computeSimNow, type RejectionCode } from "@astra/contracts";
import type { DisplayStatus } from "../../components/StatusBadge";
import type { LocalFields, LocalMissionConfig } from "../../db/schema";

/** Any local record with sync fields (measurement, incident event or message). */
export type SyncedRecord = Pick<LocalFields, "syncState" | "lastError" | "transmission">;

export interface DisplayBadge {
  status: DisplayStatus;
  errorCode?: RejectionCode;
}

/** The code before ":" in lastError ("UUID_CONFLICT: ..."), if it is a known rejection code. */
function errorCodeOf(lastError: string | undefined): RejectionCode | undefined {
  if (lastError === undefined) return undefined;
  const parsed = RejectionCodeSchema.safeParse(lastError.split(":")[0]?.trim());
  return parsed.success ? parsed.data : undefined;
}

/**
 * Pure: the badges of one local record (T-005 §6.1).
 * CONFIRMED gives two badges, because confirmed by the channel is not delivered:
 * the transport state compares the local simulated clock with transmission.deliverAt.
 * Without a local config (or transmission) only "Confirmed by channel" is shown.
 */
export function displayStatusFor(
  record: SyncedRecord,
  config: Pick<LocalMissionConfig, "clock"> | null,
  realNow: Date,
): DisplayBadge[] {
  switch (record.syncState) {
    case "SAVED_LOCAL":
    case "PENDING_SYNC":
      return [{ status: record.syncState }];
    case "SYNC_ERROR": {
      const errorCode = errorCodeOf(record.lastError);
      return [errorCode ? { status: "SYNC_ERROR", errorCode } : { status: "SYNC_ERROR" }];
    }
    case "CONFIRMED": {
      if (config === null || record.transmission === undefined) {
        return [{ status: "CONFIRMED" }];
      }
      const simNow = Date.parse(computeSimNow(config.clock, realNow));
      const delivered = simNow >= Date.parse(record.transmission.deliverAt);
      return [{ status: "CONFIRMED" }, { status: delivered ? "DELIVERED" : "IN_TRANSIT" }];
    }
  }
}

import { MeasurementsResponseSchema } from "@astra/contracts";
import { apiFetch, type ApiFetch } from "../api/client";
import { getShipDb, type ShipDb } from "../db/ship-db";
import { getLocalCrew } from "../local/crew-repo";
import { upsertHydratedMeasurement } from "../local/measurements-repo";

export interface ReceiveInboundDeps {
  api?: ApiFetch;
  db?: ShipDb;
  now?: () => Date;
}

export interface InboundSummary {
  added: number;
  updated: number;
  /** Server payload differs from the local one (e.g. local SYNC_ERROR by CONFLICT): left untouched. */
  mismatched: number;
}

/**
 * Single inbound reception service (D-22, T-203 §4.2). Ship only: downloads the history of each
 * astronaut of the LOCAL crew and merges it by UUID, so downloading twice creates no duplicates
 * (QA-112). Never changes a local payload and never deletes domain records.
 * Throws on a network error, a non-2xx answer or an invalid body (the caller decides).
 */
export async function receiveInbound({
  api = apiFetch,
  db = getShipDb(),
  now = () => new Date(),
}: ReceiveInboundDeps = {}): Promise<InboundSummary> {
  const summary: InboundSummary = { added: 0, updated: 0, mismatched: 0 };
  const crew = (await getLocalCrew(db)) ?? [];

  for (const astronaut of crew) {
    const path = `/api/measurements?astronautId=${encodeURIComponent(astronaut.id)}`;
    const response = await api(path);
    if (!response.ok) {
      throw new Error(`GET ${path} failed with HTTP ${response.status}`);
    }
    const body = MeasurementsResponseSchema.parse(await response.json());
    for (const item of body.items) {
      const outcome = await upsertHydratedMeasurement(item, now(), db);
      if (outcome === "ADDED") summary.added += 1;
      else if (outcome === "UPDATED") summary.updated += 1;
      else summary.mismatched += 1;
    }
  }
  return summary;
}

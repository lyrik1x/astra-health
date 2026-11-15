import { IncidentsResponseSchema, MeasurementsResponseSchema } from "@astra/contracts";
import { apiFetch, type ApiFetch } from "../api/client";
import { getShipDb, type ShipDb } from "../db/ship-db";
import { getLocalCrew } from "../local/crew-repo";
import { upsertHydratedIncidentEvent } from "../local/incidents-repo";
import { upsertHydratedMeasurement, type HydrateOutcome } from "../local/measurements-repo";

export interface ReceiveInboundDeps {
  api?: ApiFetch;
  db?: ShipDb;
  now?: () => Date;
}

export interface HydrateCounts {
  added: number;
  updated: number;
  /** Server payload differs from the local one (e.g. local SYNC_ERROR by CONFLICT): left untouched. */
  mismatched: number;
}

/** Measurements at the top level (T-203); incident events (T-405) apart. */
export interface InboundSummary extends HydrateCounts {
  incidentEvents: HydrateCounts;
}

function emptyCounts(): HydrateCounts {
  return { added: 0, updated: 0, mismatched: 0 };
}

function count(counts: HydrateCounts, outcome: HydrateOutcome): void {
  if (outcome === "ADDED") counts.added += 1;
  else if (outcome === "UPDATED") counts.updated += 1;
  else counts.mismatched += 1;
}

/**
 * Single inbound reception service (D-22, T-203 §4.2, T-402 §5). Ship only: downloads, for each
 * astronaut of the LOCAL crew, the measurement history and the incidents (own events and the
 * EARTH_REVIEW already delivered), and merges them by UUID, so downloading twice creates no
 * duplicates (QA-112). Never changes a local payload and never deletes domain records.
 * Throws on a network error, a non-2xx answer or an invalid body (the caller decides).
 */
export async function receiveInbound({
  api = apiFetch,
  db = getShipDb(),
  now = () => new Date(),
}: ReceiveInboundDeps = {}): Promise<InboundSummary> {
  const summary: InboundSummary = { ...emptyCounts(), incidentEvents: emptyCounts() };
  const crew = (await getLocalCrew(db)) ?? [];

  for (const astronaut of crew) {
    const id = encodeURIComponent(astronaut.id);

    const measurements = MeasurementsResponseSchema.parse(await getJson(api, `/api/measurements?astronautId=${id}`));
    for (const item of measurements.items) {
      count(summary, await upsertHydratedMeasurement(item, now(), db));
    }

    const incidents = IncidentsResponseSchema.parse(await getJson(api, `/api/incidents?astronautId=${id}`));
    for (const incident of incidents.incidents) {
      for (const item of incident.events) {
        count(summary.incidentEvents, await upsertHydratedIncidentEvent(item, now(), db));
      }
    }
  }
  return summary;
}

async function getJson(api: ApiFetch, path: string): Promise<unknown> {
  const response = await api(path);
  if (!response.ok) {
    throw new Error(`GET ${path} failed with HTTP ${response.status}`);
  }
  return response.json();
}

import { IncidentsResponseSchema, type AstronautId, type IncidentsResponse } from "@astra/contracts";
import { apiFetch, type ApiFetch } from "./client";

/**
 * Calls GET /api/incidents?astronautId= and validates the body with the shared contract.
 * `state` and `events` are the projection the server computes for the querying role.
 */
export async function fetchIncidents(astronautId: AstronautId, fetcher: ApiFetch = apiFetch): Promise<IncidentsResponse> {
  const response = await fetcher(`/api/incidents?astronautId=${encodeURIComponent(astronautId)}`);
  if (!response.ok) {
    throw new Error(`GET /api/incidents failed with HTTP ${response.status}`);
  }
  return IncidentsResponseSchema.parse(await response.json());
}

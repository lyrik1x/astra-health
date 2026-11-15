import { MeasurementsResponseSchema, type AstronautId, type MeasurementsResponse } from "@astra/contracts";
import { apiFetch, type ApiFetch } from "./client";

/**
 * Calls GET /api/measurements?astronautId= and validates the body with the shared contract.
 * The API already filters by role and `deliverAt` (Earth only sees delivered measurements).
 */
export async function fetchMeasurements(astronautId: AstronautId, fetcher: ApiFetch = apiFetch): Promise<MeasurementsResponse> {
  const response = await fetcher(`/api/measurements?astronautId=${encodeURIComponent(astronautId)}`);
  if (!response.ok) {
    throw new Error(`GET /api/measurements failed with HTTP ${response.status}`);
  }
  return MeasurementsResponseSchema.parse(await response.json());
}

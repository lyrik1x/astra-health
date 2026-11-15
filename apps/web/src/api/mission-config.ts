import { MissionConfigResponseSchema, type MissionConfigResponse } from "@astra/contracts";
import { apiFetch } from "./client";

/** Calls GET /api/mission/config and validates the body with the shared contract. */
export async function fetchMissionConfig(): Promise<MissionConfigResponse> {
  const response = await apiFetch("/api/mission/config");
  if (!response.ok) {
    throw new Error(`GET /api/mission/config failed with HTTP ${response.status}`);
  }
  return MissionConfigResponseSchema.parse(await response.json());
}

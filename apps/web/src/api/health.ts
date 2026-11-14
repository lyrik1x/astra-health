import { HealthResponseSchema, type HealthResponse } from "@astra/contracts";
import { apiFetch } from "./client";

/** Calls GET /api/health and validates the body with the shared contract. */
export async function fetchHealth(): Promise<HealthResponse> {
  const response = await apiFetch("/api/health");
  if (!response.ok) {
    throw new Error(`GET /api/health failed with HTTP ${response.status}`);
  }
  return HealthResponseSchema.parse(await response.json());
}

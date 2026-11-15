import { CrewResponseSchema, type CrewResponse } from "@astra/contracts";
import { apiFetch } from "./client";

/** Calls GET /api/crew and validates the body with the shared contract. */
export async function fetchCrew(): Promise<CrewResponse> {
  const response = await apiFetch("/api/crew");
  if (!response.ok) {
    throw new Error(`GET /api/crew failed with HTTP ${response.status}`);
  }
  return CrewResponseSchema.parse(await response.json());
}

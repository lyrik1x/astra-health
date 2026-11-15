import { AstronautSchema, CrewResponseSchema, type Astronaut } from "@astra/contracts";
import { apiFetch } from "../api/client";
import { getShipDb, type ShipDb } from "../db/ship-db";
import { CREW_KEY } from "../db/schema";
import type { LocalRepoDeps } from "./mission-config-repo";

/**
 * Downloads GET /api/crew (route of T-105), validates it and saves the crew locally (DEC-6 C).
 * If the API fails or the body is invalid, it throws and the previous copy is kept.
 */
export async function refreshCrew({ api = apiFetch, db = getShipDb() }: LocalRepoDeps = {}): Promise<Astronaut[]> {
  const response = await api("/api/crew");
  if (!response.ok) {
    throw new Error(`GET /api/crew failed with HTTP ${response.status}`);
  }
  const { crew } = CrewResponseSchema.parse(await response.json());
  await db.config.put({ key: CREW_KEY, value: crew });
  return crew;
}

/** The saved crew, or null if it was never downloaded. */
export async function getLocalCrew(db: ShipDb = getShipDb()): Promise<Astronaut[] | null> {
  const entry = await db.config.get(CREW_KEY);
  if (!entry || entry.key !== CREW_KEY) {
    return null;
  }
  return AstronautSchema.array().parse(entry.value);
}

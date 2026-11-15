import { EnvironmentProfileSchema, MissionClockSchema, MissionConfigResponseSchema } from "@astra/contracts";
import { apiFetch, type ApiFetch } from "../api/client";
import { getShipDb, type ShipDb } from "../db/ship-db";
import { MISSION_CONFIG_KEY, type LocalMissionConfig } from "../db/schema";

export interface LocalRepoDeps {
  api?: ApiFetch;
  db?: ShipDb;
}

/**
 * Downloads GET /api/mission/config, validates it and saves the clock and profile locally.
 * If the API fails or the body is invalid, it throws and the previous copy is kept.
 */
export async function refreshMissionConfig({ api = apiFetch, db = getShipDb() }: LocalRepoDeps = {}): Promise<LocalMissionConfig> {
  const response = await api("/api/mission/config");
  if (!response.ok) {
    throw new Error(`GET /api/mission/config failed with HTTP ${response.status}`);
  }
  const body = MissionConfigResponseSchema.parse(await response.json());
  const value: LocalMissionConfig = { clock: body.clock, profile: body.profile };
  await db.config.put({ key: MISSION_CONFIG_KEY, value });
  return value;
}

/** The saved copy, or null if it was never downloaded. */
export async function getLocalMissionConfig(db: ShipDb = getShipDb()): Promise<LocalMissionConfig | null> {
  const entry = await db.config.get(MISSION_CONFIG_KEY);
  if (!entry || entry.key !== MISSION_CONFIG_KEY) {
    return null;
  }
  return {
    clock: MissionClockSchema.parse(entry.value.clock),
    profile: EnvironmentProfileSchema.parse(entry.value.profile),
  };
}

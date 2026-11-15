import type {
  Astronaut,
  ContentKind,
  EnvironmentProfile,
  IncidentEvent,
  Measurement,
  Message,
  MissionClock,
  Transmission,
} from "@astra/contracts";

/**
 * Local-only types (T-005 §6). They are NOT part of the contracts and are never sent to the API:
 * T-203 sends only the contract payload (S2, T-202).
 */

/** Sync states of a local record (T-005 §6.1, DEC-5). */
export type LocalSyncState = "SAVED_LOCAL" | "PENDING_SYNC" | "CONFIRMED" | "SYNC_ERROR";

/** `CAPTURED` on this device, or `HYDRATED` from the API history (T-005 §6.2). */
export type LocalOrigin = "CAPTURED" | "HYDRATED";

/** Fields that live only in Dexie, next to the domain record. */
export interface LocalFields {
  syncState: LocalSyncState;
  localOrigin: LocalOrigin;
  /** ISO date of the local save (S3: the same realNow as the capture). */
  savedAtReal: string;
  transmission?: Transmission;
  lastError?: string;
}

export type LocalMeasurementRecord = Measurement & LocalFields;
export type LocalIncidentEventRecord = IncidentEvent & LocalFields;
export type LocalMessageRecord = Message & LocalFields;

/** One pending item for the channel. `id` is the UUID of the content (T-005 §6.2). */
export interface OutboxEntry {
  id: string;
  kind: ContentKind;
  savedAtReal: string;
  attempts: number;
  blockedBy?: string;
}

/** Local copy of the clock and the environment profile (from GET /api/mission/config). */
export interface LocalMissionConfig {
  clock: MissionClock;
  profile: EnvironmentProfile;
}

export const MISSION_CONFIG_KEY = "missionConfig";
export const CREW_KEY = "crew";

/** Rows of the `config` table, one per key. */
export type ConfigEntry =
  | { key: typeof MISSION_CONFIG_KEY; value: LocalMissionConfig }
  | { key: typeof CREW_KEY; value: Astronaut[] };

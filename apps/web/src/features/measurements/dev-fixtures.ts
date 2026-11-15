// TEMPORAL: se retira al integrar T-105 (GET /api/crew) y T-502 (GET /api/mission/config).
// Integration: in RecordMeasurementPage.tsx replace `loadCrew` / `loadMissionConfig` with
// `fetchCrew` / `fetchMissionConfig` from src/api/, then delete this file and its test.
// Fictional data only. Both responses are validated with the shared contracts.
import {
  CrewResponseSchema,
  MissionConfigResponseSchema,
  type CrewResponse,
  type MissionConfigResponse,
} from "@astra/contracts";

const DEV_EPOCH = "2026-11-14T00:00:00.000Z";

/** Simulated GET /api/crew response (Sam and Alex, T-005 seed). */
export const devCrew: CrewResponse = CrewResponseSchema.parse({
  crew: [
    { id: "sam", displayName: "Sam" },
    { id: "alex", displayName: "Alex" },
  ],
});

/** Simulated GET /api/mission/config response (DEC-10: factor 60, MARS_TRANSIT v1, 120 min). */
export const devMissionConfig: MissionConfigResponse = MissionConfigResponseSchema.parse({
  clock: { simEpoch: DEV_EPOCH, realEpoch: DEV_EPOCH, factor: 60, clockVersion: 1 },
  profile: {
    profile: "MARS_TRANSIT",
    version: 1,
    oneWayDelayMinutesSim: 120,
    delaySource: "SIMULATED",
    description: "Simulated Mars transit delay (fictional)",
  },
  serverSimNow: DEV_EPOCH,
});

/** Same signature as fetchCrew in src/api/crew.ts. */
export async function loadCrew(): Promise<CrewResponse> {
  return devCrew;
}

/** Same signature as fetchMissionConfig in src/api/mission-config.ts. */
export async function loadMissionConfig(): Promise<MissionConfigResponse> {
  return devMissionConfig;
}

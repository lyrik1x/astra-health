// Fictional mission config for the tests of this folder only. Not imported by the app.
import { MissionConfigResponseSchema, type MissionConfigResponse } from "@astra/contracts";

const TEST_EPOCH = "2026-11-14T00:00:00.000Z";

/** Same shape as GET /api/mission/config (factor 60, MARS_TRANSIT v1, 120 min simulated). */
export const testMissionConfig: MissionConfigResponse = MissionConfigResponseSchema.parse({
  clock: { simEpoch: TEST_EPOCH, realEpoch: TEST_EPOCH, factor: 60, clockVersion: 1 },
  profile: {
    profile: "MARS_TRANSIT",
    version: 1,
    oneWayDelayMinutesSim: 120,
    delaySource: "SIMULATED",
    description: "Simulated Mars transit delay (fictional)",
  },
  serverSimNow: TEST_EPOCH,
});

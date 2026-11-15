// TEMPORAL: se retira junto con dev-fixtures.ts al integrar T-105 y T-502.
import { describe, expect, it } from "vitest";
import { CrewResponseSchema, MissionConfigResponseSchema } from "@astra/contracts";
import { devCrew, devMissionConfig, loadCrew, loadMissionConfig } from "./dev-fixtures";

describe("dev fixtures", () => {
  it("crew matches CrewResponseSchema (Sam and Alex)", () => {
    expect(CrewResponseSchema.safeParse(devCrew).success).toBe(true);
    expect(devCrew.crew.map((astronaut) => astronaut.id)).toEqual(["sam", "alex"]);
  });

  it("mission config matches MissionConfigResponseSchema (DEC-10)", () => {
    expect(MissionConfigResponseSchema.safeParse(devMissionConfig).success).toBe(true);
    expect(devMissionConfig.clock.factor).toBe(60);
    expect(devMissionConfig.clock.clockVersion).toBe(1);
    expect(devMissionConfig.profile).toMatchObject({ profile: "MARS_TRANSIT", version: 1, oneWayDelayMinutesSim: 120 });
  });

  it("loaders resolve to the same fixtures", async () => {
    await expect(loadCrew()).resolves.toBe(devCrew);
    await expect(loadMissionConfig()).resolves.toBe(devMissionConfig);
  });
});

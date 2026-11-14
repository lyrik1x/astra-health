import { describe, expect, it } from "vitest";
import { MissionClockSchema, computeSimNow, type MissionClock } from "@astra/contracts";
import { engineVersion } from "@astra/health-engine";

describe("shared packages in apps/web", () => {
  it("uses a type, a Zod schema and a function from contracts", () => {
    const clock: MissionClock = MissionClockSchema.parse({
      simEpoch: "2026-11-14T12:00:00.000Z",
      realEpoch: "2026-11-14T16:00:00.000Z",
      factor: 60,
      clockVersion: 1,
    });
    const realNow = new Date(Date.parse(clock.realEpoch) + 10_000);
    expect(computeSimNow(clock, realNow)).toBe("2026-11-14T12:10:00.000Z");
  });

  it("uses a function from health-engine", () => {
    expect(engineVersion()).toBe("0.1.0");
  });
});

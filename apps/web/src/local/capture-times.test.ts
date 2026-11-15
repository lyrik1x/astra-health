import { computeSimNow, MissionConfigResponseSchema } from "@astra/contracts";
import { describe, expect, it } from "vitest";
import { captureTimesFor } from "./capture-times";
import { missionConfigBody } from "./test-fixtures";

const { clock, profile } = MissionConfigResponseSchema.parse(missionConfigBody);
const config = { clock, profile };

describe("captureTimesFor", () => {
  it("matches computeSimNow for a fixed realNow", () => {
    // realEpoch + 1 s with factor 60 → simEpoch + 60 s.
    const realNow = new Date("2026-11-14T16:00:01.000Z");

    expect(captureTimesFor(config, realNow)).toEqual({
      capturedAtReal: "2026-11-14T16:00:01.000Z",
      capturedAtSim: computeSimNow(clock, realNow),
      clockVersion: 2,
      envProfile: "MARS_TRANSIT",
      envVersion: 1,
    });
    expect(captureTimesFor(config, realNow).capturedAtSim).toBe("2026-01-01T00:01:00.000Z");
  });

  it("is pure: same input, same output", () => {
    const realNow = new Date("2026-11-14T18:30:00.000Z");
    expect(captureTimesFor(config, realNow)).toEqual(captureTimesFor(config, realNow));
  });
});

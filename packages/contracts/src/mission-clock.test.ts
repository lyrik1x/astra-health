import { describe, expect, it } from "vitest";
import { MissionClockSchema, computeSimNow, type MissionClock } from "./index.js";

const clock: MissionClock = {
  simEpoch: "2026-11-14T12:00:00.000Z",
  realEpoch: "2026-11-14T16:00:00.000Z",
  factor: 60,
  clockVersion: 1,
};

describe("computeSimNow", () => {
  it("returns simEpoch when realNow equals realEpoch (anchor)", () => {
    expect(computeSimNow(clock, new Date(clock.realEpoch))).toBe(clock.simEpoch);
  });

  it("advances 10 simulated minutes after 10 real seconds with factor 60", () => {
    const realNow = new Date(Date.parse(clock.realEpoch) + 10_000);
    expect(computeSimNow(clock, realNow)).toBe("2026-11-14T12:10:00.000Z");
  });

  it("floors fractional simulated milliseconds with a decimal factor", () => {
    const decimalClock: MissionClock = { ...clock, factor: 1.5 };
    // 1 real ms × 1.5 = 1.5 simulated ms → Math.floor → 1 ms
    const realNow = new Date(Date.parse(clock.realEpoch) + 1);
    expect(computeSimNow(decimalClock, realNow)).toBe("2026-11-14T12:00:00.001Z");
    // 3 real ms × 1.5 = 4.5 simulated ms → Math.floor → 4 ms
    const later = new Date(Date.parse(clock.realEpoch) + 3);
    expect(computeSimNow(decimalClock, later)).toBe("2026-11-14T12:00:00.004Z");
  });

  it("throws RangeError for an invalid realNow", () => {
    expect(() => computeSimNow(clock, new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe("MissionClockSchema", () => {
  it("accepts a valid clock", () => {
    expect(MissionClockSchema.safeParse(clock).success).toBe(true);
  });

  it("rejects an invalid clock", () => {
    const invalid = [
      { ...clock, factor: 0 },
      { ...clock, clockVersion: 0 },
      { ...clock, simEpoch: "2026-11-14T12:00:00Z" },
      { ...clock, realEpoch: "2026-11-14T16:00:00.000+01:00" },
      { ...clock, extra: true },
    ];
    for (const candidate of invalid) {
      expect(MissionClockSchema.safeParse(candidate).success).toBe(false);
    }
  });
});

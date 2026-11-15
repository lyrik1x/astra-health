import {
  EnvironmentProfileSchema,
  MeasurementSchema,
} from "@astra/contracts";
import { canonicalJson } from "../src/common/canonical-json.js";
import { createSeedMeasurements, SEED_PROFILE } from "../src/seed/seed-data.js";
import { seedDatabase } from "../src/seed/seed.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

const SEED_NOW = new Date("2026-11-14T10:00:00.000Z");

describe("seedDatabase", () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  }, 60_000);

  afterEach(async () => {
    await db?.cleanup();
  });

  it("creates the fixed demo data and is repeatable without overwriting the clock", async () => {
    await seedDatabase(db.prisma, SEED_NOW);
    const clockBefore = await db.prisma.missionClock.findUniqueOrThrow({ where: { id: 1 } });
    await seedDatabase(db.prisma, new Date("2026-12-01T00:00:00.000Z"));

    expect(await db.prisma.missionClock.count()).toBe(1);
    expect(await db.prisma.astronaut.count()).toBe(2);
    expect(await db.prisma.environmentProfile.count()).toBe(1);
    expect(await db.prisma.measurement.count()).toBe(11);
    expect(await db.prisma.transmission.count()).toBe(11);
    expect(await db.prisma.missionClock.findUniqueOrThrow({ where: { id: 1 } })).toEqual(clockBefore);
    expect(clockBefore).toMatchObject({ factor: 60, clockVersion: 1 });
    expect(clockBefore.realEpoch.toISOString()).toBe(SEED_NOW.toISOString());
    expect(EnvironmentProfileSchema.parse(SEED_PROFILE)).toEqual(SEED_PROFILE);
    expect(await db.prisma.astronaut.findMany({ orderBy: { id: "asc" } })).toEqual([
      { id: "alex", displayName: "Alex" },
      { id: "sam", displayName: "Sam" },
    ]);
  });

  it("preserves an existing clock and stores validated canonical measurements with paired transmissions", async () => {
    const existingClock = {
      id: 1,
      simEpoch: new Date("2026-01-01T00:00:00.000Z"),
      realEpoch: new Date("2026-01-02T00:00:00.000Z"),
      factor: 12,
      clockVersion: 4,
    };
    await db.prisma.missionClock.create({ data: existingClock });
    await seedDatabase(db.prisma, SEED_NOW);

    expect(await db.prisma.missionClock.findUniqueOrThrow({ where: { id: 1 } })).toEqual(existingClock);
    const expected = createSeedMeasurements();
    const stored = await db.prisma.measurement.findMany({ include: { transmission: true }, orderBy: { id: "asc" } });
    expect(stored).toHaveLength(expected.length);
    for (const row of stored) {
      const payload = MeasurementSchema.parse(JSON.parse(row.payloadCanonical));
      const expectedItem = expected.find((item) => item.measurement.id === row.id);
      expect(expectedItem).toBeDefined();
      expect(payload).toEqual(expectedItem?.measurement);
      expect(row.payloadCanonical).toBe(canonicalJson(payload));
      expect(row.transmission.id).toBe(expectedItem?.transmissionId);
      expect(row.transmission).toMatchObject({
        direction: "SHIP_TO_EARTH",
        contentKind: "MEASUREMENT",
        contentId: row.id,
        envProfile: "MARS_TRANSIT",
        envVersion: 1,
      });
      expect(row.transmission.acceptedAtSim.getTime()).toBe(Date.parse(payload.capturedAtSim) + 60_000);
      expect(row.transmission.acceptedAtReal).toEqual(row.transmission.acceptedAtSim);
      expect(row.transmission.deliverAt.getTime()).toBe(row.transmission.acceptedAtSim.getTime() + 120 * 60_000);
      expect(row.transmission.deliverAt.getTime()).toBeLessThan(Date.parse(SEED_NOW.toISOString()));
    }
  });
});

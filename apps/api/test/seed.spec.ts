import { randomUUID } from "node:crypto";
import {
  EnvironmentProfileSchema,
  MeasurementSchema,
  MissionConfigResponseSchema,
  SyncBatchResponseSchema,
} from "@astra/contracts";
import request from "supertest";
import { canonicalJson } from "../src/common/canonical-json.js";
import { createSeedMeasurements, SEED_PROFILE, SEED_PROFILE_V2 } from "../src/seed/seed-data.js";
import { seedDatabase } from "../src/seed/seed.js";
import { createTestApp } from "./create-test-app.js";
import { FakeNow } from "./support/fake-now.js";
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
    expect(await db.prisma.environmentProfile.count()).toBe(2);
    expect(await db.prisma.measurement.count()).toBe(11);
    expect(await db.prisma.transmission.count()).toBe(11);
    expect(await db.prisma.missionClock.findUniqueOrThrow({ where: { id: 1 } })).toEqual(clockBefore);
    expect(clockBefore).toMatchObject({ factor: 60, clockVersion: 1 });
    expect(clockBefore.realEpoch.toISOString()).toBe(SEED_NOW.toISOString());
    expect(EnvironmentProfileSchema.parse(SEED_PROFILE)).toEqual(SEED_PROFILE);
    expect(EnvironmentProfileSchema.parse(SEED_PROFILE_V2)).toEqual(SEED_PROFILE_V2);
    expect(await db.prisma.environmentProfile.findMany({ orderBy: { version: "asc" } })).toEqual([SEED_PROFILE, SEED_PROFILE_V2]);
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

  it("T-402 Parte 0: adds v2 only if missing and never overwrites an existing version", async () => {
    const customV2 = { ...SEED_PROFILE_V2, oneWayDelayMinutesSim: 7, description: "Existing fictitious v2" };
    await db.prisma.environmentProfile.create({ data: customV2 });
    await seedDatabase(db.prisma, SEED_NOW);

    expect(await db.prisma.environmentProfile.findMany({ orderBy: { version: "asc" } })).toEqual([SEED_PROFILE, customV2]);
  });

  it("T-402 Parte 0: after the seed the API serves v2 and a new measurement uses its 20-minute delay", async () => {
    await seedDatabase(db.prisma, SEED_NOW);
    const now = new FakeNow(new Date(SEED_NOW.getTime() + 10_000)); // factor 60: simNow = SEED_NOW + 10 min
    const app = await createTestApp({ env: { DATABASE_URL: db.databaseUrl }, now });
    try {
      const config = await request(app.getHttpServer()).get("/api/mission/config").set("X-Demo-Role", "SHIP");
      expect(config.status).toBe(200);
      expect(MissionConfigResponseSchema.parse(config.body).profile).toEqual(SEED_PROFILE_V2);

      const id = randomUUID();
      const sync = await request(app.getHttpServer())
        .post("/api/sync/batch")
        .set("X-Demo-Role", "SHIP")
        .send({
          items: [
            {
              kind: "MEASUREMENT",
              payload: {
                id,
                astronautId: "sam",
                indicator: "HEART_RATE",
                value: 70,
                unit: "bpm",
                context: "AT_REST",
                origin: "MANUAL",
                capturedAtReal: SEED_NOW.toISOString(),
                capturedAtSim: SEED_NOW.toISOString(),
                clockVersion: 1,
                envProfile: "MARS_TRANSIT",
                envVersion: 2,
              },
            },
          ],
        });
      expect(sync.status).toBe(200);
      const [result] = SyncBatchResponseSchema.parse(sync.body).results;
      expect(result?.status).toBe("ACCEPTED");
      if (result?.status !== "ACCEPTED") return;
      expect(result.transmission.envVersion).toBe(2);
      expect(result.transmission.acceptedAtSim).toBe(new Date(SEED_NOW.getTime() + 10 * 60_000).toISOString());
      expect(Date.parse(result.transmission.deliverAt)).toBe(Date.parse(result.transmission.acceptedAtSim) + 20 * 60_000);

      // The seed history keeps envVersion 1.
      const history = await db.prisma.transmission.findMany({ where: { contentId: { not: id } } });
      expect(history.every((row) => row.envVersion === 1)).toBe(true);
    } finally {
      await app.close();
    }
  });
});

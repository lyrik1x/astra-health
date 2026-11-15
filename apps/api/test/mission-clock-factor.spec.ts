import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import {
  ApiErrorSchema,
  MeasurementsResponseSchema,
  MissionConfigResponseSchema,
  SetClockFactorResponseSchema,
  computeSimNow,
  type Measurement,
  type MissionClock,
  type Transmission,
} from "@astra/contracts";
import request from "supertest";
import { createTestApp } from "./create-test-app.js";
import { FakeNow } from "./support/fake-now.js";
import { CLOCK_EPOCH, insertAstronaut, insertClock, insertMeasurement } from "./support/fixtures.js";
import { insertProfile } from "./support/profile-fixtures.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

// T-502 criteria 2-5 (QA-409): re-anchoring, continuity, stored times untouched, restart.
// Initial clock: simEpoch = realEpoch = 10:00, factor 60 -> 1 real second = 1 simulated minute.
// Fictitious data only (AGENTS.md §8).

function realAfterEpoch(seconds: number): Date {
  return new Date(Date.parse(CLOCK_EPOCH) + seconds * 1000);
}

async function postFactor(app: INestApplication, body: unknown, role = "SHIP") {
  return request(app.getHttpServer()).post("/api/mission/clock/factor").set("X-Demo-Role", role).send(body as object);
}

async function getConfig(app: INestApplication) {
  const response = await request(app.getHttpServer()).get("/api/mission/config").set("X-Demo-Role", "SHIP");
  expect(response.status).toBe(200);
  return MissionConfigResponseSchema.parse(response.body);
}

async function storedClock(db: TestDatabase) {
  return db.prisma.missionClock.findUnique({ where: { id: 1 } });
}

describe("POST /api/mission/clock/factor", () => {
  let db: TestDatabase;
  let app: INestApplication;
  const now = new FakeNow(realAfterEpoch(60));

  beforeAll(async () => {
    db = createTestDatabase();
    await insertProfile(db.prisma);
    app = await createTestApp({ env: { DATABASE_URL: db.databaseUrl }, now });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  beforeEach(async () => {
    // Each test starts from the initial clock.
    await db.prisma.missionClock.deleteMany();
    await insertClock(db.prisma);
    now.set(realAfterEpoch(60)); // simNow 11:00
  });

  it("factor 120 re-anchors the clock, clockVersion + 1, and persists it", async () => {
    const response = await postFactor(app, { factor: 120 });
    expect(response.status).toBe(200);
    const { clock } = SetClockFactorResponseSchema.parse(response.body);
    expect(clock).toEqual({
      simEpoch: "2026-11-14T11:00:00.000Z",
      realEpoch: "2026-11-14T10:01:00.000Z",
      factor: 120,
      clockVersion: 2,
    });
    const row = await storedClock(db);
    expect(row?.simEpoch.toISOString()).toBe(clock.simEpoch);
    expect(row?.realEpoch.toISOString()).toBe(clock.realEpoch);
    expect(row?.factor).toBe(120);
    expect(row?.clockVersion).toBe(2);
  });

  it("simNow is continuous and then advances at the new rate (10 real s = 20 simulated min)", async () => {
    const before = await getConfig(app);
    expect((await postFactor(app, { factor: 120 })).status).toBe(200);
    const after = await getConfig(app);
    expect(Math.abs(Date.parse(after.serverSimNow) - Date.parse(before.serverSimNow))).toBeLessThanOrEqual(1);
    expect(after.serverSimNow).toBe("2026-11-14T11:00:00.000Z");

    now.set(realAfterEpoch(70));
    expect((await getConfig(app)).serverSimNow).toBe("2026-11-14T11:20:00.000Z");
  });

  it("continuity holds with a decimal factor and an odd millisecond (Math.floor, at most 1 ms)", async () => {
    now.set(realAfterEpoch(0));
    expect((await postFactor(app, { factor: 1.5 })).status).toBe(200);
    now.set(new Date(Date.parse(CLOCK_EPOCH) + 12_345)); // 12.345 s real * 1.5 = 18 517.5 ms simulated
    const before = await getConfig(app);
    expect((await postFactor(app, { factor: 7.3 })).status).toBe(200);
    const after = await getConfig(app);
    expect(after.clock.clockVersion).toBe(3);
    expect(Math.abs(Date.parse(after.serverSimNow) - Date.parse(before.serverSimNow))).toBeLessThanOrEqual(1);
  });

  it("the same factor returns the current clock without re-anchoring or a new version (S1)", async () => {
    const response = await postFactor(app, { factor: 60 });
    expect(response.status).toBe(200);
    expect(SetClockFactorResponseSchema.parse(response.body).clock).toEqual({
      simEpoch: CLOCK_EPOCH,
      realEpoch: CLOCK_EPOCH,
      factor: 60,
      clockVersion: 1,
    });
    expect((await storedClock(db))?.clockVersion).toBe(1);
  });

  it("EARTH can also change the factor (demo operator control, S2)", async () => {
    const response = await postFactor(app, { factor: 30 }, "EARTH");
    expect(response.status).toBe(200);
    expect(SetClockFactorResponseSchema.parse(response.body).clock.clockVersion).toBe(2);
  });

  it.each([
    ["zero", { factor: 0 }],
    ["negative", { factor: -1 }],
    ["above 3600", { factor: 3601 }],
    ["text", { factor: "60" }],
    ["extra field", { factor: 60, clockVersion: 5 }],
    ["missing factor", {}],
  ])("factor %s -> 400 VALIDATION_FAILED and the clock is unchanged", async (_name, body) => {
    const response = await postFactor(app, body);
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error).toBe("VALIDATION_FAILED");
    expect(response.text).not.toMatch(/stack/i);
    expect((await storedClock(db))?.clockVersion).toBe(1);
  });

  it("factor 3600 (upper limit) is accepted", async () => {
    expect((await postFactor(app, { factor: 3600 })).status).toBe(200);
  });

  it("without X-Demo-Role -> 400 MISSING_OR_INVALID_ROLE", async () => {
    const response = await request(app.getHttpServer()).post("/api/mission/clock/factor").send({ factor: 120 });
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error).toBe("MISSING_OR_INVALID_ROLE");
  });

  it("without clock -> 503 MISSION_CLOCK_NOT_INITIALIZED", async () => {
    await db.prisma.missionClock.deleteMany();
    const response = await postFactor(app, { factor: 120 });
    expect(response.status).toBe(503);
    expect(ApiErrorSchema.parse(response.body).error).toBe("MISSION_CLOCK_NOT_INITIALIZED");
  });
});

describe("factor change with a transmission in transit (QA-409)", () => {
  let db: TestDatabase;
  let app: INestApplication;
  const now = new FakeNow(realAfterEpoch(60));

  // Accepted at 10:00 simulated, deliverAt 12:00 (T-005 §7 example).
  const measurement = {
    id: randomUUID(),
    astronautId: "sam",
    indicator: "HEART_RATE",
    value: 72,
    unit: "bpm",
    context: "AT_REST",
    origin: "MANUAL",
    capturedAtReal: "2026-11-14T09:59:00.000Z",
    capturedAtSim: "2026-11-14T09:59:00.000Z",
    clockVersion: 1,
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
  } as Measurement;
  const transmission: Transmission = {
    id: randomUUID(),
    direction: "SHIP_TO_EARTH",
    contentKind: "MEASUREMENT",
    contentId: measurement.id,
    acceptedAtReal: CLOCK_EPOCH,
    acceptedAtSim: CLOCK_EPOCH,
    deliverAt: "2026-11-14T12:00:00.000Z",
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
  };

  beforeAll(async () => {
    db = createTestDatabase();
    await insertClock(db.prisma);
    await insertProfile(db.prisma);
    await insertAstronaut(db.prisma, "sam", "Sam");
    await insertMeasurement(db.prisma, measurement, transmission);
    app = await createTestApp({ env: { DATABASE_URL: db.databaseUrl }, now });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  async function list(role: "SHIP" | "EARTH") {
    const response = await request(app.getHttpServer())
      .get("/api/measurements?astronautId=sam")
      .set("X-Demo-Role", role);
    expect(response.status).toBe(200);
    return MeasurementsResponseSchema.parse(response.body);
  }

  it("keeps deliverAt and delivers at the moment of the new rate", async () => {
    // 11:00 simulated (60 real s): halfway, still in transit.
    expect((await list("SHIP")).items[0]?.transportStatus).toBe("IN_TRANSIT");

    // Factor 120: the remaining 60 simulated minutes now take 30 real seconds.
    expect((await postFactor(app, { factor: 120 })).status).toBe(200);

    const row = await db.prisma.transmission.findUnique({ where: { id: transmission.id } });
    expect(row?.deliverAt.toISOString()).toBe(transmission.deliverAt);
    expect(row?.acceptedAtSim.toISOString()).toBe(transmission.acceptedAtSim);
    expect(row?.acceptedAtReal.toISOString()).toBe(transmission.acceptedAtReal);
    expect((await list("SHIP")).items[0]?.transmission).toEqual(transmission);

    now.set(realAfterEpoch(60 + 29)); // 11:58 simulated
    expect((await list("SHIP")).items[0]?.transportStatus).toBe("IN_TRANSIT");
    expect((await list("EARTH")).items).toHaveLength(0);

    now.set(realAfterEpoch(60 + 30)); // 12:00 simulated = deliverAt
    const ship = await list("SHIP");
    expect(ship.serverSimNow).toBe("2026-11-14T12:00:00.000Z");
    expect(ship.items[0]?.transportStatus).toBe("DELIVERED");
    const earth = await list("EARTH");
    expect(earth.items.map((item) => [item.measurement.id, item.transportStatus])).toEqual([
      [measurement.id, "DELIVERED"],
    ]);
  });
});

describe("restart: a second app instance against the same database (QA-409)", () => {
  let db: TestDatabase;

  beforeAll(() => {
    db = createTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await db?.cleanup();
  });

  it("sees the same clock and a correct serverSimNow", async () => {
    await insertClock(db.prisma);
    await insertProfile(db.prisma);

    const first = await createTestApp({
      env: { DATABASE_URL: db.databaseUrl },
      now: new FakeNow(realAfterEpoch(60)),
    });
    let changed: MissionClock;
    try {
      const response = await postFactor(first, { factor: 120 });
      expect(response.status).toBe(200);
      changed = SetClockFactorResponseSchema.parse(response.body).clock;
    } finally {
      await first.close();
    }

    const laterNow = new FakeNow(realAfterEpoch(70));
    const second = await createTestApp({ env: { DATABASE_URL: db.databaseUrl }, now: laterNow });
    try {
      const config = await getConfig(second);
      expect(config.clock).toEqual(changed);
      expect(config.serverSimNow).toBe(computeSimNow(changed, laterNow.now()));
      expect(config.serverSimNow).toBe("2026-11-14T11:20:00.000Z");
    } finally {
      await second.close();
    }
  }, 60_000);
});

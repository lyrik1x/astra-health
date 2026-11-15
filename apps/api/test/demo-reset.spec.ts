import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { ApiErrorSchema, DemoResetResponseSchema, SyncBatchResponseSchema, type Measurement } from "@astra/contracts";
import request from "supertest";
import { createTestApp } from "./create-test-app.js";
import { FakeNow } from "./support/fake-now.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";
import { seedDatabase } from "../src/seed/seed.js";

const RESET_NOW = new Date("2026-11-15T12:34:56.000Z");

function measurement(): Measurement {
  return {
    id: randomUUID(), astronautId: "sam", indicator: "HEART_RATE", value: 72, unit: "bpm",
    context: "AT_REST", origin: "MANUAL", capturedAtReal: "2026-11-15T12:00:00.000Z",
    capturedAtSim: "2026-11-15T12:00:00.000Z", clockVersion: 1, envProfile: "MARS_TRANSIT", envVersion: 1,
  } as Measurement;
}

describe("POST /api/demo/reset", () => {
  let db: TestDatabase;
  let enabledApp: INestApplication;
  let disabledApp: INestApplication;
  const now = new FakeNow(RESET_NOW);

  beforeAll(async () => {
    db = createTestDatabase();
    enabledApp = await createTestApp({ env: { DATABASE_URL: db.databaseUrl, DEMO_RESET_ENABLED: "true" }, now });
    disabledApp = await createTestApp({ env: { DATABASE_URL: db.databaseUrl }, now });
  }, 60_000);

  afterAll(async () => {
    await enabledApp?.close();
    await disabledApp?.close();
    await db?.cleanup();
  });

  beforeEach(async () => {
    await db.prisma.measurement.deleteMany();
    await db.prisma.incidentEvent.deleteMany();
    await db.prisma.message.deleteMany();
    await db.prisma.transmission.deleteMany();
    await db.prisma.astronaut.deleteMany();
    await db.prisma.environmentProfile.deleteMany();
    await db.prisma.missionClock.deleteMany();
    await seedDatabase(db.prisma, new Date("2026-11-14T10:00:00.000Z"));
    now.set(RESET_NOW);
  });

  it("is not registered when disabled, even when X-Demo-Role is absent", async () => {
    const response = await request(disabledApp.getHttpServer()).post("/api/demo/reset");
    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(response.body).error).toBe("NOT_FOUND");
  });

  it("requires X-Demo-Role when enabled", async () => {
    const response = await request(enabledApp.getHttpServer()).post("/api/demo/reset");
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error).toBe("MISSING_OR_INVALID_ROLE");
  });

  it("resets seeded data and the clock, repeatably", async () => {
    const factor = await request(enabledApp.getHttpServer())
      .post("/api/mission/clock/factor").set("X-Demo-Role", "SHIP").send({ factor: 120 });
    expect(factor.status).toBe(200);

    const extra = measurement();
    const sync = await request(enabledApp.getHttpServer())
      .post("/api/sync/batch").set("X-Demo-Role", "SHIP").send({ items: [{ kind: "MEASUREMENT", payload: extra }] });
    expect(sync.status).toBe(200);
    expect(SyncBatchResponseSchema.parse(sync.body).results[0]?.status).toBe("ACCEPTED");

    const resetOnce = await request(enabledApp.getHttpServer()).post("/api/demo/reset").set("X-Demo-Role", "EARTH");
    expect(resetOnce.status).toBe(200);
    expect(DemoResetResponseSchema.parse(resetOnce.body).clock).toEqual({
      simEpoch: RESET_NOW.toISOString(), realEpoch: RESET_NOW.toISOString(), factor: 60, clockVersion: 1,
    });
    expect(await db.prisma.measurement.count()).toBe(11);
    expect(await db.prisma.astronaut.count()).toBe(2);
    expect(await db.prisma.missionClock.findUniqueOrThrow({ where: { id: 1 } })).toMatchObject({
      realEpoch: RESET_NOW, simEpoch: RESET_NOW, factor: 60, clockVersion: 1,
    });
    expect(await db.prisma.measurement.findUnique({ where: { id: extra.id } })).toBeNull();

    const resetTwice = await request(enabledApp.getHttpServer()).post("/api/demo/reset").set("X-Demo-Role", "SHIP");
    expect(resetTwice.status).toBe(200);
    expect(await db.prisma.measurement.count()).toBe(11);
    expect(await db.prisma.astronaut.count()).toBe(2);
    expect(await db.prisma.transmission.count()).toBe(11);
  });
});

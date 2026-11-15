import type { INestApplication } from "@nestjs/common";
import { ApiErrorSchema, MissionConfigResponseSchema, computeSimNow } from "@astra/contracts";
import request from "supertest";
import { createTestApp } from "./create-test-app.js";
import { FakeNow } from "./support/fake-now.js";
import { CLOCK_EPOCH, insertClock } from "./support/fixtures.js";
import { insertProfile } from "./support/profile-fixtures.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

// T-502 criterion 1: GET /api/mission/config (T-005 §5.1).
// Clock: simEpoch = realEpoch = 10:00, factor 60 -> 1 real second = 1 simulated minute.

function realAfterEpoch(seconds: number): Date {
  return new Date(Date.parse(CLOCK_EPOCH) + seconds * 1000);
}

describe("GET /api/mission/config", () => {
  let db: TestDatabase;
  let app: INestApplication;
  const now = new FakeNow(realAfterEpoch(10)); // simNow 10:10

  beforeAll(async () => {
    db = createTestDatabase();
    await insertClock(db.prisma);
    // Inserted out of order on purpose: the API must pick the highest version.
    await insertProfile(db.prisma, 2, 90);
    await insertProfile(db.prisma, 1, 120);
    app = await createTestApp({ env: { DATABASE_URL: db.databaseUrl }, now });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  it.each(["SHIP", "EARTH"])("responds 200 for %s with the stored clock and serverSimNow", async (role) => {
    const response = await request(app.getHttpServer()).get("/api/mission/config").set("X-Demo-Role", role);
    expect(response.status).toBe(200);
    const body = MissionConfigResponseSchema.parse(response.body);
    expect(body.clock).toEqual({
      simEpoch: CLOCK_EPOCH,
      realEpoch: CLOCK_EPOCH,
      factor: 60,
      clockVersion: 1,
    });
    expect(body.serverSimNow).toBe(computeSimNow(body.clock, now.now()));
    expect(body.serverSimNow).toBe("2026-11-14T10:10:00.000Z");
  });

  it("returns the highest version of MARS_TRANSIT", async () => {
    const response = await request(app.getHttpServer()).get("/api/mission/config").set("X-Demo-Role", "SHIP");
    const body = MissionConfigResponseSchema.parse(response.body);
    expect(body.profile).toEqual({
      profile: "MARS_TRANSIT",
      version: 2,
      oneWayDelayMinutesSim: 90,
      delaySource: "SIMULATED",
      description: "Fictitious Mars transit profile v2",
    });
  });

  it("without X-Demo-Role -> 400 MISSING_OR_INVALID_ROLE", async () => {
    const response = await request(app.getHttpServer()).get("/api/mission/config");
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error).toBe("MISSING_OR_INVALID_ROLE");
  });
});

describe("GET /api/mission/config without initial data", () => {
  let db: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    db = createTestDatabase();
    app = await createTestApp({ env: { DATABASE_URL: db.databaseUrl } });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  async function getConfig() {
    return request(app.getHttpServer()).get("/api/mission/config").set("X-Demo-Role", "EARTH");
  }

  it("without clock (and without profile) -> 503 MISSION_CLOCK_NOT_INITIALIZED", async () => {
    const response = await getConfig();
    expect(response.status).toBe(503);
    expect(ApiErrorSchema.parse(response.body)).toEqual({
      statusCode: 503,
      error: "MISSION_CLOCK_NOT_INITIALIZED",
      message: "Mission clock is not initialized",
    });
  });

  it("with clock but without profile -> 503 MISSION_PROFILE_NOT_INITIALIZED (S3)", async () => {
    await insertClock(db.prisma);
    const response = await getConfig();
    expect(response.status).toBe(503);
    expect(ApiErrorSchema.parse(response.body)).toEqual({
      statusCode: 503,
      error: "MISSION_PROFILE_NOT_INITIALIZED",
      message: "Mission profile is not initialized",
    });
  });
});

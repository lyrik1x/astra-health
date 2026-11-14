import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import {
  ApiErrorSchema,
  MeasurementsResponseSchema,
  type Measurement,
  type Transmission,
} from "@astra/contracts";
import request from "supertest";
import { createTestApp } from "./create-test-app.js";
import { FakeNow } from "./support/fake-now.js";
import { CLOCK_EPOCH, insertAstronaut, insertClock, insertMeasurement } from "./support/fixtures.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

// Criteria 7 and 8 (QA-001 read side, QA-408): role visibility by deliverAt, filtered in the query.
// Clock: simEpoch = realEpoch = 10:00, factor 60 -> 1 real second = 1 simulated minute.

function realAfterEpoch(seconds: number): Date {
  return new Date(Date.parse(CLOCK_EPOCH) + seconds * 1000);
}

function measurement(overrides: Partial<Measurement> & Pick<Measurement, "astronautId" | "capturedAtSim">): Measurement {
  return {
    id: randomUUID(),
    indicator: "HEART_RATE",
    value: 72,
    unit: "bpm",
    context: "AT_REST",
    origin: "MANUAL",
    capturedAtReal: overrides.capturedAtSim,
    clockVersion: 1,
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
    ...overrides,
  } as Measurement;
}

function transmissionFor(content: Measurement, acceptedAtSim: string, deliverAt: string): Transmission {
  return {
    id: randomUUID(),
    direction: "SHIP_TO_EARTH",
    contentKind: "MEASUREMENT",
    contentId: content.id,
    acceptedAtReal: acceptedAtSim,
    acceptedAtSim,
    deliverAt,
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
  };
}

describe("GET /api/measurements", () => {
  let db: TestDatabase;
  let app: INestApplication;
  const now = new FakeNow(realAfterEpoch(10)); // simNow 10:10

  // Already delivered (deliverAt 10:00). Blood pressure: object value survives the round trip.
  const delivered = measurement({
    astronautId: "sam",
    indicator: "BLOOD_PRESSURE",
    value: { systolic: 118, diastolic: 76 },
    unit: "mmHg",
    capturedAtSim: "2026-11-14T07:59:00.000Z",
    capturedAtReal: "2026-11-14T07:59:00.123Z",
  } as Measurement);
  const deliveredTx = transmissionFor(delivered, "2026-11-14T08:00:00.000Z", "2026-11-14T10:00:00.000Z");

  // In transit until 12:00 simulated (2 real minutes after the epoch).
  const inTransit = measurement({
    astronautId: "sam",
    capturedAtSim: "2026-11-14T09:58:00.000Z",
    capturedAtReal: "2026-11-14T09:58:30.456Z",
  });
  const inTransitTx = transmissionFor(inTransit, "2026-11-14T10:00:00.000Z", "2026-11-14T12:00:00.000Z");

  // Another astronaut: never in Sam's list.
  const alexOne = measurement({ astronautId: "alex", capturedAtSim: "2026-11-14T07:00:00.000Z" });
  const alexTx = transmissionFor(alexOne, "2026-11-14T07:00:00.000Z", "2026-11-14T09:00:00.000Z");

  beforeAll(async () => {
    db = createTestDatabase();
    await insertClock(db.prisma);
    await insertAstronaut(db.prisma, "sam", "Sam");
    await insertAstronaut(db.prisma, "alex", "Alex");
    // Inserted out of order on purpose: the API must sort by capturedAtSim.
    await insertMeasurement(db.prisma, inTransit, inTransitTx);
    await insertMeasurement(db.prisma, delivered, deliveredTx);
    await insertMeasurement(db.prisma, alexOne, alexTx);
    app = await createTestApp({ env: { DATABASE_URL: db.databaseUrl }, now });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  beforeEach(() => {
    now.set(realAfterEpoch(10));
  });

  async function list(role: "SHIP" | "EARTH", astronautId = "sam") {
    const response = await request(app.getHttpServer())
      .get(`/api/measurements?astronautId=${astronautId}`)
      .set("X-Demo-Role", role);
    expect(response.status).toBe(200);
    return MeasurementsResponseSchema.parse(response.body);
  }

  it("serverSimNow comes from the stored clock and the injected now", async () => {
    expect((await list("SHIP")).serverSimNow).toBe("2026-11-14T10:10:00.000Z");
  });

  it("SHIP sees all of the astronaut's measurements, ordered, with transportStatus", async () => {
    const body = await list("SHIP");
    expect(body.items.map((item) => [item.measurement.id, item.transportStatus])).toEqual([
      [delivered.id, "DELIVERED"],
      [inTransit.id, "IN_TRANSIT"],
    ]);
    expect(body.items[1]?.transmission).toEqual(inTransitTx);
  });

  it("the returned measurement equals the inserted one; captured times are unchanged", async () => {
    const body = await list("SHIP");
    expect(body.items[0]?.measurement).toEqual(delivered);
    expect(body.items[1]?.measurement).toEqual(inTransit);
    expect(body.items[1]?.measurement.capturedAtReal).toBe("2026-11-14T09:58:30.456Z");
    expect(body.items[1]?.measurement.capturedAtSim).toBe("2026-11-14T09:58:00.000Z");
  });

  it("EARTH does not see a measurement before deliverAt", async () => {
    const body = await list("EARTH");
    expect(body.items.map((item) => item.measurement.id)).toEqual([delivered.id]);
  });

  it("EARTH sees it exactly at deliverAt and after, as DELIVERED", async () => {
    now.set(realAfterEpoch(120)); // simNow 12:00 = deliverAt
    let body = await list("EARTH");
    expect(body.serverSimNow).toBe("2026-11-14T12:00:00.000Z");
    expect(body.items.map((item) => [item.measurement.id, item.transportStatus])).toEqual([
      [delivered.id, "DELIVERED"],
      [inTransit.id, "DELIVERED"],
    ]);

    now.set(realAfterEpoch(121)); // 12:01
    body = await list("EARTH");
    expect(body.items).toHaveLength(2);
  });

  it("does not mix astronauts", async () => {
    const body = await list("SHIP", "alex");
    expect(body.items.map((item) => item.measurement.id)).toEqual([alexOne.id]);
  });

  it.each([
    ["invalid format", "/api/measurements?astronautId=Sam!"],
    ["missing", "/api/measurements"],
    ["repeated", "/api/measurements?astronautId=sam&astronautId=alex"],
  ])("astronautId %s -> 400 VALIDATION_FAILED", async (_name, path) => {
    const response = await request(app.getHttpServer()).get(path).set("X-Demo-Role", "SHIP");
    expect(response.status).toBe(400);
    const error = ApiErrorSchema.parse(response.body);
    expect(error.error).toBe("VALIDATION_FAILED");
    expect(response.text).not.toMatch(/stack/i);
  });
});

describe("GET /api/measurements without a MissionClock row", () => {
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

  it("responds 503 MISSION_CLOCK_NOT_INITIALIZED and does not invent a clock", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/measurements?astronautId=sam")
      .set("X-Demo-Role", "SHIP");
    expect(response.status).toBe(503);
    expect(ApiErrorSchema.parse(response.body)).toEqual({
      statusCode: 503,
      error: "MISSION_CLOCK_NOT_INITIALIZED",
      message: "Mission clock is not initialized",
    });
  });
});

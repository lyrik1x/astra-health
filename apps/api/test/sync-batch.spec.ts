import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import {
  ApiErrorSchema,
  MeasurementsResponseSchema,
  SyncBatchResponseSchema,
  type Measurement,
} from "@astra/contracts";
import request from "supertest";
import { canonicalJson } from "../src/common/canonical-json.js";
import { createTestApp } from "./create-test-app.js";
import { FakeNow } from "./support/fake-now.js";
import { CLOCK_EPOCH, insertAstronaut, insertClock } from "./support/fixtures.js";
import { insertProfile } from "./support/profile-fixtures.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

// T-203 + T-501 (core): POST /api/sync/batch with measurements (T-005 §5.2, §5.3).
// Clock: simEpoch = realEpoch = 10:00, factor 60 -> 1 real second = 1 simulated minute.
// Profile: MARS_TRANSIT v1, 120 simulated minutes. Fictitious data only.

function realAfterEpoch(seconds: number): Date {
  return new Date(Date.parse(CLOCK_EPOCH) + seconds * 1000);
}

function measurement(overrides: Partial<Measurement> = {}): Measurement {
  return {
    id: randomUUID(),
    astronautId: "sam",
    indicator: "HEART_RATE",
    value: 72,
    unit: "bpm",
    context: "AT_REST",
    origin: "MANUAL",
    // Client times on purpose different from the server times (QA-410).
    capturedAtReal: "2026-11-14T09:30:00.123Z",
    capturedAtSim: "2026-11-14T09:29:00.456Z",
    clockVersion: 1,
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
    ...overrides,
  } as Measurement;
}

function item(payload: unknown, kind = "MEASUREMENT") {
  return { kind, payload };
}

describe("POST /api/sync/batch", () => {
  let db: TestDatabase;
  let app: INestApplication;
  const now = new FakeNow(realAfterEpoch(10)); // simNow 10:10

  beforeAll(async () => {
    db = createTestDatabase();
    await insertClock(db.prisma);
    await insertProfile(db.prisma);
    await insertAstronaut(db.prisma, "sam", "Sam");
    app = await createTestApp({ env: { DATABASE_URL: db.databaseUrl }, now });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  beforeEach(() => {
    now.set(realAfterEpoch(10));
  });

  function post(body: unknown, role: "SHIP" | "EARTH" | null = "SHIP") {
    const req = request(app.getHttpServer()).post("/api/sync/batch");
    return role === null ? req.send(body as object) : req.set("X-Demo-Role", role).send(body as object);
  }

  async function sync(items: unknown[], role: "SHIP" | "EARTH" = "SHIP") {
    const response = await post({ items }, role);
    expect(response.status).toBe(200);
    return SyncBatchResponseSchema.parse(response.body);
  }

  async function list(role: "SHIP" | "EARTH") {
    const response = await request(app.getHttpServer())
      .get("/api/measurements?astronautId=sam")
      .set("X-Demo-Role", role);
    expect(response.status).toBe(200);
    return MeasurementsResponseSchema.parse(response.body);
  }

  it("valid measurement -> 200 ACCEPTED, deliverAt = acceptedAtSim + 120 min, client times intact (QA-410)", async () => {
    const m = measurement();
    const body = await sync([item(m)]);

    expect(body.serverSimNow).toBe("2026-11-14T10:10:00.000Z");
    const [result] = body.results;
    expect(result?.status).toBe("ACCEPTED");
    if (result?.status !== "ACCEPTED") throw new Error("expected ACCEPTED");
    expect(result).toMatchObject({ id: m.id, kind: "MEASUREMENT", code: 201, retryable: false });
    expect(result.transmission).toMatchObject({
      direction: "SHIP_TO_EARTH",
      contentKind: "MEASUREMENT",
      contentId: m.id,
      acceptedAtReal: realAfterEpoch(10).toISOString(),
      acceptedAtSim: "2026-11-14T10:10:00.000Z",
      deliverAt: "2026-11-14T12:10:00.000Z",
      envProfile: "MARS_TRANSIT",
      envVersion: 1,
    });
    expect(result.transmission.id).not.toBe(m.id);

    const row = await db.prisma.measurement.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.payloadCanonical).toBe(canonicalJson(m));
    expect(row.capturedAtReal.toISOString()).toBe(m.capturedAtReal);
    expect(row.capturedAtSim.toISOString()).toBe(m.capturedAtSim);
    const stored = (await list("SHIP")).items.find((entry) => entry.measurement.id === m.id);
    expect(stored?.measurement).toEqual(m);
  });

  it("same UUID and same content -> DUPLICATE with the original transmission (QA-103)", async () => {
    const m = measurement();
    const first = (await sync([item(m)])).results[0];

    now.set(realAfterEpoch(50)); // the clock moved on: the original times must not change
    const second = (await sync([item({ ...m })])).results[0];

    if (first?.status !== "ACCEPTED" || second?.status !== "DUPLICATE") throw new Error("unexpected statuses");
    expect(second).toMatchObject({ id: m.id, code: 200, retryable: false });
    expect(second.transmission).toEqual(first.transmission);
    expect(await db.prisma.transmission.count({ where: { contentId: m.id } })).toBe(1);
  });

  it("same UUID with another value -> CONFLICT 409 UUID_CONFLICT; the stored measurement does not change (QA-109)", async () => {
    const m = measurement();
    await sync([item(m)]);
    const before = await db.prisma.measurement.findUniqueOrThrow({ where: { id: m.id }, include: { transmission: true } });

    const [result] = (await sync([item({ ...m, value: 99 })])).results;
    expect(result).toEqual({
      id: m.id,
      kind: "MEASUREMENT",
      status: "CONFLICT",
      code: 409,
      retryable: false,
      error: { statusCode: 409, error: "UUID_CONFLICT", message: expect.any(String) },
    });
    const after = await db.prisma.measurement.findUniqueOrThrow({ where: { id: m.id }, include: { transmission: true } });
    expect(after).toEqual(before);
  });

  it("mixed batch (valid, invalid, duplicate) -> 200 with three results in order (QA-110)", async () => {
    const existing = measurement();
    await sync([item(existing)]);
    const fresh = measurement();
    const broken = { ...measurement(), unit: "degC" };

    const body = await sync([item(fresh), item(broken), item(existing)]);
    expect(body.results.map((r) => [r.id, r.status])).toEqual([
      [fresh.id, "ACCEPTED"],
      [broken.id, "INVALID"],
      [existing.id, "DUPLICATE"],
    ]);
    const invalid = body.results[1];
    if (invalid?.status !== "INVALID") throw new Error("expected INVALID");
    expect(invalid.error.error).toBe("VALIDATION_FAILED");
    expect(invalid.retryable).toBe(false);
    expect(await db.prisma.measurement.findUnique({ where: { id: broken.id } })).toBeNull();
  });

  it("an item without a usable id or kind still gets its own INVALID result", async () => {
    const body = await sync([{ nonsense: true }, item(measurement())]);
    expect(body.results.map((r) => r.status)).toEqual(["INVALID", "ACCEPTED"]);
    expect(body.results[0]).toMatchObject({ id: "00000000-0000-0000-0000-000000000000", kind: "MEASUREMENT" });
  });

  it("EARTH sends a measurement -> INVALID ROLE_NOT_ALLOWED, nothing stored", async () => {
    const m = measurement();
    const [result] = (await sync([item(m)], "EARTH")).results;
    expect(result).toMatchObject({ id: m.id, status: "INVALID", retryable: false, error: { error: "ROLE_NOT_ALLOWED" } });
    expect(await db.prisma.measurement.findUnique({ where: { id: m.id } })).toBeNull();
  });

  it("unknown astronaut -> INVALID UNKNOWN_ASTRONAUT, nothing stored", async () => {
    const m = measurement({ astronautId: "nobody" });
    const [result] = (await sync([item(m)])).results;
    expect(result).toMatchObject({ id: m.id, status: "INVALID", retryable: false, error: { error: "UNKNOWN_ASTRONAUT" } });
    expect(await db.prisma.measurement.findUnique({ where: { id: m.id } })).toBeNull();
  });

  it("a valid MESSAGE -> INVALID UNEXPECTED_ITEM_ERROR, retryable (T-505)", async () => {
    const message = {
      id: randomUUID(),
      direction: "SHIP_TO_EARTH",
      astronautId: "sam",
      body: "Fictitious test message",
      createdAtReal: "2026-11-14T10:00:00.000Z",
      createdAtSim: "2026-11-14T10:00:00.000Z",
      clockVersion: 1,
    };
    const response = await post({ items: [item(message, "MESSAGE")] });
    expect(response.status).toBe(200);
    const [result] = SyncBatchResponseSchema.parse(response.body).results;
    // If the fixture does not match MessageSchema this is VALIDATION_FAILED; we need the "valid" path.
    expect(result).toMatchObject({
      kind: "MESSAGE",
      status: "INVALID",
      retryable: true,
      error: { error: "UNEXPECTED_ITEM_ERROR", message: "Not supported yet" },
    });
  });

  it("51 items -> 413 PAYLOAD_TOO_LARGE", async () => {
    const items = Array.from({ length: 51 }, () => item(measurement()));
    const response = await post({ items });
    expect(response.status).toBe(413);
    expect(ApiErrorSchema.parse(response.body).error).toBe("PAYLOAD_TOO_LARGE");
    expect(await db.prisma.measurement.findUnique({ where: { id: items[0]!.payload.id } })).toBeNull();
  });

  it("50 items -> 200 with 50 results", async () => {
    const body = await sync(Array.from({ length: 50 }, () => item(measurement())));
    expect(body.results).toHaveLength(50);
    expect(body.results.every((r) => r.status === "ACCEPTED")).toBe(true);
  });

  it.each([
    ["no items key", {}],
    ["empty items", { items: [] }],
    ["items not an array", { items: "x" }],
    ["unknown key", { items: [item(measurement())], extra: 1 }],
  ])("invalid envelope (%s) -> 400 VALIDATION_FAILED", async (_name, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error).toBe("VALIDATION_FAILED");
  });

  it("missing X-Demo-Role -> 400 MISSING_OR_INVALID_ROLE", async () => {
    const response = await post({ items: [item(measurement())] }, null);
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error).toBe("MISSING_OR_INVALID_ROLE");
  });

  it("visibility (QA-408): EARTH sees it only from deliverAt; SHIP always, IN_TRANSIT then DELIVERED", async () => {
    now.set(realAfterEpoch(200)); // simNow 13:20 -> deliverAt 15:20
    const m = measurement();
    const [result] = (await sync([item(m)])).results;
    if (result?.status !== "ACCEPTED") throw new Error("expected ACCEPTED");
    expect(result.transmission.deliverAt).toBe("2026-11-14T15:20:00.000Z");

    const findIn = (body: Awaited<ReturnType<typeof list>>) => body.items.find((entry) => entry.measurement.id === m.id);

    now.set(realAfterEpoch(260)); // 14:20, one simulated hour later
    expect(findIn(await list("EARTH"))).toBeUndefined();
    expect(findIn(await list("SHIP"))?.transportStatus).toBe("IN_TRANSIT");

    now.set(realAfterEpoch(320)); // 15:20 = deliverAt
    expect(findIn(await list("EARTH"))?.transportStatus).toBe("DELIVERED");
    expect(findIn(await list("SHIP"))?.transportStatus).toBe("DELIVERED");
  });
});

describe("POST /api/sync/batch across a server restart", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = createTestDatabase();
    await insertClock(db.prisma);
    await insertProfile(db.prisma);
    await insertAstronaut(db.prisma, "sam", "Sam");
  }, 60_000);

  afterAll(async () => {
    await db?.cleanup();
  });

  it("a second instance on the same database returns the same measurement and transmission", async () => {
    const now = new FakeNow(realAfterEpoch(10));
    const m = measurement();

    const first = await createTestApp({ env: { DATABASE_URL: db.databaseUrl }, now });
    const accepted = SyncBatchResponseSchema.parse(
      (await request(first.getHttpServer()).post("/api/sync/batch").set("X-Demo-Role", "SHIP").send({ items: [item(m)] }))
        .body,
    ).results[0];
    await first.close();
    if (accepted?.status !== "ACCEPTED") throw new Error("expected ACCEPTED");

    const second = await createTestApp({ env: { DATABASE_URL: db.databaseUrl }, now });
    try {
      const listed = MeasurementsResponseSchema.parse(
        (await request(second.getHttpServer()).get("/api/measurements?astronautId=sam").set("X-Demo-Role", "SHIP")).body,
      );
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0]?.measurement).toEqual(m);
      expect(listed.items[0]?.transmission).toEqual(accepted.transmission);

      const resent = SyncBatchResponseSchema.parse(
        (await request(second.getHttpServer()).post("/api/sync/batch").set("X-Demo-Role", "SHIP").send({ items: [item(m)] }))
          .body,
      ).results[0];
      if (resent?.status !== "DUPLICATE") throw new Error("expected DUPLICATE");
      expect(resent.transmission).toEqual(accepted.transmission);
    } finally {
      await second.close();
    }
  });
});

describe("POST /api/sync/batch without a profile row", () => {
  let db: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    db = createTestDatabase();
    await insertClock(db.prisma);
    await insertAstronaut(db.prisma, "sam", "Sam");
    app = await createTestApp({ env: { DATABASE_URL: db.databaseUrl } });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  it("responds 503 for the whole batch and stores nothing", async () => {
    const m = measurement();
    const response = await request(app.getHttpServer())
      .post("/api/sync/batch")
      .set("X-Demo-Role", "SHIP")
      .send({ items: [item(m)] });
    expect(response.status).toBe(503);
    expect(ApiErrorSchema.parse(response.body).error).toBe("MISSION_PROFILE_NOT_INITIALIZED");
    expect(await db.prisma.measurement.count()).toBe(0);
  });
});

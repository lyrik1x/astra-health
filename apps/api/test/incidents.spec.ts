import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import {
  IncidentsResponseSchema,
  SyncBatchResponseSchema,
  type IncidentsResponse,
  type SyncItemResult,
} from "@astra/contracts";
import request from "supertest";
import { createTestApp } from "./create-test-app.js";
import { FakeNow } from "./support/fake-now.js";
import { CLOCK_EPOCH, insertAstronaut, insertClock } from "./support/fixtures.js";
import { insertProfile } from "./support/profile-fixtures.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

// T-402 + T-405: incident events through POST /api/sync/batch and GET /api/incidents
// (ARCHITECTURE §9.1, T-005 §5.1-§5.3, QA-301, QA-302, QA-307 to QA-311).
// Clock: simEpoch = realEpoch = 10:00, factor 60 -> 1 real second = 1 simulated minute.
// Profile: 20 simulated minutes (as v2 of the seed). Fictitious data only.

type Role = "SHIP" | "EARTH";

/** Real instant `minutes` real seconds after the epoch = simulated 10:00 + `minutes` min. */
function realAt(minutes: number): Date {
  return new Date(Date.parse(CLOCK_EPOCH) + minutes * 1000);
}

function simAt(minutes: number): string {
  return new Date(Date.parse(CLOCK_EPOCH) + minutes * 60_000).toISOString();
}

interface Incident {
  astronautId: string;
  incidentId: string;
}

function newIncident(astronautId: string): Incident {
  return { astronautId, incidentId: randomUUID() };
}

/** Ship event created at simulated 10:00 + `minute`. */
function shipEvent(incident: Incident, sequence: number, type: string, data: object, minute: number) {
  return {
    id: randomUUID(),
    incidentId: incident.incidentId,
    astronautId: incident.astronautId,
    actor: "SHIP",
    sequence,
    type,
    createdAtReal: realAt(minute).toISOString(),
    createdAtSim: simAt(minute),
    clockVersion: 1,
    data,
  };
}

const opened = (incident: Incident, minute: number, sequence = 1) =>
  shipEvent(incident, sequence, "INCIDENT_OPENED", {}, minute);
const guideStarted = (incident: Incident, sequence: number, minute: number) =>
  shipEvent(incident, sequence, "GUIDE_STARTED", { guideVersion: "astra-guide-1" }, minute);
const stepCompleted = (incident: Incident, sequence: number, minute: number) =>
  shipEvent(incident, sequence, "GUIDE_STEP_COMPLETED", { stepId: "rest" }, minute);
const reportSubmitted = (incident: Incident, sequence: number, minute: number) =>
  shipEvent(incident, sequence, "REPORT_SUBMITTED", { note: "Fictitious note" }, minute);
const closedWithoutReview = (incident: Incident, sequence: number, minute: number) =>
  shipEvent(incident, sequence, "INCIDENT_CLOSED", { closureReason: "CLOSED_WITHOUT_REVIEW" }, minute);
const closedReviewed = (incident: Incident, sequence: number, minute: number, reviewEventId: string) =>
  shipEvent(incident, sequence, "INCIDENT_CLOSED", { closureReason: "REVIEWED", reviewEventId }, minute);
const cancelled = (incident: Incident, sequence: number, minute: number) =>
  shipEvent(incident, sequence, "INCIDENT_CANCELLED", { reason: "Fictitious reason" }, minute);

function earthReview(incident: Incident, minute: number) {
  return {
    id: randomUUID(),
    incidentId: incident.incidentId,
    astronautId: incident.astronautId,
    actor: "EARTH",
    type: "EARTH_REVIEW",
    createdAtReal: realAt(minute).toISOString(),
    createdAtSim: simAt(minute),
    clockVersion: 1,
    data: { text: "Fictitious review" },
  };
}

function eventItem(payload: object) {
  return { kind: "INCIDENT_EVENT", payload };
}

async function setUp(db: TestDatabase, astronauts: string[], now: FakeNow): Promise<INestApplication> {
  await insertClock(db.prisma);
  await insertProfile(db.prisma, 1, 20);
  for (const id of astronauts) await insertAstronaut(db.prisma, id, `Fictitious ${id}`);
  return createTestApp({ env: { DATABASE_URL: db.databaseUrl }, now });
}

function helpers(getApp: () => INestApplication) {
  async function sync(payloads: object[], role: Role = "SHIP"): Promise<SyncItemResult[]> {
    const response = await request(getApp().getHttpServer())
      .post("/api/sync/batch")
      .set("X-Demo-Role", role)
      .send({ items: payloads.map(eventItem) });
    expect(response.status).toBe(200);
    return SyncBatchResponseSchema.parse(response.body).results;
  }

  async function syncOne(payload: object, role: Role = "SHIP"): Promise<SyncItemResult> {
    const [result] = await sync([payload], role);
    return result!;
  }

  async function list(astronautId: string, role: Role): Promise<IncidentsResponse> {
    const response = await request(getApp().getHttpServer())
      .get(`/api/incidents?astronautId=${astronautId}`)
      .set("X-Demo-Role", role);
    expect(response.status).toBe(200);
    return IncidentsResponseSchema.parse(response.body);
  }

  return { sync, syncOne, list };
}

function errorOf(result: SyncItemResult) {
  return result.status === "CONFLICT" || result.status === "INVALID"
    ? { status: result.status, retryable: result.retryable, code: result.error.error }
    : { status: result.status };
}

describe("incidents: POST /api/sync/batch with INCIDENT_EVENT and GET /api/incidents", () => {
  let db: TestDatabase;
  let app: INestApplication;
  const now = new FakeNow(realAt(10));
  const { sync, syncOne, list } = helpers(() => app);
  const ASTRONAUTS = Array.from({ length: 14 }, (_, index) => `crew-${index + 1}`);

  beforeAll(async () => {
    db = createTestDatabase();
    app = await setUp(db, ASTRONAUTS, now);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  beforeEach(() => {
    now.set(realAt(10)); // simNow 10:10
  });

  it("full path: open -> guide -> report -> (after deliverAt) Earth review -> close REVIEWED", async () => {
    const incident = newIncident("crew-1");
    const shipEvents = [
      opened(incident, 1),
      guideStarted(incident, 2, 2),
      stepCompleted(incident, 3, 3),
      reportSubmitted(incident, 4, 4),
    ];

    // The 4 events in one batch, in order: each one sees its predecessor accepted.
    const results = await sync(shipEvents);
    for (const [index, result] of results.entries()) {
      expect(result.status).toBe("ACCEPTED");
      if (result.status !== "ACCEPTED") continue;
      expect(result.id).toBe(shipEvents[index]!.id);
      expect(result.transmission).toMatchObject({
        direction: "SHIP_TO_EARTH",
        contentKind: "INCIDENT_EVENT",
        acceptedAtSim: simAt(10),
        deliverAt: simAt(30),
        envVersion: 1,
      });
    }

    // Before deliverAt Earth sees nothing (the incident is not listed).
    expect((await list("crew-1", "EARTH")).incidents).toEqual([]);
    const ship = (await list("crew-1", "SHIP")).incidents;
    expect(ship).toHaveLength(1);
    expect(ship[0]).toMatchObject({ incidentId: incident.incidentId, state: "AWAITING_REVIEW" });
    expect(ship[0]!.events.map((item) => item.transportStatus)).toEqual(["IN_TRANSIT", "IN_TRANSIT", "IN_TRANSIT", "IN_TRANSIT"]);

    // 10:30: the report reached Earth.
    now.set(realAt(30));
    const earthView = (await list("crew-1", "EARTH")).incidents[0]!;
    expect(earthView.state).toBe("AWAITING_REVIEW");
    expect(earthView.events.map((item) => item.event.id)).toEqual(shipEvents.map((event) => event.id));

    const review = earthReview(incident, 30);
    const reviewResult = await syncOne(review, "EARTH");
    expect(reviewResult.status).toBe("ACCEPTED");
    if (reviewResult.status === "ACCEPTED") {
      expect(reviewResult.transmission).toMatchObject({ direction: "EARTH_TO_SHIP", deliverAt: simAt(50) });
    }
    // The review never changes the state; Earth sees its own review IN_TRANSIT.
    const earthAfterReview = (await list("crew-1", "EARTH")).incidents[0]!;
    expect(earthAfterReview.state).toBe("AWAITING_REVIEW");
    expect(earthAfterReview.events.at(-1)).toMatchObject({ event: { id: review.id }, transportStatus: "IN_TRANSIT" });
    // The ship does not see it until it is delivered.
    expect((await list("crew-1", "SHIP")).incidents[0]!.events.map((item) => item.event.id)).not.toContain(review.id);

    // 10:40: closing REVIEWED before the review arrives -> REVIEW_NOT_DELIVERED.
    now.set(realAt(40));
    const early = closedReviewed(incident, 5, 40, review.id);
    expect(errorOf(await syncOne(early))).toEqual({ status: "INVALID", retryable: false, code: "REVIEW_NOT_DELIVERED" });

    // 10:50: delivered; the closure is accepted.
    now.set(realAt(50));
    const shipBeforeClose = (await list("crew-1", "SHIP")).incidents[0]!;
    expect(shipBeforeClose.events.at(-1)).toMatchObject({ event: { id: review.id }, transportStatus: "DELIVERED" });
    const closure = closedReviewed(incident, 5, 50, review.id);
    expect((await syncOne(closure)).status).toBe("ACCEPTED");

    const shipFinal = (await list("crew-1", "SHIP")).incidents[0]!;
    expect(shipFinal.state).toBe("CLOSED");
    expect(shipFinal.events.map((item) => item.event.id)).toEqual([...shipEvents.map((event) => event.id), closure.id, review.id]);
    // Earth does not see the closure yet (IN_TRANSIT): its projection stays AWAITING_REVIEW.
    const earthFinal = (await list("crew-1", "EARTH")).incidents[0]!;
    expect(earthFinal.state).toBe("AWAITING_REVIEW");
    expect(earthFinal.events.map((item) => item.event.id)).not.toContain(closure.id);
  });

  it("DUPLICATE with the original transmission; same UUID with other content -> UUID_CONFLICT", async () => {
    const incident = newIncident("crew-2");
    const event = opened(incident, 1);
    const first = await syncOne(event);
    now.set(realAt(15));
    const again = await syncOne(event);
    expect(again.status).toBe("DUPLICATE");
    if (first.status === "ACCEPTED" && again.status === "DUPLICATE") {
      expect(again.transmission).toEqual(first.transmission);
    }
    const changed = { ...event, createdAtSim: simAt(2) };
    expect(errorOf(await syncOne(changed))).toEqual({ status: "CONFLICT", retryable: false, code: "UUID_CONFLICT" });
    expect(await db.prisma.incidentEvent.count({ where: { incidentId: incident.incidentId } })).toBe(1);
  });

  it("SEQUENCE_GAP is retryable and stores nothing; the event is accepted once its predecessor arrives", async () => {
    const incident = newIncident("crew-3");
    expect((await syncOne(opened(incident, 1))).status).toBe("ACCEPTED");
    const third = reportSubmitted(incident, 3, 3);
    expect(errorOf(await syncOne(third))).toEqual({ status: "INVALID", retryable: true, code: "SEQUENCE_GAP" });
    expect(await db.prisma.incidentEvent.findUnique({ where: { id: third.id } })).toBeNull();

    const results = await sync([guideStarted(incident, 2, 2), third]);
    expect(results.map((result) => result.status)).toEqual(["ACCEPTED", "ACCEPTED"]);
  });

  it("(incidentId, sequence) taken by another UUID -> CONFLICT SEQUENCE_OCCUPIED", async () => {
    const incident = newIncident("crew-4");
    expect((await syncOne(opened(incident, 1))).status).toBe("ACCEPTED");
    expect((await syncOne(guideStarted(incident, 2, 2))).status).toBe("ACCEPTED");
    const other = reportSubmitted(incident, 2, 3);
    expect(errorOf(await syncOne(other))).toEqual({ status: "CONFLICT", retryable: false, code: "SEQUENCE_OCCUPIED" });
    expect(await db.prisma.incidentEvent.findUnique({ where: { id: other.id } })).toBeNull();
  });

  it("a transition outside PROJECT_SPEC §7.2 -> INVALID_TRANSITION, permanent, projection intact", async () => {
    const incident = newIncident("crew-5");
    expect((await syncOne(opened(incident, 1))).status).toBe("ACCEPTED");
    const invalidTransition = { status: "INVALID", retryable: false, code: "INVALID_TRANSITION" };
    expect(errorOf(await syncOne(closedWithoutReview(incident, 2, 2)))).toEqual(invalidTransition);
    expect(errorOf(await syncOne(stepCompleted(incident, 2, 2)))).toEqual(invalidTransition);
    // An INCIDENT_OPENED that is not first is also a transition error.
    expect(errorOf(await syncOne(opened(incident, 2, 2)))).toEqual(invalidTransition);
    expect((await list("crew-5", "SHIP")).incidents[0]).toMatchObject({ state: "ACTIVE" });
    expect(await db.prisma.incidentEvent.count({ where: { incidentId: incident.incidentId } })).toBe(1);
  });

  it("terminal states accept nothing more (QA-307)", async () => {
    const incident = newIncident("crew-6");
    const results = await sync([opened(incident, 1), cancelled(incident, 2, 2), guideStarted(incident, 3, 3)]);
    expect(results.map((result) => result.status)).toEqual(["ACCEPTED", "ACCEPTED", "INVALID"]);
    expect(errorOf(results[2]!)).toMatchObject({ code: "INVALID_TRANSITION" });
    expect((await list("crew-6", "SHIP")).incidents[0]).toMatchObject({ state: "CANCELLED" });
  });

  it("a second unfinished incident -> INCIDENT_ALREADY_OPEN; allowed again after the first one ends (QA-301)", async () => {
    const first = newIncident("crew-7");
    const second = newIncident("crew-7");
    expect((await syncOne(opened(first, 1))).status).toBe("ACCEPTED");
    expect(errorOf(await syncOne(opened(second, 2)))).toEqual({
      status: "INVALID",
      retryable: false,
      code: "INCIDENT_ALREADY_OPEN",
    });
    expect((await syncOne(cancelled(first, 2, 3))).status).toBe("ACCEPTED");
    expect((await syncOne(opened(second, 4))).status).toBe("ACCEPTED");
    expect((await list("crew-7", "SHIP")).incidents.map((incident) => incident.state)).toEqual(["CANCELLED", "ACTIVE"]);
  });

  it("role: EARTH cannot send a ship event and SHIP cannot send EARTH_REVIEW -> ROLE_NOT_ALLOWED (QA-308)", async () => {
    const incident = newIncident("crew-8");
    const roleError = { status: "INVALID", retryable: false, code: "ROLE_NOT_ALLOWED" };
    expect(errorOf(await syncOne(opened(incident, 1), "EARTH"))).toEqual(roleError);
    expect((await syncOne(opened(incident, 1))).status).toBe("ACCEPTED");
    expect(errorOf(await syncOne(cancelled(incident, 2, 2), "EARTH"))).toEqual(roleError);
    expect(errorOf(await syncOne(earthReview(incident, 2), "SHIP"))).toEqual(roleError);
    // An Earth actor on a state event does not even match the schema (Q1).
    const forged = { ...cancelled(incident, 2, 2), actor: "EARTH" };
    expect(errorOf(await syncOne(forged, "EARTH"))).toMatchObject({ code: "VALIDATION_FAILED" });
    expect((await list("crew-8", "SHIP")).incidents[0]).toMatchObject({ state: "ACTIVE" });
  });

  it("EARTH_REVIEW before Earth receives the report -> REPORT_NOT_DELIVERED (QA-311)", async () => {
    const incident = newIncident("crew-9");
    const reportError = { status: "INVALID", retryable: false, code: "REPORT_NOT_DELIVERED" };
    // No incident at all, then only INCIDENT_OPENED delivered.
    expect(errorOf(await syncOne(earthReview(incident, 5), "EARTH"))).toEqual(reportError);
    expect((await syncOne(opened(incident, 1))).status).toBe("ACCEPTED");
    now.set(realAt(31));
    expect(errorOf(await syncOne(earthReview(incident, 31), "EARTH"))).toEqual(reportError);
    // Report accepted at 10:31, delivered at 10:51.
    expect((await syncOne(reportSubmitted(incident, 2, 31))).status).toBe("ACCEPTED");
    now.set(realAt(50));
    expect(errorOf(await syncOne(earthReview(incident, 50), "EARTH"))).toEqual(reportError);
    now.set(realAt(51));
    expect((await syncOne(earthReview(incident, 51), "EARTH")).status).toBe("ACCEPTED");
  });

  it("REVIEWED needs an EARTH_REVIEW of the same incident delivered by the closure -> REVIEW_NOT_DELIVERED", async () => {
    const incident = newIncident("crew-10");
    expect((await sync([opened(incident, 1), reportSubmitted(incident, 2, 2)])).every((r) => r.status === "ACCEPTED")).toBe(true);
    const reviewError = { status: "INVALID", retryable: false, code: "REVIEW_NOT_DELIVERED" };
    // A review that does not exist.
    expect(errorOf(await syncOne(closedReviewed(incident, 3, 5, randomUUID())))).toEqual(reviewError);
    // A ship event of the incident is not a review.
    const shipEventId = (await db.prisma.incidentEvent.findFirstOrThrow({ where: { incidentId: incident.incidentId } })).id;
    expect(errorOf(await syncOne(closedReviewed(incident, 3, 5, shipEventId)))).toEqual(reviewError);

    // A delivered review of ANOTHER incident.
    const other = newIncident("crew-11");
    expect((await sync([opened(other, 1), reportSubmitted(other, 2, 2)])).every((r) => r.status === "ACCEPTED")).toBe(true);
    now.set(realAt(30));
    const otherReview = earthReview(other, 30);
    expect((await syncOne(otherReview, "EARTH")).status).toBe("ACCEPTED");
    now.set(realAt(50));
    expect(errorOf(await syncOne(closedReviewed(incident, 3, 50, otherReview.id)))).toEqual(reviewError);

    // Without review, CLOSED_WITHOUT_REVIEW is always possible from AWAITING_REVIEW.
    expect((await syncOne(closedWithoutReview(incident, 3, 50))).status).toBe("ACCEPTED");
  });

  it("a late review (after the ship cancelled) is accepted and kept without changing the state (QA-309)", async () => {
    const incident = newIncident("crew-12");
    expect((await sync([opened(incident, 1), reportSubmitted(incident, 2, 2)])).every((r) => r.status === "ACCEPTED")).toBe(true);
    now.set(realAt(20));
    expect((await syncOne(cancelled(incident, 3, 20))).status).toBe("ACCEPTED");

    // 10:30: Earth sees the report (the cancellation arrives at 10:40) and reviews.
    now.set(realAt(30));
    const review = earthReview(incident, 30);
    expect((await syncOne(review, "EARTH")).status).toBe("ACCEPTED");

    now.set(realAt(60));
    const ship = (await list("crew-12", "SHIP")).incidents[0]!;
    expect(ship.state).toBe("CANCELLED");
    expect(ship.events.at(-1)).toMatchObject({ event: { id: review.id }, transportStatus: "DELIVERED" });
    const earth = (await list("crew-12", "EARTH")).incidents[0]!;
    expect(earth.state).toBe("CANCELLED");
    expect(earth.events.map((item) => item.event.type)).toEqual([
      "INCIDENT_OPENED",
      "REPORT_SUBMITTED",
      "INCIDENT_CANCELLED",
      "EARTH_REVIEW",
    ]);
  });

  it("unknown astronaut, incident of another astronaut and event from the future", async () => {
    const mine = newIncident("crew-13");
    expect((await syncOne(opened(mine, 1))).status).toBe("ACCEPTED");

    expect(errorOf(await syncOne(opened(newIncident("nobody"), 1)))).toEqual({
      status: "INVALID",
      retryable: false,
      code: "UNKNOWN_ASTRONAUT",
    });
    const stolen = { ...guideStarted(mine, 2, 2), astronautId: "crew-14" };
    expect(errorOf(await syncOne(stolen))).toEqual({ status: "INVALID", retryable: false, code: "INCIDENT_NOT_OWNED" });
    // createdAtSim 10:11 > acceptedAtSim 10:10 -> retryable.
    expect(errorOf(await syncOne(guideStarted(mine, 2, 11)))).toEqual({
      status: "INVALID",
      retryable: true,
      code: "CREATED_AFTER_ACCEPTANCE",
    });
    expect(await db.prisma.incidentEvent.count({ where: { incidentId: mine.incidentId } })).toBe(1);
  });

  it("GET /api/incidents validates astronautId and requires X-Demo-Role", async () => {
    const bad = await request(app.getHttpServer()).get("/api/incidents?astronautId=NOT%20VALID").set("X-Demo-Role", "SHIP");
    expect(bad.status).toBe(400);
    const noRole = await request(app.getHttpServer()).get("/api/incidents?astronautId=crew-1");
    expect(noRole.status).toBe(400);
    expect(noRole.body).toMatchObject({ error: "MISSING_OR_INVALID_ROLE" });
    expect((await list("nobody", "SHIP")).incidents).toEqual([]);
  });
});

describe("incidents: EARTH sees only the contiguous prefix of delivered ship events", () => {
  let db: TestDatabase;
  let app: INestApplication;
  const now = new FakeNow(realAt(10));
  const { syncOne, list } = helpers(() => app);

  beforeAll(async () => {
    db = createTestDatabase();
    app = await setUp(db, ["sam"], now);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  it("a later delivered event stays hidden while an earlier one is still in transit", async () => {
    const incident = newIncident("sam");
    // 10:10 with 20 min: INCIDENT_OPENED delivered at 10:30.
    expect((await syncOne(opened(incident, 1))).status).toBe("ACCEPTED");
    // 10:12 with 20 min: GUIDE_STARTED delivered at 10:32.
    now.set(realAt(12));
    expect((await syncOne(guideStarted(incident, 2, 12))).status).toBe("ACCEPTED");
    // A new profile version with a 0-minute delay (fictitious): REPORT_SUBMITTED delivered at once.
    await insertProfile(db.prisma, 2, 0);
    now.set(realAt(14));
    const report = await syncOne(reportSubmitted(incident, 3, 14));
    expect(report.status).toBe("ACCEPTED");
    if (report.status === "ACCEPTED") expect(report.transmission).toMatchObject({ deliverAt: simAt(14), envVersion: 2 });

    // 10:20: event 3 is delivered but 1 and 2 are not -> Earth sees nothing.
    now.set(realAt(20));
    expect((await list("sam", "EARTH")).incidents).toEqual([]);

    // 10:30: only event 1 (2 is still in transit, so 3 stays hidden).
    now.set(realAt(30));
    const earthAt30 = (await list("sam", "EARTH")).incidents[0]!;
    expect(earthAt30.state).toBe("ACTIVE");
    expect(earthAt30.events.map((item) => ("sequence" in item.event ? item.event.sequence : null))).toEqual([1]);

    // 10:32: the whole chain.
    now.set(realAt(32));
    const earthAt32 = (await list("sam", "EARTH")).incidents[0]!;
    expect(earthAt32.state).toBe("AWAITING_REVIEW");
    expect(earthAt32.events.map((item) => ("sequence" in item.event ? item.event.sequence : null))).toEqual([1, 2, 3]);
  });
});

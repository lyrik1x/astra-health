import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MissionConfigResponseSchema, type IncidentEvent, type Measurement, type SyncBatchItem } from "@astra/contracts";
import type { ShipDb } from "../db/ship-db";
import { CREW_KEY, MISSION_CONFIG_KEY } from "../db/schema";
import {
  cancelIncident,
  getOpenIncident,
  openIncident,
  startGuide,
  submitReport,
  toContractIncidentEvent,
} from "../local/incidents-repo";
import { saveMeasurementLocal } from "../local/measurements-repo";
import { listOutbox } from "../local/outbox-repo";
import { T0, crewBody, fakeApi, heartRate, missionConfigBody, newTestDb, uuid } from "../local/test-fixtures";
import { receiveInbound } from "./receive-inbound";
import { syncOnce } from "./sync-once";
import {
  accepted,
  batchResponse,
  createFakeApi,
  incidentsResponse,
  invalid,
  transmissionFor,
  type FakeApi,
  type FakeApiHandlers,
} from "./test-support";

// T-402 Parte B + T-405: incident events through syncOnce and receiveInbound. Fictitious data.

function at(seconds: number): Date {
  return new Date(Date.parse(T0) + seconds * 1000);
}

let db: ShipDb;
beforeEach(async () => {
  db = newTestDb();
  const { clock, profile } = MissionConfigResponseSchema.parse(missionConfigBody);
  await db.config.put({ key: MISSION_CONFIG_KEY, value: { clock, profile } });
  await db.config.put({ key: CREW_KEY, value: crewBody.crew });
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});

function run(fake: FakeApi) {
  return syncOnce({
    api: fakeApi(fake.fetchImpl),
    db,
    now: () => at(100),
    lock: (_name, callback) => callback(),
    log: () => undefined,
  });
}

function setup(handlers: FakeApiHandlers = {}): FakeApi {
  return createFakeApi(handlers);
}

const ids = (items: SyncBatchItem[]) => items.map((item) => `${item.kind}:${item.payload.id}`);

describe("syncOnce with incident events", () => {
  it("sends measurements and events together by savedAtReal, only the contract payload", async () => {
    const m1 = heartRate({ id: uuid(1) }) as Measurement;
    const m3 = heartRate({ id: uuid(3) }) as Measurement;
    await saveMeasurementLocal(m1, at(1), db);
    const opened = await openIncident("astro-a", at(2), db);
    await saveMeasurementLocal(m3, at(3), db);
    const guide = await startGuide(opened.incidentId, "astra-guide-1", at(4), db);
    const fake = setup();

    const summary = await run(fake);

    expect(fake.batches).toHaveLength(1);
    expect(ids(fake.batches[0]!)).toEqual([
      `MEASUREMENT:${m1.id}`,
      `INCIDENT_EVENT:${opened.id}`,
      `MEASUREMENT:${m3.id}`,
      `INCIDENT_EVENT:${guide.id}`,
    ]);
    expect(fake.batches[0]![1]!.payload).toEqual(toContractIncidentEvent(opened));
    expect(summary).toMatchObject({ sent: 4, confirmed: 4, syncErrors: 0, stillPending: 0 });
    expect(await db.incidentEvents.get(opened.id)).toMatchObject({
      syncState: "CONFIRMED",
      transmission: transmissionFor(opened.id, "INCIDENT_EVENT"),
    });
    expect(await listOutbox(db)).toEqual([]);
    // Domain records are kept after CONFIRMED.
    expect(await db.incidentEvents.count()).toBe(2);
  });

  it("inside an incident the order is by sequence even if savedAtReal went back", async () => {
    const opened = await openIncident("astro-a", at(10), db);
    // The device clock went back: event 2 has an earlier savedAtReal than event 1.
    const guide = await startGuide(opened.incidentId, "astra-guide-1", at(5), db);
    const fake = setup();

    await run(fake);

    expect(ids(fake.batches[0]!)).toEqual([`INCIDENT_EVENT:${opened.id}`, `INCIDENT_EVENT:${guide.id}`]);
  });

  it("after a SYNC_ERROR the later events of the same incident are not sent (blockedBy)", async () => {
    const a1 = await openIncident("astro-a", at(1), db);
    const a2 = await startGuide(a1.incidentId, "astra-guide-1", at(2), db);
    const a3 = await submitReport(a1.incidentId, undefined, at(3), db);
    const b1 = await openIncident("astro-b", at(4), db);
    const first = setup({
      batch: () =>
        batchResponse([
          accepted(a1.id, "INCIDENT_EVENT"),
          invalid(a2.id, "INVALID_TRANSITION", "INCIDENT_EVENT"),
          invalid(a3.id, "SEQUENCE_GAP", "INCIDENT_EVENT"),
          accepted(b1.id, "INCIDENT_EVENT"),
        ]),
    });

    const summary = await run(first);

    expect(summary).toMatchObject({ confirmed: 2, syncErrors: 1, stillPending: 1 });
    expect(await db.incidentEvents.get(a2.id)).toMatchObject({
      syncState: "SYNC_ERROR",
      lastError: "INVALID_TRANSITION: Fictitious rejection",
    });
    const outbox = await listOutbox(db);
    expect(outbox.find((entry) => entry.id === a2.id)).toMatchObject({ kind: "INCIDENT_EVENT" });
    expect(outbox.find((entry) => entry.id === a3.id)).toMatchObject({ blockedBy: a2.id, attempts: 1 });

    // A new local event of the blocked incident is also held back; other content still travels.
    const a4 = await cancelIncident(a1.incidentId, "Fictitious reason", at(5), db);
    const m = heartRate({ id: uuid(50) }) as Measurement;
    await saveMeasurementLocal(m, at(6), db);
    const second = setup();

    await run(second);

    expect(ids(second.batches[0]!)).toEqual([`MEASUREMENT:${m.id}`]);
    const after = await listOutbox(db);
    expect(after.find((entry) => entry.id === a4.id)).toMatchObject({ blockedBy: a2.id });
    // Nothing is deleted: the rejected and blocked events stay on the device.
    expect(await db.incidentEvents.where("incidentId").equals(a1.incidentId).count()).toBe(4);
  });

  it("SEQUENCE_GAP and other retryable answers stay PENDING_SYNC and are resent in order", async () => {
    const opened = await openIncident("astro-a", at(1), db);
    const guide = await startGuide(opened.incidentId, "astra-guide-1", at(2), db);
    const first = setup({
      batch: () =>
        batchResponse([
          invalid(opened.id, "UNEXPECTED_ITEM_ERROR", "INCIDENT_EVENT"),
          invalid(guide.id, "SEQUENCE_GAP", "INCIDENT_EVENT"),
        ]),
    });

    expect(await run(first)).toMatchObject({ stillPending: 2, syncErrors: 0 });
    expect(await db.incidentEvents.get(guide.id)).toMatchObject({ syncState: "PENDING_SYNC" });
    expect((await listOutbox(db)).map((entry) => entry.attempts)).toEqual([1, 1]);

    const second = setup();
    expect(await run(second)).toMatchObject({ confirmed: 2 });
    expect(ids(second.batches[0]!)).toEqual([`INCIDENT_EVENT:${opened.id}`, `INCIDENT_EVENT:${guide.id}`]);
    expect(await listOutbox(db)).toEqual([]);
  });

  it("a network failure keeps the events PENDING_SYNC and the incident usable offline", async () => {
    const opened = await openIncident("astro-a", at(1), db);
    const fake = setup({
      batch: () => {
        throw new TypeError("Failed to fetch");
      },
    });

    expect(await run(fake)).toMatchObject({ stoppedBy: "NETWORK", stillPending: 1 });
    expect(await db.incidentEvents.get(opened.id)).toMatchObject({ syncState: "PENDING_SYNC" });
    await submitReport(opened.incidentId, undefined, at(2), db);
    expect((await getOpenIncident("astro-a", db))?.state).toBe("AWAITING_REVIEW");
  });
});

describe("receiveInbound with incidents", () => {
  function receive(fake: FakeApi) {
    return receiveInbound({ api: fakeApi(fake.fetchImpl), db, now: () => at(100) });
  }

  function reviewOf(event: IncidentEvent, n: number): IncidentEvent {
    return {
      id: uuid(n),
      incidentId: event.incidentId,
      astronautId: event.astronautId,
      actor: "EARTH",
      type: "EARTH_REVIEW",
      createdAtReal: T0,
      createdAtSim: T0,
      clockVersion: 1,
      data: { text: "Fictitious review" },
    };
  }

  it("stores the delivered review as HYDRATED, confirms the own event and creates no duplicates", async () => {
    const local = await openIncident("astro-a", at(1), db);
    const own = toContractIncidentEvent(local);
    const review = reviewOf(own, 700);
    const fake = setup({
      incidents: (id) => incidentsResponse(id === "astro-a" ? [{ state: "ACTIVE", events: [own, review] }] : []),
    });

    const summary = await receive(fake);

    expect(summary.incidentEvents).toEqual({ added: 1, updated: 1, mismatched: 0 });
    expect(await db.incidentEvents.get(review.id)).toEqual({
      ...review,
      syncState: "CONFIRMED",
      localOrigin: "HYDRATED",
      savedAtReal: at(100).toISOString(),
      transmission: transmissionFor(review.id, "INCIDENT_EVENT", "EARTH_TO_SHIP"),
    });
    expect(await db.incidentEvents.get(own.id)).toMatchObject({
      localOrigin: "CAPTURED",
      syncState: "CONFIRMED",
      transmission: transmissionFor(own.id, "INCIDENT_EVENT"),
    });
    expect(await listOutbox(db)).toEqual([]);
    expect((await getOpenIncident("astro-a", db))?.reviews.map((record) => record.id)).toEqual([review.id]);

    // Second download: same records, nothing added.
    const before = await db.incidentEvents.toArray();
    expect((await receive(fake)).incidentEvents).toEqual({ added: 0, updated: 2, mismatched: 0 });
    expect(await db.incidentEvents.toArray()).toEqual(before);
  });

  it("an own event missing on this device is hydrated; a different event in the same sequence is untouched", async () => {
    const local = await openIncident("astro-a", at(1), db);
    const localPayload = toContractIncidentEvent(local);
    // The server holds another UUID at sequence 1 of the same incident, and event 2 we do not have.
    const otherAtOne: IncidentEvent = { ...localPayload, id: uuid(801) };
    const remoteTwo: IncidentEvent = {
      id: uuid(802),
      incidentId: localPayload.incidentId,
      astronautId: localPayload.astronautId,
      actor: "SHIP",
      sequence: 2,
      type: "GUIDE_STARTED",
      createdAtReal: localPayload.createdAtReal,
      createdAtSim: localPayload.createdAtSim,
      clockVersion: localPayload.clockVersion,
      data: { guideVersion: "astra-guide-1" },
    };
    // An incident of another device, absent here.
    const elsewhere: IncidentEvent = { ...localPayload, id: uuid(803), incidentId: uuid(804), astronautId: "astro-b" };
    const fake = setup({
      incidents: (id) =>
        incidentsResponse(
          id === "astro-a"
            ? [{ state: "GUIDED", events: [otherAtOne, remoteTwo] }]
            : [{ state: "ACTIVE", events: [elsewhere] }],
        ),
    });
    const localBefore = await db.incidentEvents.get(local.id);

    const summary = await receive(fake);

    expect(summary.incidentEvents).toEqual({ added: 2, updated: 0, mismatched: 1 });
    expect(await db.incidentEvents.get(otherAtOne.id)).toBeUndefined();
    expect(await db.incidentEvents.get(local.id)).toEqual(localBefore);
    expect(await db.incidentEvents.get(remoteTwo.id)).toMatchObject({ localOrigin: "HYDRATED", syncState: "CONFIRMED" });
    expect(await db.incidentEvents.get(elsewhere.id)).toMatchObject({ localOrigin: "HYDRATED", astronautId: "astro-b" });
    // Hydrated events never enter the outbox.
    expect((await listOutbox(db)).map((entry) => entry.id)).toEqual([local.id]);
  });

  it("an own event with the same UUID and different content is left untouched", async () => {
    const local = await openIncident("astro-a", at(1), db);
    const changed: IncidentEvent = { ...toContractIncidentEvent(local), createdAtSim: T0 };
    const fake = setup({ incidents: (id) => incidentsResponse(id === "astro-a" ? [{ state: "ACTIVE", events: [changed] }] : []) });
    const before = await db.incidentEvents.get(local.id);

    expect((await receive(fake)).incidentEvents).toEqual({ added: 0, updated: 0, mismatched: 1 });
    expect(await db.incidentEvents.get(local.id)).toEqual(before);
  });
});

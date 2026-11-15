import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Measurement } from "@astra/contracts";
import type { ShipDb } from "../db/ship-db";
import { CREW_KEY } from "../db/schema";
import { markMeasurementSyncError, saveMeasurementLocal } from "../local/measurements-repo";
import { listOutbox } from "../local/outbox-repo";
import { T0, crewBody, fakeApi, heartRate, jsonResponse, newTestDb, uuid } from "../local/test-fixtures";
import { receiveInbound } from "./receive-inbound";
import { createFakeApi, measurementsResponse, transmissionFor } from "./test-support";

const NO_INCIDENT_EVENTS = { added: 0, updated: 0, mismatched: 0 };

const realNow = new Date(T0);

let db: ShipDb;
beforeEach(async () => {
  db = newTestDb();
  await db.config.put({ key: CREW_KEY, value: crewBody.crew });
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});

const remoteA = heartRate({ id: uuid(10), value: 68 }) as Measurement;
const remoteB = heartRate({ id: uuid(11), astronautId: "astro-b" }) as Measurement;

function history(byAstronaut: Record<string, Measurement[]>) {
  return createFakeApi({ measurements: (id) => measurementsResponse(byAstronaut[id] ?? []) });
}

function receive(fake: ReturnType<typeof createFakeApi>) {
  return receiveInbound({ api: fakeApi(fake.fetchImpl), db, now: () => realNow });
}

describe("receiveInbound", () => {
  it("adds the history as HYDRATED + CONFIRMED records, one request per local astronaut, as SHIP", async () => {
    const fake = history({ "astro-a": [remoteA], "astro-b": [remoteB] });

    expect(await receive(fake)).toEqual({ added: 2, updated: 0, mismatched: 0, incidentEvents: NO_INCIDENT_EVENTS });

    expect(fake.paths).toEqual([
      "/api/measurements?astronautId=astro-a",
      "/api/incidents?astronautId=astro-a",
      "/api/measurements?astronautId=astro-b",
      "/api/incidents?astronautId=astro-b",
    ]);
    expect(fake.roles).toEqual(["SHIP", "SHIP", "SHIP", "SHIP"]);
    expect(await db.measurements.get(remoteA.id)).toEqual({
      ...remoteA,
      syncState: "CONFIRMED",
      localOrigin: "HYDRATED",
      savedAtReal: T0,
      transmission: transmissionFor(remoteA.id),
    });
    // Hydrated records never enter the outbox.
    expect(await listOutbox(db)).toEqual([]);
  });

  it("downloading twice creates no duplicates (QA-112)", async () => {
    const fake = history({ "astro-a": [remoteA], "astro-b": [remoteB] });
    await receive(fake);
    const before = await db.measurements.toArray();

    expect(await receive(fake)).toEqual({ added: 0, updated: 2, mismatched: 0, incidentEvents: NO_INCIDENT_EVENTS });
    expect(await db.measurements.toArray()).toEqual(before);
  });

  it("a local pending record with the SAME payload goes to CONFIRMED and its outbox entry is pruned", async () => {
    await saveMeasurementLocal(remoteA, realNow, db);

    expect(await receive(history({ "astro-a": [remoteA] }))).toEqual({ added: 0, updated: 1, mismatched: 0, incidentEvents: NO_INCIDENT_EVENTS });

    expect(await db.measurements.get(remoteA.id)).toEqual({
      ...remoteA,
      syncState: "CONFIRMED",
      localOrigin: "CAPTURED",
      savedAtReal: T0,
      transmission: transmissionFor(remoteA.id),
    });
    expect(await listOutbox(db)).toEqual([]);
  });

  it("a local record with a DIFFERENT payload (SYNC_ERROR by CONFLICT) is left untouched", async () => {
    const local = { ...remoteA, value: 99 } as Measurement;
    await saveMeasurementLocal(local, realNow, db);
    await markMeasurementSyncError(local.id, "UUID_CONFLICT: Same UUID with different content", db);
    const before = await db.measurements.get(local.id);
    const outboxBefore = await listOutbox(db);

    expect(await receive(history({ "astro-a": [remoteA] }))).toEqual({ added: 0, updated: 0, mismatched: 1, incidentEvents: NO_INCIDENT_EVENTS });

    expect(await db.measurements.get(local.id)).toEqual(before);
    expect(before).toMatchObject({ value: 99, syncState: "SYNC_ERROR" });
    expect(await listOutbox(db)).toEqual(outboxBefore);
  });

  it("without a local crew it does nothing", async () => {
    await db.config.clear();
    const fake = history({ "astro-a": [remoteA] });

    expect(await receive(fake)).toEqual({ added: 0, updated: 0, mismatched: 0, incidentEvents: NO_INCIDENT_EVENTS });
    expect(fake.paths).toEqual([]);
  });

  it("an invalid body throws and writes nothing", async () => {
    const fake = createFakeApi({ measurements: () => jsonResponse({ serverSimNow: "nope", items: [] }) });

    await expect(receive(fake)).rejects.toMatchObject({ name: "ZodError" });
    expect(await db.measurements.count()).toBe(0);
  });

  it("a non-2xx answer throws", async () => {
    const fake = createFakeApi({ measurements: () => jsonResponse({ statusCode: 503, error: "X", message: "x" }, 503) });

    await expect(receive(fake)).rejects.toThrow("HTTP 503");
  });
});

import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionConfigResponseSchema, type Measurement } from "@astra/contracts";
import type { ShipDb } from "../db/ship-db";
import { CREW_KEY, MISSION_CONFIG_KEY, type LocalMissionConfig } from "../db/schema";
import { getLocalCrew } from "../local/crew-repo";
import { saveMeasurementLocal } from "../local/measurements-repo";
import { getLocalMissionConfig } from "../local/mission-config-repo";
import { listOutbox } from "../local/outbox-repo";
import { T0, crewBody, fakeApi, heartRate, jsonResponse, missionConfigBody, newTestDb, uuid } from "../local/test-fixtures";
import { syncOnce, type SyncDeps } from "./sync-once";
import {
  accepted,
  batchResponse,
  conflict,
  createFakeApi,
  createMutexLock,
  hangUntilAborted,
  invalid,
  measurementsResponse,
  transmissionFor,
  type FakeApi,
  type FakeApiHandlers,
} from "./test-support";

let db: ShipDb;
beforeEach(() => {
  db = newTestDb();
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});

/** Saves n measurements; savedAtReal one second apart so the send order is known. */
async function saveMany(count: number, first = 1): Promise<Measurement[]> {
  const saved: Measurement[] = [];
  for (let n = first; n < first + count; n += 1) {
    const measurement = heartRate({ id: uuid(n) }) as Measurement;
    await saveMeasurementLocal(measurement, new Date(Date.parse(T0) + n * 1000), db);
    saved.push(measurement);
  }
  return saved;
}

function run(fake: FakeApi, extra: Partial<SyncDeps> = {}) {
  return syncOnce({
    api: fakeApi(fake.fetchImpl),
    db,
    now: () => new Date(T0),
    lock: createMutexLock(),
    log: () => undefined,
    ...extra,
  });
}

function setup(handlers: FakeApiHandlers = {}): FakeApi {
  return createFakeApi(handlers);
}

describe("syncOnce: send", () => {
  it("happy path: CONFIRMED with its transmission, outbox empty, record kept", async () => {
    const [m] = await saveMany(1);
    const fake = setup();

    const summary = await run(fake);

    expect(summary).toMatchObject({ sent: 1, confirmed: 1, syncErrors: 0, stillPending: 0 });
    expect(summary.stoppedBy).toBeUndefined();
    const record = await db.measurements.get(m!.id);
    expect(record).toEqual({
      ...m,
      syncState: "CONFIRMED",
      localOrigin: "CAPTURED",
      savedAtReal: new Date(Date.parse(T0) + 1000).toISOString(),
      transmission: transmissionFor(m!.id),
    });
    expect(await listOutbox(db)).toEqual([]);
    // Only the contract payload travels (no local fields).
    expect(fake.batches).toEqual([[{ kind: "MEASUREMENT", payload: m }]]);
    expect(fake.roles.every((role) => role === "SHIP")).toBe(true);
  });

  it("network down: PENDING_SYNC, attempts 1, record intact, cycle stops (QA-104, QA-111)", async () => {
    const [m] = await saveMany(1);
    const fake = setup({
      batch: () => {
        throw new TypeError("Failed to fetch");
      },
    });

    const summary = await run(fake);

    expect(summary.stoppedBy).toBe("NETWORK");
    expect(summary.stillPending).toBe(1);
    expect(await db.measurements.get(m!.id)).toMatchObject({ ...m, syncState: "PENDING_SYNC" });
    expect(await listOutbox(db)).toEqual([expect.objectContaining({ id: m!.id, attempts: 1 })]);
    // Stopped: no reception or config after the failed send.
    expect(fake.paths).toEqual(["/api/sync/batch"]);

    await run(fake);
    expect(await listOutbox(db)).toEqual([expect.objectContaining({ id: m!.id, attempts: 2 })]);
  });

  it("timeout: the request is aborted and the items stay PENDING_SYNC", async () => {
    const [m] = await saveMany(1);
    const fake = setup({ batch: hangUntilAborted });

    const summary = await run(fake, { timeoutMs: 20 });

    expect(summary.stoppedBy).toBe("TIMEOUT");
    expect((await db.measurements.get(m!.id))?.syncState).toBe("PENDING_SYNC");
    expect(await listOutbox(db)).toEqual([expect.objectContaining({ attempts: 1 })]);
  });

  it("5xx: PENDING_SYNC and the cycle stops", async () => {
    await saveMany(2);
    const fake = setup({ batch: () => jsonResponse({ statusCode: 503, error: "X", message: "x" }, 503) });

    const summary = await run(fake);

    expect(summary.stoppedBy).toBe("SERVER_ERROR");
    expect((await db.measurements.toArray()).map((r) => r.syncState)).toEqual(["PENDING_SYNC", "PENDING_SYNC"]);
  });

  it("CONFLICT: SYNC_ERROR visible, data kept, and the next cycle does not resend it (QA-111)", async () => {
    const [m] = await saveMany(1);
    const fake = setup({ batch: (items) => batchResponse(items.map((item) => conflict(item.payload.id))) });

    const summary = await run(fake);
    expect(summary).toMatchObject({ syncErrors: 1, confirmed: 0 });
    const record = await db.measurements.get(m!.id);
    expect(record).toMatchObject({ ...m, syncState: "SYNC_ERROR" });
    expect(record?.lastError).toMatch(/^UUID_CONFLICT: /);
    // The outbox entry is NOT deleted (only after CONFIRMED).
    expect(await listOutbox(db)).toHaveLength(1);

    await run(fake);
    expect(fake.batches).toHaveLength(1);
  });

  it("non-retryable INVALID: SYNC_ERROR with its code", async () => {
    const [m] = await saveMany(1);
    const fake = setup({ batch: (items) => batchResponse(items.map((item) => invalid(item.payload.id, "UNKNOWN_ASTRONAUT"))) });

    await run(fake);

    expect(await db.measurements.get(m!.id)).toMatchObject({ syncState: "SYNC_ERROR", lastError: "UNKNOWN_ASTRONAUT: Fictitious rejection" });
  });

  it("retryable INVALID: stays PENDING_SYNC with attempts + 1 and is resent next cycle", async () => {
    const [m] = await saveMany(1);
    const fake = setup({ batch: (items) => batchResponse(items.map((item) => invalid(item.payload.id, "UNEXPECTED_ITEM_ERROR"))) });

    const summary = await run(fake);
    expect(summary).toMatchObject({ stillPending: 1, syncErrors: 0 });
    expect((await db.measurements.get(m!.id))?.syncState).toBe("PENDING_SYNC");
    expect(await listOutbox(db)).toEqual([expect.objectContaining({ attempts: 1 })]);

    await run(fake);
    expect(fake.batches).toHaveLength(2);
  });

  it("a mixed batch applies each result to its own item", async () => {
    const [a, b, c] = await saveMany(3);
    const fake = setup({
      batch: () => batchResponse([accepted(a!.id), conflict(b!.id), invalid(c!.id, "UNEXPECTED_ITEM_ERROR")]),
    });

    await run(fake);

    expect((await db.measurements.toArray()).map((r) => [r.id, r.syncState])).toEqual([
      [a!.id, "CONFIRMED"],
      [b!.id, "SYNC_ERROR"],
      [c!.id, "PENDING_SYNC"],
    ]);
    expect((await listOutbox(db)).map((entry) => entry.id)).toEqual([b!.id, c!.id]);
  });

  it("sends at most 20 items per batch, oldest savedAtReal first", async () => {
    const saved = await saveMany(25);
    const fake = setup();

    await run(fake);

    expect(fake.batches.map((batch) => batch.length)).toEqual([20, 5]);
    expect(fake.batches.flat().map((item) => item.payload.id)).toEqual(saved.map((m) => m.id));
    expect(await listOutbox(db)).toEqual([]);
  });

  it("413: the batch is split in half until it fits", async () => {
    await saveMany(5);
    const tooLarge = () => jsonResponse({ statusCode: 413, error: "PAYLOAD_TOO_LARGE", message: "Too large" }, 413);
    const fake = setup({
      batch: (items) => (items.length > 2 ? tooLarge() : batchResponse(items.map((item) => accepted(item.payload.id)))),
    });

    const summary = await run(fake);

    expect(fake.batches.map((batch) => batch.length)).toEqual([5, 3, 2, 1, 2]);
    expect(summary.confirmed).toBe(5);
    expect(await listOutbox(db)).toEqual([]);
  });

  it("413 on a single item: permanent SYNC_ERROR PAYLOAD_TOO_LARGE, data kept", async () => {
    const [m] = await saveMany(1);
    const fake = setup({
      batch: () => jsonResponse({ statusCode: 413, error: "PAYLOAD_TOO_LARGE", message: "Too large" }, 413),
    });

    await run(fake);

    expect(await db.measurements.get(m!.id)).toMatchObject({ ...m, syncState: "SYNC_ERROR" });
    expect((await db.measurements.get(m!.id))?.lastError).toMatch(/^PAYLOAD_TOO_LARGE/);
    expect(await listOutbox(db)).toHaveLength(1);
  });

  it("400 of the envelope: logged as a programming error, cycle stops, data untouched", async () => {
    const [m] = await saveMany(1);
    const log = vi.fn();
    const fake = setup({
      batch: () => jsonResponse({ statusCode: 400, error: "VALIDATION_FAILED", message: "Invalid request" }, 400),
    });

    const summary = await run(fake, { log });

    expect(summary.stoppedBy).toBe("REQUEST_REJECTED");
    expect(log).toHaveBeenCalledOnce();
    expect(await db.measurements.get(m!.id)).toMatchObject({ syncState: "SAVED_LOCAL" });
    expect(await listOutbox(db)).toEqual([expect.objectContaining({ attempts: 0 })]);
  });

  it("a response whose results do not match the items is rejected without changing anything", async () => {
    const [a, b] = await saveMany(2);
    const fake = setup({ batch: () => batchResponse([accepted(b!.id), accepted(a!.id)]) });

    const summary = await run(fake);

    expect(summary.stoppedBy).toBe("BAD_RESPONSE");
    expect((await db.measurements.toArray()).map((r) => r.syncState)).toEqual(["SAVED_LOCAL", "SAVED_LOCAL"]);
  });

  it("two syncOnce() at the same time send each item only once", async () => {
    const saved = await saveMany(3);
    const fake = setup();
    const lock = createMutexLock();

    await Promise.all([run(fake, { lock }), run(fake, { lock })]);

    expect(fake.batches.flat().map((item) => item.payload.id)).toEqual(saved.map((m) => m.id));
    expect(await listOutbox(db)).toEqual([]);
  });
});

describe("syncOnce: reception and config", () => {
  it("order: send, refreshCrew, receiveInbound (with the fresh crew), refreshMissionConfig", async () => {
    await saveMany(1);
    const fake = setup();

    const summary = await run(fake);

    expect(fake.paths).toEqual([
      "/api/sync/batch",
      "/api/crew",
      "/api/measurements?astronautId=astro-a",
      "/api/measurements?astronautId=astro-b",
      "/api/mission/config",
    ]);
    expect(summary).toMatchObject({ crewRefreshed: true, missionConfigRefreshed: true, inbound: { added: 0, updated: 0, mismatched: 0 } });
    expect(await getLocalCrew(db)).toEqual(crewBody.crew);
    expect(await getLocalMissionConfig(db)).toEqual({ clock: missionConfigBody.clock, profile: missionConfigBody.profile });
  });

  it("with nothing to send it still receives and refreshes", async () => {
    const remote = heartRate({ id: uuid(77) }) as Measurement;
    const fake = setup({ measurements: (id) => measurementsResponse(id === "astro-a" ? [remote] : []) });

    const summary = await run(fake);

    expect(fake.batches).toEqual([]);
    expect(summary.inbound).toEqual({ added: 1, updated: 0, mismatched: 0 });
    expect(await db.measurements.get(remote.id)).toMatchObject({ localOrigin: "HYDRATED", syncState: "CONFIRMED" });
  });

  it("failed crew and config refresh keep the previous copies; hydration uses the previous crew", async () => {
    const previousCrew = [{ id: "astro-a", displayName: "Astronaut A" }];
    const { clock, profile } = MissionConfigResponseSchema.parse(missionConfigBody);
    const previousConfig: LocalMissionConfig = { clock, profile };
    await db.config.put({ key: CREW_KEY, value: previousCrew });
    await db.config.put({ key: MISSION_CONFIG_KEY, value: previousConfig });
    const fake = setup({
      crew: () => jsonResponse({ statusCode: 503, error: "X", message: "x" }, 503),
      config: () => {
        throw new TypeError("Failed to fetch");
      },
    });

    const summary = await run(fake);

    expect(summary).toMatchObject({ crewRefreshed: false, missionConfigRefreshed: false });
    expect(await getLocalCrew(db)).toEqual(previousCrew);
    expect(await getLocalMissionConfig(db)).toEqual(previousConfig);
    expect(fake.paths).toContain("/api/measurements?astronautId=astro-a");
  });

  it("a failed reception is reported and config is still refreshed", async () => {
    const fake = setup({ measurements: () => jsonResponse({ statusCode: 503, error: "X", message: "x" }, 503) });

    const summary = await run(fake);

    expect(summary.inboundFailed).toBe(true);
    expect(summary.missionConfigRefreshed).toBe(true);
  });
});

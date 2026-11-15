import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ShipDb } from "../db/ship-db";
import { LocalRecordExistsError, listMeasurementsLocal, saveMeasurementLocal, toContractMeasurement } from "./measurements-repo";
import { listOutbox } from "./outbox-repo";
import { T0, heartRate, newTestDb, uuid } from "./test-fixtures";

const realNow = new Date(T0);

let db: ShipDb;
beforeEach(() => {
  db = newTestDb();
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});

describe("saveMeasurementLocal", () => {
  it("writes the measurement and its outbox entry with the initial states", async () => {
    const saved = await saveMeasurementLocal(heartRate(), realNow, db);

    expect(await db.measurements.toArray()).toEqual([
      { ...heartRate(), syncState: "SAVED_LOCAL", localOrigin: "CAPTURED", savedAtReal: T0 },
    ]);
    expect(await listOutbox(db)).toEqual([{ id: uuid(1), kind: "MEASUREMENT", savedAtReal: T0, attempts: 0 }]);
    expect(saved.syncState).toBe("SAVED_LOCAL");
  });

  it("writes nothing if the outbox write fails (one transaction)", async () => {
    db.outbox.hook("creating", () => {
      throw new Error("simulated outbox failure");
    });

    await expect(saveMeasurementLocal(heartRate(), realNow, db)).rejects.toThrow("simulated outbox failure");
    expect(await db.measurements.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it("rejects an invalid measurement without writing", async () => {
    await expect(saveMeasurementLocal(heartRate({ unit: "degC" }), realNow, db)).rejects.toMatchObject({ name: "ZodError" });
    await expect(saveMeasurementLocal(heartRate({ extra: true }), realNow, db)).rejects.toMatchObject({ name: "ZodError" });
    expect(await db.measurements.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it("rejects a repeated id without overwriting", async () => {
    await saveMeasurementLocal(heartRate(), realNow, db);

    await expect(saveMeasurementLocal(heartRate({ value: 99 }), new Date("2026-11-14T17:00:00.000Z"), db)).rejects.toBeInstanceOf(
      LocalRecordExistsError,
    );
    const stored = await db.measurements.get(uuid(1));
    expect(stored?.value).toBe(70);
    expect(stored?.savedAtReal).toBe(T0);
    expect(await db.outbox.count()).toBe(1);
  });

  it("keeps the data after closing and reopening the database", async () => {
    await saveMeasurementLocal(heartRate(), realNow, db);
    db.close();

    const reopened = new ShipDb(db.name);
    try {
      expect(await reopened.measurements.get(uuid(1))).toMatchObject({ id: uuid(1), syncState: "SAVED_LOCAL" });
      expect(await reopened.outbox.get(uuid(1))).toMatchObject({ kind: "MEASUREMENT", attempts: 0 });
    } finally {
      reopened.close();
    }
  });
});

describe("listMeasurementsLocal", () => {
  it("returns only that astronaut, ordered by capturedAtSim, capturedAtReal and id", async () => {
    const sim1 = "2026-01-01T00:00:00.000Z";
    const sim2 = "2026-01-02T00:00:00.000Z";
    const real1 = "2026-11-14T16:00:00.000Z";
    const real2 = "2026-11-14T16:05:00.000Z";
    const inputs = [
      heartRate({ id: uuid(5), capturedAtSim: sim2, capturedAtReal: real1 }),
      heartRate({ id: uuid(4), capturedAtSim: sim1, capturedAtReal: real2 }),
      heartRate({ id: uuid(3), capturedAtSim: sim1, capturedAtReal: real1 }),
      { ...heartRate({ id: uuid(2), capturedAtSim: sim1, capturedAtReal: real1 }), indicator: "MOOD", value: 3, unit: "scale_1_5" },
      heartRate({ id: uuid(9), astronautId: "astro-b", capturedAtSim: sim1, capturedAtReal: real1 }),
    ];
    for (const input of inputs) {
      await saveMeasurementLocal(input, realNow, db);
    }

    const ids = (await listMeasurementsLocal("astro-a", db)).map((m) => m.id);
    expect(ids).toEqual([uuid(2), uuid(3), uuid(4), uuid(5)]);
    expect(await listMeasurementsLocal("astro-z", db)).toEqual([]);
  });
});

describe("toContractMeasurement (S2)", () => {
  it("drops the local fields and keeps the contract payload", async () => {
    const saved = await saveMeasurementLocal(heartRate(), realNow, db);
    expect(toContractMeasurement(saved)).toEqual(heartRate());
  });
});

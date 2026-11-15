import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { SHIP_DB_NAME, ShipDb, ShipDbForbiddenError, closeShipDb, getShipDb } from "./ship-db";

describe("ShipDb schema (T-005 §6.2)", () => {
  let db: ShipDb | undefined;
  afterEach(async () => {
    if (db) {
      db.close();
      await Dexie.delete(db.name);
      db = undefined;
    }
  });

  it("uses the real name by default", () => {
    expect(new ShipDb().name).toBe("astra-health");
    expect(SHIP_DB_NAME).toBe("astra-health");
  });

  it("opens version 1 with the five tables and the dictionary indexes", async () => {
    db = new ShipDb(`astra-health-test-${crypto.randomUUID()}`);
    await db.open();

    expect(db.verno).toBe(1);
    expect(db.tables.map((t) => t.name).sort()).toEqual(["config", "incidentEvents", "measurements", "messages", "outbox"]);

    const shape = (name: string) => {
      const schema = db!.table(name).schema;
      return {
        primKey: schema.primKey.keyPath,
        indexes: schema.indexes.map((i) => ({ name: i.name, unique: Boolean(i.unique) })),
      };
    };
    expect(shape("measurements")).toEqual({
      primKey: "id",
      indexes: [
        { name: "[astronautId+indicator]", unique: false },
        { name: "capturedAtSim", unique: false },
      ],
    });
    expect(shape("incidentEvents")).toEqual({
      primKey: "id",
      indexes: [
        { name: "[incidentId+sequence]", unique: true },
        { name: "incidentId", unique: false },
      ],
    });
    expect(shape("messages")).toEqual({ primKey: "id", indexes: [{ name: "direction", unique: false }] });
    expect(shape("outbox")).toEqual({ primKey: "id", indexes: [{ name: "savedAtReal", unique: false }] });
    expect(shape("config")).toEqual({ primKey: "key", indexes: [] });
  });
});

describe("getShipDb (D-22: only the ship opens Dexie)", () => {
  afterEach(async () => {
    closeShipDb();
    await Dexie.delete(SHIP_DB_NAME);
  });

  it("throws for the EARTH role", () => {
    expect(() => getShipDb("EARTH")).toThrow(ShipDbForbiddenError);
  });

  it("returns the single real database for the SHIP role", () => {
    const db = getShipDb("SHIP");
    expect(db.name).toBe(SHIP_DB_NAME);
    expect(getShipDb("SHIP")).toBe(db);
  });
});

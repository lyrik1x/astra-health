import Dexie, { type Table } from "dexie";
import type { DemoRole } from "@astra/contracts";
import { getCurrentDemoRole } from "../role/demo-role";
import type {
  ConfigEntry,
  LocalIncidentEventRecord,
  LocalMeasurementRecord,
  LocalMessageRecord,
  OutboxEntry,
} from "./schema";

/** Real name of the ship database (T-005 §6.2). */
export const SHIP_DB_NAME = "astra-health";

/**
 * Dexie database of the ship (T-005 §6.2). `version(1)` has all five tables from the start.
 * Any later change goes up to `version(2)` with its migration; never edit `version(1)`.
 */
export class ShipDb extends Dexie {
  measurements!: Table<LocalMeasurementRecord, string>;
  incidentEvents!: Table<LocalIncidentEventRecord, string>;
  messages!: Table<LocalMessageRecord, string>;
  outbox!: Table<OutboxEntry, string>;
  config!: Table<ConfigEntry, string>;

  /** The name is a parameter only so tests can use unique databases; the app uses getShipDb(). */
  constructor(name: string = SHIP_DB_NAME) {
    super(name);
    this.version(1).stores({
      measurements: "id, [astronautId+indicator], capturedAtSim",
      incidentEvents: "id, &[incidentId+sequence], incidentId",
      messages: "id, direction",
      outbox: "id, savedAtReal",
      config: "key",
    });
  }
}

/** Earth never opens Dexie: the console reads only from the API (D-22). */
export class ShipDbForbiddenError extends Error {
  constructor(role: DemoRole) {
    super(`The local database opens only in the SHIP role (current role: ${role})`);
    this.name = "ShipDbForbiddenError";
  }
}

let shipDb: ShipDb | undefined;

/** Returns the single ship database. Throws ShipDbForbiddenError for EARTH. */
export function getShipDb(role: DemoRole = getCurrentDemoRole()): ShipDb {
  if (role !== "SHIP") {
    throw new ShipDbForbiddenError(role);
  }
  shipDb ??= new ShipDb(SHIP_DB_NAME);
  return shipDb;
}

/** Closes the single ship database (used by tests). The data stays on the device. */
export function closeShipDb(): void {
  shipDb?.close();
  shipDb = undefined;
}

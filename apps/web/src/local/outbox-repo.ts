import { getShipDb, type ShipDb } from "../db/ship-db";
import type { OutboxEntry } from "../db/schema";

/**
 * Pending items, oldest first (by savedAtReal). Read-only here:
 * updating and pruning the outbox after CONFIRMED belongs to T-203.
 */
export async function listOutbox(db: ShipDb = getShipDb()): Promise<OutboxEntry[]> {
  return db.outbox.orderBy("savedAtReal").toArray();
}

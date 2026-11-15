import Dexie from "dexie";
import { apiFetch, type ApiFetch } from "../api/client";
import { closeShipDb, SHIP_DB_NAME } from "../db/ship-db";
import { getCurrentDemoRole } from "../role/demo-role";

export interface ResetDemoOptions {
  api: ApiFetch;
  deleteDatabase: () => Promise<void>;
  reload: () => void;
}

/** Restores the shared demo and, for the ship role, its local database. */
export async function resetShipDemo({ api, deleteDatabase, reload }: ResetDemoOptions): Promise<void> {
  let response: Response;
  try {
    response = await api("/api/demo/reset", { method: "POST" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "network error";
    throw new Error(`Demo reset request failed; local data was not deleted (${detail}).`);
  }
  if (!response.ok) {
    throw new Error(`Demo reset request failed with HTTP ${response.status}; local data was not deleted.`);
  }

  if (getCurrentDemoRole() === "SHIP") await deleteDatabase();
  reload();
}

/** Default dependencies for the later UI integration. */
export const resetDemo = (): Promise<void> =>
  resetShipDemo({
    api: apiFetch,
    async deleteDatabase() {
      closeShipDb();
      await Dexie.delete(SHIP_DB_NAME);
    },
    reload: () => window.location.reload(),
  });

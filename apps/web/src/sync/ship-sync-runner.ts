/** How often the ship retries while the browser reports a link (T-204 §3.1). */
export const SHIP_SYNC_INTERVAL_MS = 5_000;

export interface ShipSyncRunnerDeps {
  /** One sync cycle; in the app, syncOnce from sync-once.ts. */
  syncOnce: () => Promise<unknown>;
  /** In the app, () => navigator.onLine. */
  isOnline: () => boolean;
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  /** Subscribes to the browser `online` event and returns the unsubscribe function. */
  addOnlineListener: (callback: () => void) => () => void;
  log?: (message: string, error: unknown) => void;
}

export interface ShipSyncRunner {
  /** Syncs once if there is a link, then on `online` and every 5 s while online. */
  start(): void;
  stop(): void;
  /** Asks for a cycle now. Skipped without a link or while another cycle is running. */
  requestSync(): void;
}

/**
 * Automatic sync of the ship. Mounted only in the SHIP role (App.tsx).
 * Cycles never overlap: while one runs, new requests are skipped (the Web Lock in
 * syncOnce also protects the data; this only avoids piling up calls).
 * A failed cycle is logged and never breaks the page.
 */
export function createShipSyncRunner(deps: ShipSyncRunnerDeps): ShipSyncRunner {
  const log = deps.log ?? ((message, error) => console.error(message, error));
  let inFlight = false;
  let intervalHandle: unknown = undefined;
  let removeOnlineListener: (() => void) | undefined;

  function requestSync(): void {
    if (inFlight || !deps.isOnline()) return;
    inFlight = true;
    let cycle: Promise<unknown>;
    try {
      cycle = deps.syncOnce();
    } catch (error) {
      cycle = Promise.reject(error);
    }
    cycle
      .catch((error: unknown) => log("Ship sync cycle failed", error))
      .finally(() => {
        inFlight = false;
      });
  }

  function start(): void {
    if (intervalHandle !== undefined) return;
    removeOnlineListener = deps.addOnlineListener(requestSync);
    intervalHandle = deps.setInterval(requestSync, SHIP_SYNC_INTERVAL_MS);
    requestSync();
  }

  function stop(): void {
    if (intervalHandle !== undefined) {
      deps.clearInterval(intervalHandle);
      intervalHandle = undefined;
    }
    removeOnlineListener?.();
    removeOnlineListener = undefined;
  }

  return { start, stop, requestSync };
}

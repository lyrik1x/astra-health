import { SyncBatchResponseSchema, type SyncBatchItem, type SyncItemResult } from "@astra/contracts";
import { apiFetch, type ApiFetch } from "../api/client";
import { getShipDb, type ShipDb } from "../db/ship-db";
import { refreshCrew } from "../local/crew-repo";
import {
  markMeasurementConfirmed,
  markMeasurementPending,
  markMeasurementSyncError,
  toContractMeasurement,
} from "../local/measurements-repo";
import { refreshMissionConfig } from "../local/mission-config-repo";
import { listPendingMeasurementOutbox, type PendingMeasurement } from "../local/outbox-repo";
import { receiveInbound, type InboundSummary } from "./receive-inbound";

/** Name of the Web Lock: only one sync at a time (AGENTS.md §7). */
export const SYNC_LOCK_NAME = "astra-sync";
/** The client sends at most 20 items per batch (T-005 §5.2; the server accepts 50). */
export const CLIENT_BATCH_SIZE = 20;
/** Network timeout of one batch request. */
export const SYNC_TIMEOUT_MS = 10_000;

export type LockFn = <T>(name: string, callback: () => Promise<T>) => Promise<T>;

/** Why the send phase stopped the cycle. */
export type SyncStopReason = "NETWORK" | "TIMEOUT" | "SERVER_ERROR" | "REQUEST_REJECTED" | "BAD_RESPONSE";

export interface SyncDeps {
  api?: ApiFetch;
  db?: ShipDb;
  now?: () => Date;
  lock?: LockFn;
  timeoutMs?: number;
  log?: (message: string) => void;
}

export interface SyncSummary {
  /** Items sent in batches that got a per-item answer. */
  sent: number;
  confirmed: number;
  syncErrors: number;
  stillPending: number;
  /** Set when the send phase stopped the cycle; then reception and config do not run. */
  stoppedBy?: SyncStopReason;
  inbound?: InboundSummary;
  inboundFailed?: boolean;
  crewRefreshed?: boolean;
  missionConfigRefreshed?: boolean;
}

/** Default lock: the Web Locks API. */
const webLock: LockFn = (name, callback) => {
  if (typeof navigator === "undefined" || navigator.locks === undefined) {
    return Promise.reject(new Error("Web Locks API (navigator.locks) is not available"));
  }
  return navigator.locks.request(name, callback);
};

/**
 * One sync cycle of the ship (T-203 §4.1), under the `astra-sync` lock:
 * 1. send pending measurements; 2. refreshCrew(); 3. receiveInbound(); 4. refreshMissionConfig().
 * A failure of steps 2-4 keeps the previous local copies. Nothing here deletes domain records:
 * only outbox entries are pruned, and only after CONFIRMED.
 */
export function syncOnce(deps: SyncDeps = {}): Promise<SyncSummary> {
  const lock = deps.lock ?? webLock;
  return lock(SYNC_LOCK_NAME, () => runCycle(deps));
}

interface CycleContext {
  api: ApiFetch;
  db: ShipDb;
  now: () => Date;
  timeoutMs: number;
  log: (message: string) => void;
  summary: SyncSummary;
}

async function runCycle(deps: SyncDeps): Promise<SyncSummary> {
  const context: CycleContext = {
    api: deps.api ?? apiFetch,
    db: deps.db ?? getShipDb(),
    now: deps.now ?? (() => new Date()),
    timeoutMs: deps.timeoutMs ?? SYNC_TIMEOUT_MS,
    log: deps.log ?? ((message) => console.error(message)),
    summary: { sent: 0, confirmed: 0, syncErrors: 0, stillPending: 0 },
  };
  const { api, db, now, summary, log } = context;

  // 1. Send.
  const pending = await listPendingMeasurementOutbox(db);
  for (let start = 0; start < pending.length; start += CLIENT_BATCH_SIZE) {
    const stop = await sendBatch(pending.slice(start, start + CLIENT_BATCH_SIZE), context);
    if (stop !== null) {
      summary.stoppedBy = stop;
      return summary;
    }
  }

  // 2. Crew first, so the first hydration already has the crew.
  summary.crewRefreshed = await attempt(() => refreshCrew({ api, db }), "refreshCrew", log);

  // 3. Inbound reception.
  try {
    summary.inbound = await receiveInbound({ api, db, now });
  } catch (error) {
    summary.inboundFailed = true;
    log(`receiveInbound failed: ${errorText(error)}`);
  }

  // 4. Mission config.
  summary.missionConfigRefreshed = await attempt(() => refreshMissionConfig({ api, db }), "refreshMissionConfig", log);
  return summary;
}

/**
 * Sends one batch. Returns null to continue, or the reason to stop the cycle.
 * 413 splits the batch in half; a single item that still gets 413 is a permanent SYNC_ERROR.
 */
async function sendBatch(batch: PendingMeasurement[], context: CycleContext): Promise<SyncStopReason | null> {
  const { db, summary, log } = context;
  const items: SyncBatchItem[] = batch.map(({ record }) => ({ kind: "MEASUREMENT", payload: toContractMeasurement(record) }));

  let status: number;
  let body: unknown;
  try {
    ({ status, body } = await postBatch(items, context));
  } catch (error) {
    await markAllPending(batch, context);
    return isAbortError(error) ? "TIMEOUT" : "NETWORK";
  }

  if (status === 413) {
    if (batch.length === 1) {
      await markMeasurementSyncError(batch[0]!.entry.id, "PAYLOAD_TOO_LARGE: Item is too large for the channel", db);
      summary.syncErrors += 1;
      return null;
    }
    const half = Math.ceil(batch.length / 2);
    return (await sendBatch(batch.slice(0, half), context)) ?? (await sendBatch(batch.slice(half), context));
  }
  if (status >= 500) {
    await markAllPending(batch, context);
    return "SERVER_ERROR";
  }
  if (status < 200 || status >= 300) {
    // 400 of the envelope (or another 4xx): a programming error. Log and stop; data untouched.
    log(`POST /api/sync/batch rejected the request with HTTP ${status}: ${JSON.stringify(body)}`);
    return "REQUEST_REJECTED";
  }

  const parsed = SyncBatchResponseSchema.safeParse(body);
  if (!parsed.success || !sameOrder(parsed.data.results, batch)) {
    log("POST /api/sync/batch returned a response that does not match the batch");
    return "BAD_RESPONSE";
  }

  summary.sent += batch.length;
  for (const result of parsed.data.results) {
    await applyResult(result, context);
  }
  return null;
}

/** Results must be in the same order as the items (T-005 §5.2). */
function sameOrder(results: SyncItemResult[], batch: PendingMeasurement[]): boolean {
  return (
    results.length === batch.length &&
    results.every((result, index) => result.kind === "MEASUREMENT" && result.id === batch[index]!.entry.id)
  );
}

async function applyResult(result: SyncItemResult, { db, summary }: CycleContext): Promise<void> {
  switch (result.status) {
    case "ACCEPTED":
    case "DUPLICATE":
      await markMeasurementConfirmed(result.id, result.transmission, db);
      summary.confirmed += 1;
      return;
    case "CONFLICT":
      await markMeasurementSyncError(result.id, `${result.error.error}: ${result.error.message}`, db);
      summary.syncErrors += 1;
      return;
    case "INVALID":
      if (result.retryable) {
        await markMeasurementPending(result.id, db);
        summary.stillPending += 1;
      } else {
        await markMeasurementSyncError(result.id, `${result.error.error}: ${result.error.message}`, db);
        summary.syncErrors += 1;
      }
      return;
  }
}

async function markAllPending(batch: PendingMeasurement[], { db, summary }: CycleContext): Promise<void> {
  for (const { entry } of batch) {
    await markMeasurementPending(entry.id, db);
  }
  summary.stillPending += batch.length;
}

/** POST with a timeout that also covers reading the body. Throws on network error or timeout. */
async function postBatch(items: SyncBatchItem[], { api, timeoutMs }: CycleContext): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await api("/api/sync/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal: controller.signal,
    });
    // A 2xx body must be JSON (else it throws: transient); other bodies are read best-effort for the log.
    const body: unknown = response.ok ? await response.json() : await response.json().catch(() => null);
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function attempt(task: () => Promise<unknown>, name: string, log: (message: string) => void): Promise<boolean> {
  try {
    await task();
    return true;
  } catch (error) {
    log(`${name} failed, keeping the previous local copy: ${errorText(error)}`);
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { SyncBatchResponseSchema, type SyncBatchItem, type SyncItemResult, type Transmission } from "@astra/contracts";
import { apiFetch, type ApiFetch } from "../api/client";
import { getShipDb, type ShipDb } from "../db/ship-db";
import { refreshCrew } from "../local/crew-repo";
import {
  markIncidentEventConfirmed,
  markIncidentEventPending,
  markIncidentEventSyncError,
  toContractIncidentEvent,
} from "../local/incidents-repo";
import {
  markMeasurementConfirmed,
  markMeasurementPending,
  markMeasurementSyncError,
  toContractMeasurement,
} from "../local/measurements-repo";
import { refreshMissionConfig } from "../local/mission-config-repo";
import { listPendingOutbox, type PendingItem } from "../local/outbox-repo";
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
 * 1. send pending measurements and incident events (T-405); 2. refreshCrew(); 3. receiveInbound();
 * 4. refreshMissionConfig().
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
  // By savedAtReal and, inside an incident, by sequence; events blocked by a rejected one are skipped.
  const pending = await listPendingOutbox(db);
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
async function sendBatch(batch: PendingItem[], context: CycleContext): Promise<SyncStopReason | null> {
  const { db, summary, log } = context;
  const items: SyncBatchItem[] = batch.map(toBatchItem);

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
      const only = batch[0]!;
      await markersFor(only.kind).syncError(only.entry.id, "PAYLOAD_TOO_LARGE: Item is too large for the channel", db);
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
function sameOrder(results: SyncItemResult[], batch: PendingItem[]): boolean {
  return (
    results.length === batch.length &&
    results.every((result, index) => result.kind === batch[index]!.kind && result.id === batch[index]!.entry.id)
  );
}

/** Only the contract payload travels (no local fields, S2). */
function toBatchItem(item: PendingItem): SyncBatchItem {
  return item.kind === "MEASUREMENT"
    ? { kind: "MEASUREMENT", payload: toContractMeasurement(item.record) }
    : { kind: "INCIDENT_EVENT", payload: toContractIncidentEvent(item.record) };
}

/** How each kind applies a result locally (same rules for both, T-203 and T-405). */
interface ResultMarkers {
  confirmed: (id: string, transmission: Transmission, db: ShipDb) => Promise<void>;
  syncError: (id: string, lastError: string, db: ShipDb) => Promise<void>;
  pending: (id: string, db: ShipDb) => Promise<void>;
}

const MEASUREMENT_MARKERS: ResultMarkers = {
  confirmed: markMeasurementConfirmed,
  syncError: markMeasurementSyncError,
  pending: markMeasurementPending,
};

/** A permanent rejection of an event also blocks the later events of its incident. */
const INCIDENT_EVENT_MARKERS: ResultMarkers = {
  confirmed: markIncidentEventConfirmed,
  syncError: markIncidentEventSyncError,
  pending: markIncidentEventPending,
};

function markersFor(kind: PendingItem["kind"]): ResultMarkers {
  return kind === "MEASUREMENT" ? MEASUREMENT_MARKERS : INCIDENT_EVENT_MARKERS;
}

async function applyResult(result: SyncItemResult, { db, summary }: CycleContext): Promise<void> {
  // sameOrder already checked that the kind is one of the batch (never MESSAGE here).
  const markers = markersFor(result.kind === "INCIDENT_EVENT" ? "INCIDENT_EVENT" : "MEASUREMENT");
  switch (result.status) {
    case "ACCEPTED":
    case "DUPLICATE":
      await markers.confirmed(result.id, result.transmission, db);
      summary.confirmed += 1;
      return;
    case "CONFLICT":
      await markers.syncError(result.id, `${result.error.error}: ${result.error.message}`, db);
      summary.syncErrors += 1;
      return;
    case "INVALID":
      // Retryable codes (SEQUENCE_GAP, CREATED_AFTER_ACCEPTANCE, UNEXPECTED_ITEM_ERROR) stay pending.
      if (result.retryable) {
        await markers.pending(result.id, db);
        summary.stillPending += 1;
      } else {
        await markers.syncError(result.id, `${result.error.error}: ${result.error.message}`, db);
        summary.syncErrors += 1;
      }
      return;
  }
}

async function markAllPending(batch: PendingItem[], { db, summary }: CycleContext): Promise<void> {
  for (const { kind, entry } of batch) {
    await markersFor(kind).pending(entry.id, db);
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

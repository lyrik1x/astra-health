// Fictitious data and a fake API for the T-203 sync tests only. Not imported by the app.
import type { Measurement, SyncBatchItem, SyncItemResult, Transmission } from "@astra/contracts";
import type { FetchLike } from "../api/client";
import { crewBody, jsonResponse, missionConfigBody } from "../local/test-fixtures";
import type { LockFn } from "./sync-once";

export const SERVER_SIM_NOW = "2026-11-14T16:10:00.000Z";

/** Deterministic server transmission for a content id (variant 9: still a valid UUID). */
export function transmissionFor(contentId: string): Transmission {
  return {
    id: `00000000-0000-4000-9000-${contentId.slice(-12)}`,
    direction: "SHIP_TO_EARTH",
    contentKind: "MEASUREMENT",
    contentId,
    acceptedAtReal: "2026-11-14T16:10:00.000Z",
    acceptedAtSim: SERVER_SIM_NOW,
    deliverAt: "2026-11-14T18:10:00.000Z",
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
  };
}

export function accepted(id: string): SyncItemResult {
  return { id, kind: "MEASUREMENT", status: "ACCEPTED", code: 201, retryable: false, transmission: transmissionFor(id) };
}

export function conflict(id: string): SyncItemResult {
  return {
    id,
    kind: "MEASUREMENT",
    status: "CONFLICT",
    code: 409,
    retryable: false,
    error: { statusCode: 409, error: "UUID_CONFLICT", message: "Same UUID with different content; not overwritten" },
  };
}

export function invalid(id: string, error: "UNKNOWN_ASTRONAUT" | "UNEXPECTED_ITEM_ERROR"): SyncItemResult {
  return {
    id,
    kind: "MEASUREMENT",
    status: "INVALID",
    code: 400,
    retryable: error === "UNEXPECTED_ITEM_ERROR",
    error: { statusCode: 400, error, message: "Fictitious rejection" },
  };
}

export function batchResponse(results: SyncItemResult[], status = 200): Response {
  return jsonResponse({ serverSimNow: SERVER_SIM_NOW, results }, status);
}

export function measurementsResponse(measurements: Measurement[]): Response {
  return jsonResponse({
    serverSimNow: SERVER_SIM_NOW,
    items: measurements.map((measurement) => ({
      measurement,
      transmission: transmissionFor(measurement.id),
      transportStatus: "IN_TRANSIT",
    })),
  });
}

type MaybeAsync<T> = T | Promise<T>;

export interface FakeApiHandlers {
  /** Default: every item ACCEPTED. */
  batch?: (items: SyncBatchItem[], signal: AbortSignal | null | undefined) => MaybeAsync<Response>;
  /** Default: empty history. */
  measurements?: (astronautId: string) => MaybeAsync<Response>;
  /** Default: crewBody. */
  crew?: () => MaybeAsync<Response>;
  /** Default: missionConfigBody. */
  config?: () => MaybeAsync<Response>;
}

export interface FakeApi {
  fetchImpl: FetchLike;
  /** Items of every POST /api/sync/batch, in call order. */
  batches: SyncBatchItem[][];
  /** Path of every request, in call order. */
  paths: string[];
  /** X-Demo-Role of every request. */
  roles: (string | null)[];
}

/** Fake transport routed by path; base URL http://api.test (see fakeApi in local/test-fixtures). */
export function createFakeApi(handlers: FakeApiHandlers = {}): FakeApi {
  const fake: FakeApi = { batches: [], paths: [], roles: [], fetchImpl: async () => jsonResponse({}, 404) };
  fake.fetchImpl = async (input, init) => {
    const url = new URL(input);
    const path = `${url.pathname}${url.search}`;
    fake.paths.push(path);
    fake.roles.push(new Headers(init?.headers).get("X-Demo-Role"));

    if (url.pathname === "/api/sync/batch" && init?.method === "POST") {
      const { items } = JSON.parse(String(init.body)) as { items: SyncBatchItem[] };
      fake.batches.push(items);
      return handlers.batch
        ? handlers.batch(items, init.signal)
        : batchResponse(items.map((item) => accepted(item.payload.id)));
    }
    if (url.pathname === "/api/measurements") {
      const astronautId = url.searchParams.get("astronautId") ?? "";
      return handlers.measurements ? handlers.measurements(astronautId) : measurementsResponse([]);
    }
    if (url.pathname === "/api/crew") return handlers.crew ? handlers.crew() : jsonResponse(crewBody);
    if (url.pathname === "/api/mission/config") return handlers.config ? handlers.config() : jsonResponse(missionConfigBody);
    return jsonResponse({}, 404);
  };
  return fake;
}

/** In-memory mutex with the Web Locks contract: callbacks for the same lock run one at a time. */
export function createMutexLock(): LockFn {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(_name: string, callback: () => Promise<T>): Promise<T> => {
    const run = tail.then(callback);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** A batch handler that never answers until the request is aborted (timeout tests). */
export function hangUntilAborted(_items: SyncBatchItem[], signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted", "AbortError")));
  });
}

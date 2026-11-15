import { describe, expect, it } from "vitest";
import type { SyncBatchRequest } from "@astra/contracts";
import { buildEarthReview } from "../features/earth-console/earth-review";
import { CONFIG, incident, measurementItem, sentResult, shipEvent } from "../features/earth-console/test-fixtures";
import { DEMO_ROLE_HEADER, createApiFetch, type FetchLike } from "./client";
import { fetchIncidents } from "./incidents";
import { fetchMeasurements } from "./measurements";
import { postSyncBatch } from "./sync-batch";

interface Call {
  input: string;
  init: RequestInit | undefined;
}

const SERVER_SIM_NOW = "2031-03-01T00:10:00.000Z";

function earthFetch(body: unknown, calls: Call[], status = 200) {
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return createApiFetch({ baseUrl: "http://localhost:3000", getRole: () => "EARTH", fetchImpl });
}

function roleOf(call: Call | undefined): string | null {
  return new Headers(call?.init?.headers).get(DEMO_ROLE_HEADER);
}

describe("fetchMeasurements", () => {
  it("sends X-Demo-Role: EARTH and returns the validated body", async () => {
    const calls: Call[] = [];
    const body = { serverSimNow: SERVER_SIM_NOW, items: [measurementItem()] };
    const result = await fetchMeasurements("sam", earthFetch(body, calls));
    expect(calls[0]?.input).toBe("http://localhost:3000/api/measurements?astronautId=sam");
    expect(roleOf(calls[0])).toBe("EARTH");
    expect(result).toEqual(body);
  });

  it("rejects a body that does not follow the contract", async () => {
    await expect(fetchMeasurements("sam", earthFetch({ items: [] }, []))).rejects.toThrow();
  });

  it("rejects an HTTP error", async () => {
    await expect(fetchMeasurements("sam", earthFetch({}, [], 500))).rejects.toThrow(/HTTP 500/);
  });
});

describe("fetchIncidents", () => {
  it("sends X-Demo-Role: EARTH and returns the validated body", async () => {
    const calls: Call[] = [];
    const body = { serverSimNow: SERVER_SIM_NOW, incidents: [incident("ACTIVE", [shipEvent("INCIDENT_OPENED", 1)])] };
    const result = await fetchIncidents("sam", earthFetch(body, calls));
    expect(calls[0]?.input).toBe("http://localhost:3000/api/incidents?astronautId=sam");
    expect(roleOf(calls[0])).toBe("EARTH");
    expect(result).toEqual(body);
  });

  it("rejects a body that does not follow the contract", async () => {
    const body = { serverSimNow: SERVER_SIM_NOW, incidents: [{ incidentId: "not-a-uuid" }] };
    await expect(fetchIncidents("sam", earthFetch(body, []))).rejects.toThrow();
  });
});

describe("postSyncBatch", () => {
  const built = buildEarthReview(incident("AWAITING_REVIEW", []), "Report received.", CONFIG, new Date("2026-11-15T10:10:00.000Z"), () => "44444444-4444-4444-8444-444444444444");
  if (!built.ok) throw new Error("fixture review must be valid");
  const request: SyncBatchRequest = { items: [{ kind: "INCIDENT_EVENT", payload: built.event }] };

  it("POSTs one INCIDENT_EVENT with X-Demo-Role: EARTH and validates the response", async () => {
    const calls: Call[] = [];
    const body = { serverSimNow: SERVER_SIM_NOW, results: [sentResult(built.event.id, "ACCEPTED")] };
    const result = await postSyncBatch(request, earthFetch(body, calls));

    expect(calls[0]?.input).toBe("http://localhost:3000/api/sync/batch");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(roleOf(calls[0])).toBe("EARTH");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(request);
    expect(result.results[0]?.status).toBe("ACCEPTED");
  });

  it("rejects a response that does not follow the contract", async () => {
    await expect(postSyncBatch(request, earthFetch({ results: "nope" }, []))).rejects.toThrow();
  });

  it("rejects results that describe another item", async () => {
    const body = { serverSimNow: SERVER_SIM_NOW, results: [sentResult("55555555-5555-4555-8555-555555555555", "ACCEPTED")] };
    await expect(postSyncBatch(request, earthFetch(body, []))).rejects.toThrow(/do not match/);
  });

  it("does not send an invalid request", async () => {
    const calls: Call[] = [];
    await expect(postSyncBatch({ items: [] }, earthFetch({}, calls))).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

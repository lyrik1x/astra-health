// Fictitious data for the T-202 tests only. Not imported by the app.
import { createApiFetch, type ApiFetch, type FetchLike } from "../api/client";
import { ShipDb } from "../db/ship-db";

export const T0 = "2026-11-14T16:00:00.000Z";

/** Valid v4-style UUID with a fixed last block, so ordering tests are readable. */
export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
}

/** A valid HEART_RATE measurement with fictitious values. */
export function heartRate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: uuid(1),
    astronautId: "astro-a",
    indicator: "HEART_RATE",
    value: 70,
    unit: "bpm",
    context: "AT_REST",
    origin: "MANUAL",
    capturedAtReal: T0,
    capturedAtSim: T0,
    clockVersion: 1,
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
    ...overrides,
  };
}

export const missionConfigBody = {
  clock: { simEpoch: "2026-01-01T00:00:00.000Z", realEpoch: T0, factor: 60, clockVersion: 2 },
  profile: {
    profile: "MARS_TRANSIT",
    version: 1,
    oneWayDelayMinutesSim: 20,
    delaySource: "SIMULATED",
    description: "Fictitious demo profile",
  },
  serverSimNow: "2026-01-01T00:00:00.000Z",
};

export const crewBody = {
  crew: [
    { id: "astro-a", displayName: "Astronaut A" },
    { id: "astro-b", displayName: "Astronaut B" },
  ],
};

/** A database with a unique name per test. The app always uses the real name via getShipDb(). */
export function newTestDb(): ShipDb {
  return new ShipDb(`astra-health-test-${crypto.randomUUID()}`);
}

/** An ApiFetch whose transport is the given fake. */
export function fakeApi(fetchImpl: FetchLike): ApiFetch {
  return createApiFetch({ baseUrl: "http://api.test", getRole: () => "SHIP", fetchImpl });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

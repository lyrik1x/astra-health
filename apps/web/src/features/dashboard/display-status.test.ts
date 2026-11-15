import { describe, expect, it } from "vitest";
import type { Transmission } from "@astra/contracts";
import type { LocalMissionConfig } from "../../db/schema";
import { displayStatusFor } from "./display-status";

// Fictional clock: factor 60, so 1 real minute = 60 simulated minutes.
const EPOCH = "2026-11-14T00:00:00.000Z";
const config: Pick<LocalMissionConfig, "clock"> = {
  clock: { simEpoch: EPOCH, realEpoch: EPOCH, factor: 60, clockVersion: 1 },
};

// Accepted at simulated 00:00, delivered at simulated 02:00 (= 2 real minutes after the epoch).
const transmission: Transmission = {
  id: "00000000-0000-4000-8000-000000000001",
  direction: "SHIP_TO_EARTH",
  contentKind: "MEASUREMENT",
  contentId: "00000000-0000-4000-8000-000000000002",
  acceptedAtReal: EPOCH,
  acceptedAtSim: EPOCH,
  deliverAt: "2026-11-14T02:00:00.000Z",
  envProfile: "MARS_TRANSIT",
  envVersion: 1,
};

const realAt = (realMs: number) => new Date(Date.parse(EPOCH) + realMs);

describe("displayStatusFor", () => {
  it("shows SAVED_LOCAL and PENDING_SYNC as they are", () => {
    expect(displayStatusFor({ syncState: "SAVED_LOCAL" }, config, realAt(0))).toEqual([{ status: "SAVED_LOCAL" }]);
    expect(displayStatusFor({ syncState: "PENDING_SYNC" }, config, realAt(0))).toEqual([{ status: "PENDING_SYNC" }]);
  });

  it("shows SYNC_ERROR with the code of lastError", () => {
    const record = { syncState: "SYNC_ERROR" as const, lastError: "UUID_CONFLICT: Same id, different content" };
    expect(displayStatusFor(record, config, realAt(0))).toEqual([{ status: "SYNC_ERROR", errorCode: "UUID_CONFLICT" }]);
  });

  it("shows SYNC_ERROR without a code when lastError has no known code", () => {
    expect(displayStatusFor({ syncState: "SYNC_ERROR", lastError: "something odd" }, config, realAt(0))).toEqual([
      { status: "SYNC_ERROR" },
    ]);
    expect(displayStatusFor({ syncState: "SYNC_ERROR" }, config, realAt(0))).toEqual([{ status: "SYNC_ERROR" }]);
  });

  it("CONFIRMED before deliverAt is Confirmed + IN_TRANSIT", () => {
    const badges = displayStatusFor({ syncState: "CONFIRMED", transmission }, config, realAt(2 * 60_000 - 1));
    expect(badges).toEqual([{ status: "CONFIRMED" }, { status: "IN_TRANSIT" }]);
  });

  it("CONFIRMED exactly at deliverAt is Confirmed + DELIVERED", () => {
    const badges = displayStatusFor({ syncState: "CONFIRMED", transmission }, config, realAt(2 * 60_000));
    expect(badges).toEqual([{ status: "CONFIRMED" }, { status: "DELIVERED" }]);
  });

  it("CONFIRMED after deliverAt is Confirmed + DELIVERED", () => {
    const badges = displayStatusFor({ syncState: "CONFIRMED", transmission }, config, realAt(10 * 60_000));
    expect(badges).toEqual([{ status: "CONFIRMED" }, { status: "DELIVERED" }]);
  });

  it("CONFIRMED without local config shows only Confirmed by channel", () => {
    expect(displayStatusFor({ syncState: "CONFIRMED", transmission }, null, realAt(0))).toEqual([{ status: "CONFIRMED" }]);
  });
});

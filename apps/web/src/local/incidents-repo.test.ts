import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionConfigResponseSchema, type IncidentEvent, type IncidentEventWithTransmission } from "@astra/contracts";
import { ShipDb } from "../db/ship-db";
import { MISSION_CONFIG_KEY } from "../db/schema";
import {
  IncidentAlreadyOpenError,
  IncidentNotFoundError,
  IncidentTransitionError,
  MissionConfigMissingError,
  ReviewNotReceivedError,
  cancelIncident,
  closeIncident,
  completeGuideStep,
  getOpenIncident,
  openIncident,
  startGuide,
  submitReport,
  toContractIncidentEvent,
  upsertHydratedIncidentEvent,
} from "./incidents-repo";
import { listOutbox } from "./outbox-repo";
import { T0, missionConfigBody, newTestDb, uuid } from "./test-fixtures";

// T-402 Parte B: incidents on the device, without network (QA-301, QA-302, QA-303, QA-305, QA-307).
// Local clock (fixtures): simEpoch 2026-01-01T00:00, realEpoch T0, factor 60 -> 1 real s = 1 sim min.

/** T0 + n real seconds = sim 2026-01-01T00:00 + n minutes. */
function at(seconds: number): Date {
  return new Date(Date.parse(T0) + seconds * 1000);
}

function simAt(minutes: number): string {
  return new Date(Date.parse("2026-01-01T00:00:00.000Z") + minutes * 60_000).toISOString();
}

let db: ShipDb;
beforeEach(async () => {
  db = newTestDb();
  const { clock, profile } = MissionConfigResponseSchema.parse(missionConfigBody);
  await db.config.put({ key: MISSION_CONFIG_KEY, value: { clock, profile } });
  // No network at all: any fetch fails the test.
  vi.stubGlobal("fetch", () => {
    throw new Error("No network in these tests");
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  db.close();
  await Dexie.delete(db.name);
});

/** A delivered Earth review of the incident, as receiveInbound stores it. */
async function receiveReview(incidentId: string, deliverAt: string): Promise<IncidentEvent> {
  const review: IncidentEvent = {
    id: uuid(900),
    incidentId,
    astronautId: "astro-a",
    actor: "EARTH",
    type: "EARTH_REVIEW",
    createdAtReal: T0,
    createdAtSim: simAt(1),
    clockVersion: 2,
    data: { text: "Fictitious review" },
  };
  const item: IncidentEventWithTransmission = {
    event: review,
    transmission: {
      id: uuid(901),
      direction: "EARTH_TO_SHIP",
      contentKind: "INCIDENT_EVENT",
      contentId: review.id,
      acceptedAtReal: T0,
      acceptedAtSim: simAt(2),
      deliverAt,
      envProfile: "MARS_TRANSIT",
      envVersion: 1,
    },
    transportStatus: "DELIVERED",
  };
  expect(await upsertHydratedIncidentEvent(item, at(0), db)).toBe("ADDED");
  return review;
}

describe("incidents-repo: open and advance offline", () => {
  it("each step saves the event with its outbox entry, consecutive sequence and capture times", async () => {
    const opened = await openIncident("astro-a", at(1), db);
    const { incidentId } = opened;
    await startGuide(incidentId, "astra-guide-1", at(2), db);
    await completeGuideStep(incidentId, "rest", at(3), db);
    const report = await submitReport(incidentId, "Fictitious note", at(4), db);

    expect(opened).toMatchObject({
      type: "INCIDENT_OPENED",
      actor: "SHIP",
      astronautId: "astro-a",
      sequence: 1,
      createdAtReal: at(1).toISOString(),
      createdAtSim: simAt(1),
      clockVersion: 2,
      syncState: "SAVED_LOCAL",
      localOrigin: "CAPTURED",
      savedAtReal: at(1).toISOString(),
    });
    expect(report).toMatchObject({ type: "REPORT_SUBMITTED", sequence: 4, data: { note: "Fictitious note" } });

    const open = await getOpenIncident("astro-a", db);
    expect(open?.state).toBe("AWAITING_REVIEW");
    expect(open?.events.map((event) => event.type)).toEqual([
      "INCIDENT_OPENED",
      "GUIDE_STARTED",
      "GUIDE_STEP_COMPLETED",
      "REPORT_SUBMITTED",
    ]);
    const outbox = await listOutbox(db);
    expect(outbox.map((entry) => entry.id)).toEqual(open?.events.map((event) => event.id));
    expect(outbox.every((entry) => entry.kind === "INCIDENT_EVENT" && entry.attempts === 0)).toBe(true);
  });

  it("recovers the incident after a reload (QA-303)", async () => {
    const { incidentId } = await openIncident("astro-a", at(1), db);
    await startGuide(incidentId, "astra-guide-1", at(2), db);
    db.close();

    const reopened = new ShipDb(db.name);
    try {
      const open = await getOpenIncident("astro-a", reopened);
      expect(open).toMatchObject({ incidentId, astronautId: "astro-a", state: "GUIDED" });
      await submitReport(incidentId, undefined, at(3), reopened);
      expect((await getOpenIncident("astro-a", reopened))?.state).toBe("AWAITING_REVIEW");
    } finally {
      reopened.close();
    }
  });

  it("only the contract payload is kept apart from the local fields", async () => {
    const opened = await openIncident("astro-a", at(1), db);
    const payload = toContractIncidentEvent(opened);
    expect(payload).not.toHaveProperty("syncState");
    expect(payload).not.toHaveProperty("savedAtReal");
    expect(payload).toMatchObject({ id: opened.id, sequence: 1, data: {} });
  });

  it("fails without the local clock and writes nothing", async () => {
    await db.config.clear();
    await expect(openIncident("astro-a", at(1), db)).rejects.toBeInstanceOf(MissionConfigMissingError);
    expect(await db.incidentEvents.count()).toBe(0);
    expect(await listOutbox(db)).toEqual([]);
  });
});

describe("incidents-repo: one unfinished incident and §7.2", () => {
  it("openIncident fails while there is an unfinished incident; works again after it ends", async () => {
    const first = await openIncident("astro-a", at(1), db);
    await expect(openIncident("astro-a", at(2), db)).rejects.toBeInstanceOf(IncidentAlreadyOpenError);
    // Another astronaut is independent.
    await openIncident("astro-b", at(2), db);

    await cancelIncident(first.incidentId, "Opened by mistake", at(3), db);
    expect(await getOpenIncident("astro-a", db)).toBeNull();
    const second = await openIncident("astro-a", at(4), db);
    expect(second.incidentId).not.toBe(first.incidentId);
    expect((await getOpenIncident("astro-a", db))?.incidentId).toBe(second.incidentId);
  });

  it("two simultaneous opens create only one incident", async () => {
    const results = await Promise.allSettled([openIncident("astro-a", at(1), db), openIncident("astro-a", at(1), db)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.incidentEvents.count()).toBe(1);
  });

  it("an invalid transition throws and writes nothing", async () => {
    const { incidentId } = await openIncident("astro-a", at(1), db);
    await expect(completeGuideStep(incidentId, "rest", at(2), db)).rejects.toBeInstanceOf(IncidentTransitionError);
    await expect(closeIncident(incidentId, "CLOSED_WITHOUT_REVIEW", undefined, at(2), db)).rejects.toMatchObject({
      name: "IncidentTransitionError",
      code: "INVALID_TRANSITION",
      state: "ACTIVE",
    });
    await startGuide(incidentId, "astra-guide-1", at(2), db);
    await expect(startGuide(incidentId, "astra-guide-1", at(3), db)).rejects.toBeInstanceOf(IncidentTransitionError);
    expect(await db.incidentEvents.count()).toBe(2);
    expect(await listOutbox(db)).toHaveLength(2);
  });

  it("terminal states accept nothing more", async () => {
    const { incidentId } = await openIncident("astro-a", at(1), db);
    await cancelIncident(incidentId, "Fictitious reason", at(2), db);
    await expect(submitReport(incidentId, undefined, at(3), db)).rejects.toBeInstanceOf(IncidentTransitionError);
    await expect(cancelIncident(incidentId, "Again", at(3), db)).rejects.toBeInstanceOf(IncidentTransitionError);
  });

  it("an unknown incident fails with IncidentNotFoundError", async () => {
    await expect(startGuide(uuid(404), "astra-guide-1", at(1), db)).rejects.toBeInstanceOf(IncidentNotFoundError);
  });

  it("an invalid payload (blank cancel reason) throws and writes nothing", async () => {
    const { incidentId } = await openIncident("astro-a", at(1), db);
    await expect(cancelIncident(incidentId, "   ", at(2), db)).rejects.toThrow();
    expect(await db.incidentEvents.count()).toBe(1);
  });
});

describe("incidents-repo: closing", () => {
  it("CLOSED_WITHOUT_REVIEW from AWAITING_REVIEW ends the incident", async () => {
    const { incidentId } = await openIncident("astro-a", at(1), db);
    await submitReport(incidentId, undefined, at(2), db);
    const closed = await closeIncident(incidentId, "CLOSED_WITHOUT_REVIEW", undefined, at(3), db);
    expect(closed).toMatchObject({ type: "INCIDENT_CLOSED", sequence: 3, data: { closureReason: "CLOSED_WITHOUT_REVIEW" } });
    expect(await getOpenIncident("astro-a", db)).toBeNull();
  });

  it("REVIEWED needs a review received locally and delivered by the closure", async () => {
    const { incidentId } = await openIncident("astro-a", at(1), db);
    await submitReport(incidentId, undefined, at(2), db);

    // Without any review.
    await expect(closeIncident(incidentId, "REVIEWED", uuid(900), at(3), db)).rejects.toBeInstanceOf(ReviewNotReceivedError);
    await expect(closeIncident(incidentId, "REVIEWED", undefined, at(3), db)).rejects.toBeInstanceOf(ReviewNotReceivedError);

    // The review arrives (deliverAt sim 00:05). Earlier closure time -> still refused.
    const review = await receiveReview(incidentId, simAt(5));
    expect((await getOpenIncident("astro-a", db))?.reviews.map((record) => record.id)).toEqual([review.id]);
    await expect(closeIncident(incidentId, "REVIEWED", review.id, at(4), db)).rejects.toBeInstanceOf(ReviewNotReceivedError);
    expect(await db.incidentEvents.where("incidentId").equals(incidentId).count()).toBe(3);

    const closed = await closeIncident(incidentId, "REVIEWED", review.id, at(5), db);
    expect(closed.data).toEqual({ closureReason: "REVIEWED", reviewEventId: review.id });
    expect(await getOpenIncident("astro-a", db)).toBeNull();
  });

  it("a review of another incident is not accepted for REVIEWED", async () => {
    const { incidentId } = await openIncident("astro-a", at(1), db);
    await submitReport(incidentId, undefined, at(2), db);
    const otherReview = await receiveReview(uuid(555), simAt(1));
    await expect(closeIncident(incidentId, "REVIEWED", otherReview.id, at(5), db)).rejects.toBeInstanceOf(
      ReviewNotReceivedError,
    );
  });
});

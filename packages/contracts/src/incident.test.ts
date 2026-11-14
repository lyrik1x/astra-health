import { describe, expect, it } from "vitest";
import { IncidentEventSchema, IncidentStateSchema, MAX_DB_INT } from "./index.js";
import { IDS, events, parses } from "./test-fixtures.js";

const ok = (value: unknown) => parses(IncidentEventSchema, value);

describe("IncidentEventSchema: each type with its data", () => {
  it.each(Object.keys(events))("accepts %s", (name) => {
    expect(ok(events[name as keyof typeof events])).toBe(true);
  });

  it("rejects an unknown type and data of another type", () => {
    expect(ok({ ...events.opened, type: "INCIDENT_PAUSED" })).toBe(false);
    expect(ok({ ...events.opened, data: { stepId: "rest" } })).toBe(false);
    expect(ok({ ...events.guideStarted, data: { stepId: "rest" } })).toBe(false);
  });

  it("rejects unknown keys at the top level and in data", () => {
    expect(ok({ ...events.opened, severity: "HIGH" })).toBe(false);
    expect(ok({ ...events.cancelled, data: { reason: "x", extra: 1 } })).toBe(false);
  });

  it("rejects dates without milliseconds or with another zone", () => {
    expect(ok({ ...events.opened, createdAtReal: "2026-11-14T16:08:43Z" })).toBe(false);
    expect(ok({ ...events.opened, createdAtSim: "2026-11-14T16:08:43.193+00:00" })).toBe(false);
  });
});

describe("IncidentEventSchema: sequence", () => {
  it("rejects a ship event without sequence", () => {
    const { sequence: _omitted, ...withoutSequence } = events.opened;
    expect(ok(withoutSequence)).toBe(false);
  });

  it("rejects EARTH_REVIEW with sequence", () => {
    expect(ok({ ...events.earthReview, sequence: 1 })).toBe(false);
  });

  it("accepts 1..MAX_DB_INT and rejects 0, decimals and MAX_DB_INT + 1 (M-15)", () => {
    expect(ok({ ...events.opened, sequence: MAX_DB_INT })).toBe(true);
    expect(ok({ ...events.opened, sequence: 0 })).toBe(false);
    expect(ok({ ...events.opened, sequence: 1.5 })).toBe(false);
    expect(ok({ ...events.opened, sequence: MAX_DB_INT + 1 })).toBe(false);
  });
});

describe("IncidentEventSchema: actor fixed by type (Q1)", () => {
  it("rejects a ship event with actor EARTH", () => {
    expect(ok({ ...events.closedWithoutReview, actor: "EARTH" })).toBe(false);
  });

  it("rejects EARTH_REVIEW with actor SHIP", () => {
    expect(ok({ ...events.earthReview, actor: "SHIP" })).toBe(false);
  });
});

describe("IncidentEventSchema: INCIDENT_CLOSED (DEC-9)", () => {
  it("rejects REVIEWED without reviewEventId", () => {
    expect(ok({ ...events.closedReviewed, data: { closureReason: "REVIEWED" } })).toBe(false);
  });

  it("rejects CLOSED_WITHOUT_REVIEW with reviewEventId", () => {
    expect(
      ok({
        ...events.closedWithoutReview,
        data: { closureReason: "CLOSED_WITHOUT_REVIEW", reviewEventId: IDS.review },
      }),
    ).toBe(false);
  });

  it("rejects an unknown closureReason and a non-UUID reviewEventId", () => {
    expect(ok({ ...events.closedWithoutReview, data: { closureReason: "TIMEOUT" } })).toBe(false);
    expect(ok({ ...events.closedReviewed, data: { closureReason: "REVIEWED", reviewEventId: "x" } })).toBe(false);
  });
});

describe("IncidentEventSchema: text limits", () => {
  it("REPORT_SUBMITTED: note optional; if present 1-500 non-blank (Q2)", () => {
    expect(ok({ ...events.reportSubmitted, data: {} })).toBe(true);
    expect(ok({ ...events.reportSubmitted, data: { note: "a".repeat(500) } })).toBe(true);
    expect(ok({ ...events.reportSubmitted, data: { note: "" } })).toBe(false);
    expect(ok({ ...events.reportSubmitted, data: { note: "   " } })).toBe(false);
    expect(ok({ ...events.reportSubmitted, data: { note: "a".repeat(501) } })).toBe(false);
  });

  it("GUIDE_STARTED and GUIDE_STEP_COMPLETED: 1-100 non-blank (Q3)", () => {
    expect(ok({ ...events.guideStarted, data: { guideVersion: "a".repeat(100) } })).toBe(true);
    expect(ok({ ...events.guideStarted, data: { guideVersion: "a".repeat(101) } })).toBe(false);
    expect(ok({ ...events.stepCompleted, data: { stepId: " " } })).toBe(false);
  });

  it("INCIDENT_CANCELLED reason 1-200 and EARTH_REVIEW text 1-500, non-blank", () => {
    expect(ok({ ...events.cancelled, data: { reason: "a".repeat(201) } })).toBe(false);
    expect(ok({ ...events.cancelled, data: { reason: "" } })).toBe(false);
    expect(ok({ ...events.earthReview, data: { text: "a".repeat(500) } })).toBe(true);
    expect(ok({ ...events.earthReview, data: { text: "a".repeat(501) } })).toBe(false);
    expect(ok({ ...events.earthReview, data: { text: "\n\t" } })).toBe(false);
  });
});

describe("IncidentStateSchema", () => {
  it("accepts the five persisted states", () => {
    for (const state of ["ACTIVE", "GUIDED", "AWAITING_REVIEW", "CLOSED", "CANCELLED"]) {
      expect(parses(IncidentStateSchema, state)).toBe(true);
    }
  });

  it("rejects a non-persisted state", () => {
    expect(parses(IncidentStateSchema, "NO_ACTIVE_INCIDENT")).toBe(false);
  });
});

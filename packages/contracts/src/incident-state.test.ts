import { describe, expect, it } from "vitest";
import {
  IncidentEventSchema,
  isTerminalIncidentState,
  nextIncidentState,
  projectIncidentState,
  validateNextShipEvent,
  type IncidentEvent,
  type IncidentState,
  type ShipIncidentEventType,
} from "./index.js";
import { IDS, events } from "./test-fixtures.js";

// T-402: state machine of PROJECT_SPEC §7.2 (confirmed by Bruno, 15 nov 2026). Fictitious data.

const SHIP_TYPES: readonly ShipIncidentEventType[] = [
  "INCIDENT_OPENED",
  "GUIDE_STARTED",
  "GUIDE_STEP_COMPLETED",
  "REPORT_SUBMITTED",
  "INCIDENT_CLOSED",
  "INCIDENT_CANCELLED",
];
const STATES: readonly (IncidentState | null)[] = [null, "ACTIVE", "GUIDED", "AWAITING_REVIEW", "CLOSED", "CANCELLED"];

/** The only allowed transitions, written independently of the implementation. */
const ALLOWED: ReadonlyArray<[IncidentState | null, ShipIncidentEventType, IncidentState]> = [
  [null, "INCIDENT_OPENED", "ACTIVE"],
  ["ACTIVE", "GUIDE_STARTED", "GUIDED"],
  ["GUIDED", "GUIDE_STEP_COMPLETED", "GUIDED"],
  ["ACTIVE", "REPORT_SUBMITTED", "AWAITING_REVIEW"],
  ["GUIDED", "REPORT_SUBMITTED", "AWAITING_REVIEW"],
  ["AWAITING_REVIEW", "INCIDENT_CLOSED", "CLOSED"],
  ["ACTIVE", "INCIDENT_CANCELLED", "CANCELLED"],
  ["GUIDED", "INCIDENT_CANCELLED", "CANCELLED"],
  ["AWAITING_REVIEW", "INCIDENT_CANCELLED", "CANCELLED"],
];

const TEMPLATE: Record<ShipIncidentEventType, Record<string, unknown>> = {
  INCIDENT_OPENED: events.opened,
  GUIDE_STARTED: events.guideStarted,
  GUIDE_STEP_COMPLETED: events.stepCompleted,
  REPORT_SUBMITTED: events.reportSubmitted,
  INCIDENT_CLOSED: events.closedWithoutReview,
  INCIDENT_CANCELLED: events.cancelled,
};

function shipEvent(type: ShipIncidentEventType, sequence: number, overrides: Record<string, unknown> = {}): IncidentEvent {
  const id = `33333333-3333-4333-8333-${String(sequence).padStart(12, "0")}`;
  return IncidentEventSchema.parse({ ...TEMPLATE[type], id, sequence, ...overrides });
}

const review: IncidentEvent = IncidentEventSchema.parse(events.earthReview);

/** Accepted ship events that lead to `state` (null = no events). */
function historyTo(state: IncidentState | null): IncidentEvent[] {
  const paths: Record<string, ShipIncidentEventType[]> = {
    none: [],
    ACTIVE: ["INCIDENT_OPENED"],
    GUIDED: ["INCIDENT_OPENED", "GUIDE_STARTED"],
    AWAITING_REVIEW: ["INCIDENT_OPENED", "REPORT_SUBMITTED"],
    CLOSED: ["INCIDENT_OPENED", "REPORT_SUBMITTED", "INCIDENT_CLOSED"],
    CANCELLED: ["INCIDENT_OPENED", "INCIDENT_CANCELLED"],
  };
  return paths[state ?? "none"]!.map((type, index) => shipEvent(type, index + 1));
}

describe("nextIncidentState: PROJECT_SPEC §7.2", () => {
  const cases = STATES.flatMap((from) => SHIP_TYPES.map((type) => [from, type] as const));

  it.each(cases)("from %s with %s", (from, type) => {
    const allowed = ALLOWED.find(([f, t]) => f === from && t === type);
    expect(nextIncidentState(from, type)).toBe(allowed === undefined ? null : allowed[2]);
  });

  it("the three doubtful cases are NOT allowed (Bruno, 15 nov)", () => {
    expect(nextIncidentState("GUIDED", "GUIDE_STARTED")).toBeNull();
    expect(nextIncidentState("ACTIVE", "GUIDE_STEP_COMPLETED")).toBeNull();
    expect(nextIncidentState("ACTIVE", "INCIDENT_CLOSED")).toBeNull();
    expect(nextIncidentState("GUIDED", "INCIDENT_CLOSED")).toBeNull();
  });

  it("CLOSED and CANCELLED are terminal and accept nothing", () => {
    expect(isTerminalIncidentState("CLOSED")).toBe(true);
    expect(isTerminalIncidentState("CANCELLED")).toBe(true);
    for (const state of ["ACTIVE", "GUIDED", "AWAITING_REVIEW"] as const) {
      expect(isTerminalIncidentState(state)).toBe(false);
    }
    for (const type of SHIP_TYPES) {
      expect(nextIncidentState("CLOSED", type)).toBeNull();
      expect(nextIncidentState("CANCELLED", type)).toBeNull();
    }
  });
});

describe("projectIncidentState", () => {
  it("returns null without INCIDENT_OPENED", () => {
    expect(projectIncidentState([])).toBeNull();
    expect(projectIncidentState([review])).toBeNull();
  });

  it("projects the full path and ignores EARTH_REVIEW", () => {
    const opened = shipEvent("INCIDENT_OPENED", 1);
    const guide = shipEvent("GUIDE_STARTED", 2);
    const step = shipEvent("GUIDE_STEP_COMPLETED", 3);
    const report = shipEvent("REPORT_SUBMITTED", 4);
    const closed = shipEvent("INCIDENT_CLOSED", 5);
    expect(projectIncidentState([opened])).toBe("ACTIVE");
    expect(projectIncidentState([opened, guide, step])).toBe("GUIDED");
    expect(projectIncidentState([opened, guide, step, report, review])).toBe("AWAITING_REVIEW");
    expect(projectIncidentState([opened, guide, step, report, review, closed])).toBe("CLOSED");
    // A late review after the terminal state does not change it.
    const cancelled = shipEvent("INCIDENT_CANCELLED", 3);
    expect(projectIncidentState([opened, shipEvent("REPORT_SUBMITTED", 2), cancelled, review])).toBe("CANCELLED");
  });

  it("applies the events by sequence, whatever the input order", () => {
    const list = [shipEvent("REPORT_SUBMITTED", 3), shipEvent("INCIDENT_OPENED", 1), shipEvent("GUIDE_STARTED", 2)];
    expect(projectIncidentState(list)).toBe("AWAITING_REVIEW");
  });

  it("throws on a history that breaks §7.2 (corrupted data is not hidden)", () => {
    expect(() => projectIncidentState([shipEvent("INCIDENT_OPENED", 1), shipEvent("INCIDENT_CLOSED", 2)])).toThrow();
  });
});

describe("validateNextShipEvent", () => {
  it.each(ALLOWED)("accepts %s + %s", (from, type) => {
    const previous = historyTo(from);
    expect(validateNextShipEvent(previous, shipEvent(type, previous.length + 1))).toEqual({ ok: true });
  });

  const invalid = STATES.flatMap((from) =>
    SHIP_TYPES.filter((type) => !ALLOWED.some(([f, t]) => f === from && t === type)).map((type) => [from, type] as const),
  );

  it.each(invalid)("rejects %s + %s with INVALID_TRANSITION", (from, type) => {
    const previous = historyTo(from);
    expect(validateNextShipEvent(previous, shipEvent(type, previous.length + 1))).toEqual({
      ok: false,
      code: "INVALID_TRANSITION",
    });
  });

  it("rejects a sequence with a gap with SEQUENCE_GAP (checked before the transition)", () => {
    expect(validateNextShipEvent([], shipEvent("INCIDENT_OPENED", 2))).toEqual({ ok: false, code: "SEQUENCE_GAP" });
    const previous = historyTo("ACTIVE");
    expect(validateNextShipEvent(previous, shipEvent("GUIDE_STARTED", 3))).toEqual({ ok: false, code: "SEQUENCE_GAP" });
    // Even an invalid transition reports the gap first.
    expect(validateNextShipEvent(previous, shipEvent("INCIDENT_CLOSED", 5))).toEqual({ ok: false, code: "SEQUENCE_GAP" });
  });

  it("rejects a sequence already used by the chain", () => {
    const previous = historyTo("GUIDED");
    expect(validateNextShipEvent(previous, shipEvent("GUIDE_STEP_COMPLETED", 2))).toEqual({
      ok: false,
      code: "INVALID_TRANSITION",
    });
  });

  it("ignores EARTH_REVIEW among the previous events and rejects it as `next`", () => {
    const previous = [...historyTo("AWAITING_REVIEW"), review];
    expect(validateNextShipEvent(previous, shipEvent("INCIDENT_CLOSED", 3))).toEqual({ ok: true });
    expect(validateNextShipEvent(previous, review)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });

  it("rejects an event of another incident or astronaut", () => {
    const previous = historyTo("ACTIVE");
    const otherIncident = shipEvent("GUIDE_STARTED", 2, { incidentId: IDS.event });
    const otherAstronaut = shipEvent("GUIDE_STARTED", 2, { astronautId: "alex" });
    expect(validateNextShipEvent(previous, otherIncident)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(validateNextShipEvent(previous, otherAstronaut)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});

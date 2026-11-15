import { describe, expect, it } from "vitest";
import { IncidentEventSchema, computeSimNow, type IncidentState } from "@astra/contracts";
import { buildEarthReview, canReview } from "./earth-review";
import { ASTRONAUT_ID, CONFIG, INCIDENT_ID, incident } from "./test-fixtures";

const REVIEW_ID = "22222222-2222-4222-8222-222222222222";
const REAL_NOW = new Date("2026-11-15T10:10:00.000Z");
const target = incident("AWAITING_REVIEW", []);

function build(text: string) {
  return buildEarthReview(target, text, CONFIG, REAL_NOW, () => REVIEW_ID);
}

describe("buildEarthReview", () => {
  it("builds an EARTH_REVIEW that passes IncidentEventSchema", () => {
    const result = build("Report received.");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(IncidentEventSchema.safeParse(result.event).success).toBe(true);
    expect(result.event).toEqual({
      id: REVIEW_ID,
      incidentId: INCIDENT_ID,
      astronautId: ASTRONAUT_ID,
      actor: "EARTH",
      type: "EARTH_REVIEW",
      createdAtReal: REAL_NOW.toISOString(),
      createdAtSim: computeSimNow(CONFIG.clock, REAL_NOW),
      clockVersion: CONFIG.clock.clockVersion,
      data: { text: "Report received." },
    });
  });

  it("has no sequence", () => {
    const result = build("Report received.");
    expect(result.ok && "sequence" in result.event).toBe(false);
  });

  it("takes createdAtSim from computeSimNow with the mission clock", () => {
    const result = build("Report received.");
    expect(result.ok && result.event.createdAtSim).toBe("2031-03-01T10:00:00.000Z");
    expect(result.ok && result.event.createdAtSim).toBe(computeSimNow(CONFIG.clock, REAL_NOW));
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["501 characters", "a".repeat(501)],
  ])("rejects a %s text", (_label, text) => {
    expect(build(text)).toEqual({ ok: false, reason: "TEXT_LENGTH" });
  });

  it("accepts exactly 500 characters", () => {
    expect(build("a".repeat(500)).ok).toBe(true);
  });
});

describe("canReview", () => {
  it.each<[IncidentState | null, boolean]>([
    ["AWAITING_REVIEW", true],
    ["ACTIVE", false],
    ["GUIDED", false],
    ["CLOSED", false],
    ["CANCELLED", false],
    [null, false],
  ])("%s -> %s", (state, expected) => {
    expect(canReview({ state })).toBe(expected);
  });
});

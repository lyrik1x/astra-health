import { describe, expect, it } from "vitest";
import {
  IncidentAlreadyOpenError,
  IncidentNotFoundError,
  IncidentTransitionError,
  MissionConfigMissingError,
  ReviewNotReceivedError,
} from "../../local/incidents-repo";
import { en } from "../../i18n/en";
import { incidentErrorKey } from "./incident-errors";
import { checkCancelReason, checkReportNote } from "./incident-form";

describe("incidentErrorKey", () => {
  it("gives a neutral message for each typed error", () => {
    expect(incidentErrorKey(new MissionConfigMissingError())).toBe("pages.incident.errors.missionConfigMissing");
    expect(incidentErrorKey(new IncidentAlreadyOpenError("a", "i"))).toBe("pages.incident.errors.alreadyOpen");
    expect(incidentErrorKey(new IncidentNotFoundError("i"))).toBe("pages.incident.errors.notFound");
    expect(incidentErrorKey(new IncidentTransitionError("INVALID_TRANSITION", "ACTIVE"))).toBe(
      "pages.incident.errors.transition",
    );
    expect(incidentErrorKey(new ReviewNotReceivedError("r"))).toBe("pages.incident.errors.reviewNotReceived");
    expect(incidentErrorKey(new Error("other"))).toBe("pages.incident.errors.saveFailed");
  });

  it("uses the agreed texts for missing config and a review not received yet", () => {
    expect(en.pages.incident.errors.missionConfigMissing).toBe("Connect once to download mission data");
    expect(en.pages.incident.errors.reviewNotReceived).toBe(
      "The Earth review has not arrived on this device yet. Try again in a moment.",
    );
  });
});

describe("incident form checks", () => {
  it("the report note is optional, up to 500 characters", () => {
    expect(checkReportNote("")).toEqual({ ok: true, value: undefined });
    expect(checkReportNote("   ")).toEqual({ ok: true, value: undefined });
    expect(checkReportNote(" Fictional test note ")).toEqual({ ok: true, value: "Fictional test note" });
    expect(checkReportNote("x".repeat(500)).ok).toBe(true);
    expect(checkReportNote("x".repeat(501)).ok).toBe(false);
  });

  it("the cancel reason needs 1 to 200 characters", () => {
    expect(checkCancelReason("").ok).toBe(false);
    expect(checkCancelReason("  ").ok).toBe(false);
    expect(checkCancelReason("x").ok).toBe(true);
    expect(checkCancelReason("x".repeat(200)).ok).toBe(true);
    expect(checkCancelReason("x".repeat(201)).ok).toBe(false);
    expect(checkCancelReason(" Opened by mistake ")).toEqual({ ok: true, value: "Opened by mistake" });
  });
});

import { describe, expect, it } from "vitest";
import type { LocalIncidentEventRecord } from "../../db/schema";
import { availableActions, completedStepIds, latestReviewId } from "./available-actions";

// Only the fields these pure functions read; the rest of the record does not matter here.
const review = (id: string) => ({ id, type: "EARTH_REVIEW" }) as LocalIncidentEventRecord;
const stepDone = (stepId: string) => ({ type: "GUIDE_STEP_COMPLETED", data: { stepId } }) as LocalIncidentEventRecord;

describe("availableActions", () => {
  it("without an incident only offers Start incident", () => {
    expect(availableActions(null)).toEqual(["start"]);
  });

  it("ACTIVE offers Open guide, Send report to Earth and Cancel incident", () => {
    expect(availableActions({ state: "ACTIVE", reviews: [] })).toEqual(["openGuide", "sendReport", "cancel"]);
  });

  it("GUIDED offers the guide steps, Send report to Earth and Cancel incident", () => {
    expect(availableActions({ state: "GUIDED", reviews: [] })).toEqual(["markStep", "sendReport", "cancel"]);
  });

  it("AWAITING_REVIEW without reviews does not offer Close incident (reviewed)", () => {
    expect(availableActions({ state: "AWAITING_REVIEW", reviews: [] })).toEqual([
      "waitingNotice",
      "closeWithoutReview",
      "cancel",
    ]);
  });

  it("AWAITING_REVIEW with at least one review offers Close incident (reviewed)", () => {
    expect(availableActions({ state: "AWAITING_REVIEW", reviews: [review("r1")] })).toEqual([
      "waitingNotice",
      "closeReviewed",
      "closeWithoutReview",
      "cancel",
    ]);
  });

  it("never offers an action for a finished incident", () => {
    expect(availableActions({ state: "CLOSED", reviews: [] })).toEqual([]);
    expect(availableActions({ state: "CANCELLED", reviews: [] })).toEqual([]);
  });

  it("never sends a report by itself: sendReport is only an offered button", () => {
    for (const state of ["ACTIVE", "GUIDED"] as const) {
      expect(availableActions({ state, reviews: [] })).toContain("sendReport");
    }
    expect(availableActions(null)).not.toContain("sendReport");
  });
});

describe("completedStepIds", () => {
  it("collects the steps marked as done", () => {
    const events = [
      { type: "INCIDENT_OPENED", data: {} } as LocalIncidentEventRecord,
      { type: "GUIDE_STARTED", data: { guideVersion: "astra-guide-1" } } as LocalIncidentEventRecord,
      stepDone("rest"),
    ];
    expect([...completedStepIds(events)]).toEqual(["rest"]);
  });
});

describe("latestReviewId", () => {
  it("is the most recent review received (the last one, by acceptance)", () => {
    expect(latestReviewId({ reviews: [review("r1"), review("r2")] })).toBe("r2");
  });

  it("is undefined without reviews", () => {
    expect(latestReviewId({ reviews: [] })).toBeUndefined();
  });
});

import type { LocalIncident } from "../../local/incidents-repo";

/** What the incident screen can show. The astronaut always decides (PROJECT_SPEC §7.3). */
export type IncidentAction =
  | "start"
  | "openGuide"
  | "markStep"
  | "sendReport"
  | "waitingNotice"
  | "closeReviewed"
  | "closeWithoutReview"
  | "cancel";

/** Pure: the actions for the current incident (T-403 §4.2). `null` = no unfinished incident. */
export function availableActions(incident: Pick<LocalIncident, "state" | "reviews"> | null): IncidentAction[] {
  if (incident === null) return ["start"];
  switch (incident.state) {
    case "ACTIVE":
      return ["openGuide", "sendReport", "cancel"];
    case "GUIDED":
      return ["markStep", "sendReport", "cancel"];
    case "AWAITING_REVIEW":
      return incident.reviews.length > 0
        ? ["waitingNotice", "closeReviewed", "closeWithoutReview", "cancel"]
        : ["waitingNotice", "closeWithoutReview", "cancel"];
    case "CLOSED":
    case "CANCELLED":
      // getOpenIncident never returns a finished incident; nothing to do with one.
      return [];
  }
}

/** Pure: the guide steps already marked as done in this incident. */
export function completedStepIds(events: LocalIncident["events"]): Set<string> {
  const done = new Set<string>();
  for (const event of events) {
    if (event.type === "GUIDE_STEP_COMPLETED") done.add(event.data.stepId);
  }
  return done;
}

/** Pure: the most recent Earth review received (reviews come ordered by acceptance), or undefined. */
export function latestReviewId(incident: Pick<LocalIncident, "reviews">): string | undefined {
  return incident.reviews[incident.reviews.length - 1]?.id;
}

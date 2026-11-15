import {
  IncidentEventSchema,
  computeSimNow,
  type EarthReviewEvent,
  type MissionConfigResponse,
  type ProjectedIncident,
} from "@astra/contracts";

/** Earth can only review while the state visible to Earth is AWAITING_REVIEW (ARCHITECTURE §9.1). */
export function canReview(incident: Pick<ProjectedIncident, "state">): boolean {
  return incident.state === "AWAITING_REVIEW";
}

export type BuildEarthReviewResult = { ok: true; event: EarthReviewEvent } | { ok: false; reason: "TEXT_LENGTH" };

/**
 * Builds the EARTH_REVIEW event (T-005 §2.5): actor EARTH, no `sequence`, times from the mission
 * clock of GET /api/mission/config. The text is kept as written; 1-500 non-blank characters is a
 * format limit, not clinical. The result is validated with the shared IncidentEventSchema.
 */
export function buildEarthReview(
  incident: Pick<ProjectedIncident, "incidentId" | "astronautId">,
  text: string,
  config: Pick<MissionConfigResponse, "clock">,
  realNow: Date,
  newId: () => string,
): BuildEarthReviewResult {
  const parsed = IncidentEventSchema.safeParse({
    id: newId(),
    incidentId: incident.incidentId,
    astronautId: incident.astronautId,
    actor: "EARTH",
    type: "EARTH_REVIEW",
    createdAtReal: realNow.toISOString(),
    createdAtSim: computeSimNow(config.clock, realNow),
    clockVersion: config.clock.clockVersion,
    data: { text },
  });
  if (!parsed.success || parsed.data.type !== "EARTH_REVIEW") {
    return { ok: false, reason: "TEXT_LENGTH" };
  }
  return { ok: true, event: parsed.data };
}

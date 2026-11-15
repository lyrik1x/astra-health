import {
  IncidentAlreadyOpenError,
  IncidentNotFoundError,
  IncidentTransitionError,
  MissionConfigMissingError,
  ReviewNotReceivedError,
} from "../../local/incidents-repo";

/** Pure: a neutral message key for each typed error of the incident repository (T-403 §4.5). */
export function incidentErrorKey(error: unknown): string {
  if (error instanceof MissionConfigMissingError) return "pages.incident.errors.missionConfigMissing";
  if (error instanceof IncidentAlreadyOpenError) return "pages.incident.errors.alreadyOpen";
  if (error instanceof IncidentNotFoundError) return "pages.incident.errors.notFound";
  if (error instanceof IncidentTransitionError) return "pages.incident.errors.transition";
  if (error instanceof ReviewNotReceivedError) return "pages.incident.errors.reviewNotReceived";
  return "pages.incident.errors.saveFailed";
}

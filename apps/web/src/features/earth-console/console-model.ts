import type {
  EarthReviewEvent,
  IncidentEvent,
  IncidentEventWithTransmission,
  MeasurementWithTransmission,
  ProjectedIncident,
  TransportStatus,
} from "@astra/contracts";

/**
 * Newest first by the ORIGINAL `capturedAtSim`; ties by `deliverAt` (newest first), then by id.
 * Returns a new array; the input is not changed.
 */
export function sortMeasurements(items: readonly MeasurementWithTransmission[]): MeasurementWithTransmission[] {
  return [...items].sort((a, b) => {
    const byCapture = Date.parse(b.measurement.capturedAtSim) - Date.parse(a.measurement.capturedAtSim);
    if (byCapture !== 0) return byCapture;
    const byDelivery = Date.parse(b.transmission.deliverAt) - Date.parse(a.transmission.deliverAt);
    if (byDelivery !== 0) return byDelivery;
    if (a.measurement.id === b.measurement.id) return 0;
    return a.measurement.id < b.measurement.id ? -1 : 1;
  });
}

/** The delivered REPORT_SUBMITTED of the incident (the alert), or `undefined`. */
export function deliveredReport(incident: ProjectedIncident): IncidentEventWithTransmission | undefined {
  return incident.events.find((item) => item.event.type === "REPORT_SUBMITTED" && item.transportStatus === "DELIVERED");
}

export interface OwnReview {
  event: EarthReviewEvent;
  transportStatus: TransportStatus;
}

/** Earth's own reviews of the incident, with their transport state (IN_TRANSIT or DELIVERED). */
export function ownReviews(incident: ProjectedIncident): OwnReview[] {
  const reviews: OwnReview[] = [];
  for (const item of incident.events) {
    if (item.event.type === "EARTH_REVIEW") {
      reviews.push({ event: item.event, transportStatus: item.transportStatus });
    }
  }
  return reviews;
}

function sequenceOf(item: IncidentEventWithTransmission): number {
  return item.event.type === "EARTH_REVIEW" ? 0 : item.event.sequence;
}

/** Ship events visible to Earth (the API only returns delivered ones), in `sequence` order. */
export function shipEvents(incident: ProjectedIncident): IncidentEventWithTransmission[] {
  return incident.events.filter((item) => item.event.type !== "EARTH_REVIEW").sort((a, b) => sequenceOf(a) - sequenceOf(b));
}

/** The note of a REPORT_SUBMITTED, as the ship wrote it; `undefined` for other events or without a note. */
export function reportNote(event: IncidentEvent): string | undefined {
  return event.type === "REPORT_SUBMITTED" ? event.data.note : undefined;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Simulated time as `YYYY-MM-DD HH:mm UTC`. */
export function formatSimTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/** Value as recorded: blood pressure as `systolic/diastolic`, the rest as the number. */
export function formatMeasurementValue(measurement: MeasurementWithTransmission["measurement"]): string {
  if (measurement.indicator === "BLOOD_PRESSURE") {
    return `${measurement.value.systolic}/${measurement.value.diastolic}`;
  }
  return String(measurement.value);
}

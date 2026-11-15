import type {
  IncidentEvent,
  IncidentEventWithTransmission,
  Measurement,
  MeasurementWithTransmission,
  MissionConfigResponse,
  ProjectedIncident,
  SyncItemResult,
  Transmission,
  TransportStatus,
} from "@astra/contracts";

// Fictional data for the Earth console tests. Not real people, not clinical values.

export const INCIDENT_ID = "11111111-1111-4111-8111-111111111111";
export const ASTRONAUT_ID = "sam";

export const CONFIG: Pick<MissionConfigResponse, "clock"> = {
  clock: {
    simEpoch: "2031-03-01T00:00:00.000Z",
    realEpoch: "2026-11-15T10:00:00.000Z",
    factor: 60,
    clockVersion: 2,
  },
};

let counter = 0;
/** Valid, unique UUIDs for tests. */
export function uuid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

export function transmissionFor(
  contentKind: Transmission["contentKind"],
  contentId: string,
  direction: Transmission["direction"],
  deliverAt = "2031-03-01T00:05:00.000Z",
): Transmission {
  return {
    id: uuid(),
    direction,
    contentKind,
    contentId,
    acceptedAtReal: "2026-11-15T10:01:00.000Z",
    acceptedAtSim: "2031-03-01T00:01:00.000Z",
    deliverAt,
    envProfile: "MARS_TRANSIT",
    envVersion: 2,
  };
}

export function measurementItem(overrides: Partial<Measurement> = {}, deliverAt?: string): MeasurementWithTransmission {
  const measurement = {
    id: uuid(),
    astronautId: ASTRONAUT_ID,
    indicator: "HEART_RATE",
    value: 70,
    unit: "bpm",
    context: "AT_REST",
    origin: "MANUAL",
    capturedAtReal: "2026-11-15T10:00:30.000Z",
    capturedAtSim: "2031-03-01T00:00:30.000Z",
    clockVersion: 2,
    envProfile: "MARS_TRANSIT",
    envVersion: 2,
    ...overrides,
  } as Measurement;
  return {
    measurement,
    transmission: transmissionFor("MEASUREMENT", measurement.id, "SHIP_TO_EARTH", deliverAt),
    transportStatus: "DELIVERED",
  };
}

export function shipEvent(
  type: "INCIDENT_OPENED" | "REPORT_SUBMITTED",
  sequence: number,
  transportStatus: TransportStatus = "DELIVERED",
): IncidentEventWithTransmission {
  const event: IncidentEvent = {
    id: uuid(),
    incidentId: INCIDENT_ID,
    astronautId: ASTRONAUT_ID,
    actor: "SHIP",
    type,
    sequence,
    createdAtReal: "2026-11-15T10:00:40.000Z",
    createdAtSim: `2031-03-01T00:0${sequence}:00.000Z`,
    clockVersion: 2,
    data: {},
  };
  return { event, transmission: transmissionFor("INCIDENT_EVENT", event.id, "SHIP_TO_EARTH"), transportStatus };
}

export function reviewEvent(transportStatus: TransportStatus): IncidentEventWithTransmission {
  const event: IncidentEvent = {
    id: uuid(),
    incidentId: INCIDENT_ID,
    astronautId: ASTRONAUT_ID,
    actor: "EARTH",
    type: "EARTH_REVIEW",
    createdAtReal: "2026-11-15T10:06:00.000Z",
    createdAtSim: "2031-03-01T00:06:00.000Z",
    clockVersion: 2,
    data: { text: "Report received." },
  };
  return { event, transmission: transmissionFor("INCIDENT_EVENT", event.id, "EARTH_TO_SHIP"), transportStatus };
}

export function incident(state: ProjectedIncident["state"], events: IncidentEventWithTransmission[]): ProjectedIncident {
  return { incidentId: INCIDENT_ID, astronautId: ASTRONAUT_ID, state, events };
}

export function sentResult(id: string, status: "ACCEPTED" | "DUPLICATE"): SyncItemResult {
  return status === "ACCEPTED"
    ? { id, kind: "INCIDENT_EVENT", status, code: 201, retryable: false, transmission: transmissionFor("INCIDENT_EVENT", id, "EARTH_TO_SHIP") }
    : { id, kind: "INCIDENT_EVENT", status, code: 200, retryable: false, transmission: transmissionFor("INCIDENT_EVENT", id, "EARTH_TO_SHIP") };
}

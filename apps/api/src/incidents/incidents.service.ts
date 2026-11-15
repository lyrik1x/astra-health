import { Injectable } from "@nestjs/common";
import {
  IncidentsResponseSchema,
  isShipIncidentEvent,
  projectIncidentState,
  type DemoRole,
  type IncidentEvent,
  type IncidentEventWithTransmission,
  type IncidentsResponse,
  type ProjectedIncident,
  type ShipIncidentEvent,
} from "@astra/contracts";
import { toTransmission, transportStatusAt } from "../measurements/measurements.service.js";
import { MissionClockService } from "../missions/mission-clock.service.js";
import { IncidentsRepository, toIncidentEvent } from "./incidents.repository.js";

type ShipItem = IncidentEventWithTransmission & { event: ShipIncidentEvent };

function bySequence(a: ShipItem, b: ShipItem): number {
  return a.event.sequence - b.event.sequence;
}

/** Reviews have no sequence: ordered by their transmission (ARCHITECTURE §9.1), then by id. */
function byAcceptance(a: IncidentEventWithTransmission, b: IncidentEventWithTransmission): number {
  const diff = Date.parse(a.transmission.acceptedAtSim) - Date.parse(b.transmission.acceptedAtSim);
  if (diff !== 0) return diff;
  return a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0;
}

/**
 * SHIP: every ship event. EARTH: the CONTIGUOUS prefix of delivered ship events by sequence,
 * stopping at the first one not delivered yet (ARCHITECTURE §9.1).
 */
function visibleShipItems(items: ShipItem[], role: DemoRole): ShipItem[] {
  const sorted = [...items].sort(bySequence);
  if (role === "SHIP") return sorted;
  const prefix: ShipItem[] = [];
  for (const item of sorted) {
    if (item.event.sequence !== prefix.length + 1 || item.transportStatus !== "DELIVERED") break;
    prefix.push(item);
  }
  return prefix;
}

/** SHIP: only delivered reviews. EARTH: all its own reviews, with their transport status. */
function visibleReviews(items: IncidentEventWithTransmission[], role: DemoRole): IncidentEventWithTransmission[] {
  const visible = role === "SHIP" ? items.filter((item) => item.transportStatus === "DELIVERED") : items;
  return [...visible].sort(byAcceptance);
}

@Injectable()
export class IncidentsService {
  constructor(
    private readonly repository: IncidentsRepository,
    private readonly clock: MissionClockService,
  ) {}

  /** GET /api/incidents?astronautId= with the visibility of the querying role, filtered here. */
  async listForRole(astronautId: string, role: DemoRole): Promise<IncidentsResponse> {
    const serverSimNow = await this.clock.getServerSimNow();
    const rows = await this.repository.findByAstronaut(astronautId);

    const byIncident = new Map<string, IncidentEventWithTransmission[]>();
    for (const row of rows) {
      const event: IncidentEvent = toIncidentEvent(row);
      const transmission = toTransmission(row.transmission);
      const list = byIncident.get(event.incidentId) ?? [];
      list.push({ event, transmission, transportStatus: transportStatusAt(transmission.deliverAt, serverSimNow) });
      byIncident.set(event.incidentId, list);
    }

    const incidents: ProjectedIncident[] = [];
    for (const [incidentId, items] of byIncident) {
      const shipItems = visibleShipItems(items.filter((item): item is ShipItem => isShipIncidentEvent(item.event)), role);
      const reviews = visibleReviews(items.filter((item) => !isShipIncidentEvent(item.event)), role);
      const events = [...shipItems, ...reviews];
      // Earth does not learn that an incident exists until it sees one of its events.
      if (events.length === 0) continue;
      incidents.push({
        incidentId,
        astronautId,
        state: projectIncidentState(shipItems.map((item) => item.event)),
        events,
      });
    }
    incidents.sort(byFirstEvent);
    return IncidentsResponseSchema.parse({ serverSimNow, incidents });
  }
}

/** Incidents by the createdAtSim of their first visible event, then by incidentId. */
function byFirstEvent(a: ProjectedIncident, b: ProjectedIncident): number {
  const diff = Date.parse(a.events[0]!.event.createdAtSim) - Date.parse(b.events[0]!.event.createdAtSim);
  if (diff !== 0) return diff;
  return a.incidentId < b.incidentId ? -1 : a.incidentId > b.incidentId ? 1 : 0;
}

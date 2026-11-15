import { Injectable } from "@nestjs/common";
import { IncidentEventSchema, type Direction, type IncidentEvent } from "@astra/contracts";
import { canonicalJson } from "../common/canonical-json.js";
import type { IncidentEvent as IncidentEventRow, Transmission as TransmissionRow } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Server-assigned fields of the transmission of an incident event (T-005 §2.7). */
export interface NewIncidentTransmissionData {
  id: string;
  direction: Direction;
  contentKind: "INCIDENT_EVENT";
  acceptedAtReal: Date;
  acceptedAtSim: Date;
  deliverAt: Date;
  envProfile: string;
  envVersion: number;
}

export type IncidentEventRowWithTransmission = IncidentEventRow & { transmission: TransmissionRow };

/** S1: the stored canonical payload is the source of truth, rebuilt with IncidentEventSchema. */
export function toIncidentEvent(row: IncidentEventRow): IncidentEvent {
  return IncidentEventSchema.parse(JSON.parse(row.payloadCanonical));
}

/** Prisma access for incident events (append-only: nothing here updates or deletes). */
@Injectable()
export class IncidentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The stored event with its transmission, or null (UUID check and `reviewEventId`). */
  findByIdWithTransmission(id: string): Promise<IncidentEventRowWithTransmission | null> {
    return this.prisma.incidentEvent.findUnique({ where: { id }, include: { transmission: true } });
  }

  /** The ship event that holds (incidentId, sequence), or null. */
  findBySequence(incidentId: string, sequence: number): Promise<IncidentEventRow | null> {
    return this.prisma.incidentEvent.findFirst({ where: { incidentId, sequence } });
  }

  /** Any stored event of the incident (to know its owner), or null if the incident is new. */
  findAnyOfIncident(incidentId: string): Promise<IncidentEventRow | null> {
    return this.prisma.incidentEvent.findFirst({ where: { incidentId } });
  }

  /** Accepted events of one incident with their transmissions, ship events by sequence. */
  findByIncident(incidentId: string): Promise<IncidentEventRowWithTransmission[]> {
    return this.prisma.incidentEvent.findMany({
      where: { incidentId },
      include: { transmission: true },
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
    });
  }

  /** Ship events of the astronaut (all incidents), to find an unfinished incident. */
  findShipEventsOfAstronaut(astronautId: string): Promise<IncidentEventRow[]> {
    return this.prisma.incidentEvent.findMany({
      where: { astronautId, actor: "SHIP" },
      orderBy: [{ incidentId: "asc" }, { sequence: "asc" }],
    });
  }

  /** Every event of the astronaut with its transmission (GET /api/incidents filters by role). */
  findByAstronaut(astronautId: string): Promise<IncidentEventRowWithTransmission[]> {
    return this.prisma.incidentEvent.findMany({
      where: { astronautId },
      include: { transmission: true },
      orderBy: [{ incidentId: "asc" }, { sequence: "asc" }, { id: "asc" }],
    });
  }

  /**
   * Creates the event and its transmission in ONE nested Prisma write (atomic, as measurements).
   * The client times and `sequence` are stored as received.
   */
  createWithTransmission(
    event: IncidentEvent,
    transmission: NewIncidentTransmissionData,
  ): Promise<IncidentEventRowWithTransmission> {
    return this.prisma.incidentEvent.create({
      data: {
        id: event.id,
        incidentId: event.incidentId,
        type: event.type,
        actor: event.actor,
        sequence: event.type === "EARTH_REVIEW" ? null : event.sequence,
        createdAtReal: new Date(event.createdAtReal),
        createdAtSim: new Date(event.createdAtSim),
        payloadCanonical: canonicalJson(event),
        astronaut: { connect: { id: event.astronautId } },
        transmission: { create: { ...transmission, contentId: event.id } },
      },
      include: { transmission: true },
    });
  }
}

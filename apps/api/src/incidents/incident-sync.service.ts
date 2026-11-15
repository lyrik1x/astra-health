import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  isShipIncidentEvent,
  isTerminalIncidentState,
  projectIncidentState,
  validateNextShipEvent,
  type EarthReviewEvent,
  type IncidentEvent,
  type ShipIncidentEvent,
  type SyncItemResult,
} from "@astra/contracts";
import { canonicalJson } from "../common/canonical-json.js";
import {
  accepted,
  conflict,
  deliverAtFor,
  duplicate,
  invalid,
  isUniqueViolation,
  type BatchContext,
  type ItemRef,
} from "../communications/sync-results.js";
import { toTransmission } from "../measurements/measurements.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { IncidentsRepository, toIncidentEvent } from "./incidents.repository.js";

/**
 * POST /api/sync/batch with INCIDENT_EVENT, steps 3 to 8 of T-402 §4 (ARCHITECTURE §9.1,
 * T-005 §5.2). Steps 1 (schema) and 2 (role) already ran in SyncService.
 * A rejected event is never stored and never changes the projection.
 */
@Injectable()
export class IncidentSyncService {
  constructor(
    private readonly repository: IncidentsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async process(event: IncidentEvent, context: BatchContext): Promise<SyncItemResult> {
    const ref: ItemRef = { id: event.id, kind: "INCIDENT_EVENT" };

    // 3. UUID.
    const existing = await this.checkExistingUuid(event);
    if (existing !== null) return existing;

    // 4. Astronaut and ownership of the incident.
    const astronaut = await this.prisma.astronaut.findUnique({ where: { id: event.astronautId } });
    if (astronaut === null) {
      return invalid(ref, "UNKNOWN_ASTRONAUT", "Unknown astronaut");
    }
    const anyOfIncident = await this.repository.findAnyOfIncident(event.incidentId);
    if (anyOfIncident !== null && anyOfIncident.astronautId !== event.astronautId) {
      return invalid(ref, "INCIDENT_NOT_OWNED", "The incident belongs to another astronaut");
    }

    // 5. Event from the future (retryable: the client clock may be ahead of the server).
    if (Date.parse(event.createdAtSim) > context.acceptedAtSim.getTime()) {
      return invalid(ref, "CREATED_AFTER_ACCEPTANCE", "createdAtSim is later than the acceptance time", true);
    }

    // 6 and 7. Rules of the actor.
    const rejection = isShipIncidentEvent(event)
      ? await this.checkShipEvent(event)
      : await this.checkEarthReview(event, context);
    if (rejection !== null) return rejection;

    // 8. Accept.
    return this.accept(event, context);
  }

  /** Step 6 (ARCHITECTURE §9.1): sequence, transition, one unfinished incident, REVIEWED. */
  private async checkShipEvent(event: ShipIncidentEvent): Promise<SyncItemResult | null> {
    const ref: ItemRef = { id: event.id, kind: "INCIDENT_EVENT" };

    // Same UUID was handled in step 3, so the holder here is always another UUID.
    if ((await this.repository.findBySequence(event.incidentId, event.sequence)) !== null) {
      return conflict(ref, "SEQUENCE_OCCUPIED", "This sequence of the incident is already taken by another event");
    }

    const previous = (await this.repository.findByIncident(event.incidentId)).map(toIncidentEvent);
    const check = validateNextShipEvent(previous, event);
    if (!check.ok) {
      return check.code === "SEQUENCE_GAP"
        ? invalid(ref, "SEQUENCE_GAP", `Event ${event.sequence - 1} of this incident has not been accepted yet`, true)
        : invalid(ref, "INVALID_TRANSITION", `${event.type} is not allowed in the current state of the incident`);
    }

    if (event.type === "INCIDENT_OPENED" && (await this.hasUnfinishedIncident(event.astronautId, event.incidentId))) {
      return invalid(ref, "INCIDENT_ALREADY_OPEN", "The astronaut already has an unfinished incident");
    }

    if (event.type === "INCIDENT_CLOSED" && event.data.closureReason === "REVIEWED") {
      const delivered = await this.isReviewDeliveredBy(event.data.reviewEventId, event.incidentId, event.createdAtSim);
      if (!delivered) {
        return invalid(ref, "REVIEW_NOT_DELIVERED", "The review was not delivered to the ship before the closure");
      }
    }
    return null;
  }

  /**
   * Step 7: the review needs a REPORT_SUBMITTED of the incident already delivered to Earth
   * (`deliverAt <= serverSimNow`). It never changes the state, so a late review (after the
   * ship closed or cancelled) is accepted and kept.
   */
  private async checkEarthReview(event: EarthReviewEvent, context: BatchContext): Promise<SyncItemResult | null> {
    const rows = await this.repository.findByIncident(event.incidentId);
    const reportDelivered = rows.some(
      (row) => row.type === "REPORT_SUBMITTED" && row.transmission.deliverAt.getTime() <= context.acceptedAtSim.getTime(),
    );
    if (!reportDelivered) {
      return invalid({ id: event.id, kind: "INCIDENT_EVENT" }, "REPORT_NOT_DELIVERED", "Earth has not received the report yet");
    }
    return null;
  }

  /** Another incident of the astronaut whose accepted ship events are not in a terminal state. */
  private async hasUnfinishedIncident(astronautId: string, exceptIncidentId: string): Promise<boolean> {
    const byIncident = new Map<string, IncidentEvent[]>();
    for (const row of await this.repository.findShipEventsOfAstronaut(astronautId)) {
      if (row.incidentId === exceptIncidentId) continue;
      const list = byIncident.get(row.incidentId) ?? [];
      list.push(toIncidentEvent(row));
      byIncident.set(row.incidentId, list);
    }
    for (const events of byIncident.values()) {
      const state = projectIncidentState(events);
      if (state !== null && !isTerminalIncidentState(state)) return true;
    }
    return false;
  }

  /** T-005 §5.3: an EARTH_REVIEW of the same incident with `deliverAt <= createdAtSim` of the closure. */
  private async isReviewDeliveredBy(reviewEventId: string, incidentId: string, closureCreatedAtSim: string): Promise<boolean> {
    const review = await this.repository.findByIdWithTransmission(reviewEventId);
    return (
      review !== null &&
      review.type === "EARTH_REVIEW" &&
      review.incidentId === incidentId &&
      review.transmission.deliverAt.getTime() <= Date.parse(closureCreatedAtSim)
    );
  }

  /** Event + transmission in one write, with the current profile (as measurements). */
  private async accept(event: IncidentEvent, context: BatchContext): Promise<SyncItemResult> {
    const ref: ItemRef = { id: event.id, kind: "INCIDENT_EVENT" };
    try {
      const row = await this.repository.createWithTransmission(event, {
        id: randomUUID(),
        direction: event.actor === "SHIP" ? "SHIP_TO_EARTH" : "EARTH_TO_SHIP",
        contentKind: "INCIDENT_EVENT",
        acceptedAtReal: context.acceptedAtReal,
        acceptedAtSim: context.acceptedAtSim,
        deliverAt: deliverAtFor(context),
        envProfile: context.profile.profile,
        envVersion: context.profile.version,
      });
      return accepted(ref, toTransmission(row.transmission));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A concurrent send won the race: same UUID, or the same (incidentId, sequence).
      const retry = await this.checkExistingUuid(event);
      if (retry !== null) return retry;
      if (isShipIncidentEvent(event) && (await this.repository.findBySequence(event.incidentId, event.sequence)) !== null) {
        return conflict(ref, "SEQUENCE_OCCUPIED", "This sequence of the incident is already taken by another event");
      }
      throw error;
    }
  }

  /** Same UUID: same canonical payload -> DUPLICATE with the ORIGINAL transmission; otherwise CONFLICT. */
  private async checkExistingUuid(event: IncidentEvent): Promise<SyncItemResult | null> {
    const row = await this.repository.findByIdWithTransmission(event.id);
    if (row === null) return null;

    const ref: ItemRef = { id: event.id, kind: "INCIDENT_EVENT" };
    if (canonicalJson(event) === row.payloadCanonical) {
      return duplicate(ref, toTransmission(row.transmission));
    }
    return conflict(ref, "UUID_CONFLICT", "Same UUID with different content; not overwritten");
  }
}

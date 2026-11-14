import { Injectable } from "@nestjs/common";
import {
  MeasurementSchema,
  TransmissionSchema,
  type DemoRole,
  type MeasurementsResponse,
  type Transmission,
  type TransportStatus,
} from "@astra/contracts";
import { MissionClockService } from "../missions/mission-clock.service.js";
import type { Transmission as TransmissionRow } from "../generated/prisma/client.js";
import { MeasurementsRepository } from "./measurements.repository.js";

/** Computed on every query, never stored (ARCHITECTURE §10.4). */
export function transportStatusAt(deliverAt: string, serverSimNow: string): TransportStatus {
  return Date.parse(deliverAt) <= Date.parse(serverSimNow) ? "DELIVERED" : "IN_TRANSIT";
}

/** Database row -> contract. A row that breaks the contract throws (answered as 500). */
export function toTransmission(row: TransmissionRow): Transmission {
  return TransmissionSchema.parse({
    id: row.id,
    direction: row.direction,
    contentKind: row.contentKind,
    contentId: row.contentId,
    acceptedAtReal: row.acceptedAtReal.toISOString(),
    acceptedAtSim: row.acceptedAtSim.toISOString(),
    deliverAt: row.deliverAt.toISOString(),
    envProfile: row.envProfile,
    envVersion: row.envVersion,
  });
}

@Injectable()
export class MeasurementsService {
  constructor(
    private readonly repository: MeasurementsRepository,
    private readonly clock: MissionClockService,
  ) {}

  async listForRole(astronautId: string, role: DemoRole): Promise<MeasurementsResponse> {
    const serverSimNow = await this.clock.getServerSimNow();
    const rows = await this.repository.findVisible(astronautId, role, new Date(serverSimNow));
    const items = rows.map((row) => {
      const transmission = toTransmission(row.transmission);
      return {
        // S1: the stored canonical payload is the source of truth; rebuilt with MeasurementSchema.
        measurement: MeasurementSchema.parse(JSON.parse(row.payloadCanonical)),
        transmission,
        transportStatus: transportStatusAt(transmission.deliverAt, serverSimNow),
      };
    });
    return { serverSimNow, items };
  }
}

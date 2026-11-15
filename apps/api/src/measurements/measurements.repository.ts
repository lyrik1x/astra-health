import { Injectable } from "@nestjs/common";
import type { DemoRole, Measurement } from "@astra/contracts";
import { canonicalJson } from "../common/canonical-json.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Server-assigned fields of a new transmission (T-005 §2.7). */
export interface NewTransmissionData {
  id: string;
  direction: "SHIP_TO_EARTH";
  contentKind: "MEASUREMENT";
  acceptedAtReal: Date;
  acceptedAtSim: Date;
  deliverAt: Date;
  envProfile: string;
  envVersion: number;
}

/** Prisma access for measurements. The role visibility filter runs IN the query (T-005 §5.1). */
@Injectable()
export class MeasurementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * SHIP: every measurement of the astronaut. EARTH: only those with `deliverAt <= serverSimNow`.
   * Order: capturedAtSim, capturedAtReal, id (ascending), as the engine (T-005 §4).
   */
  findVisible(astronautId: string, role: DemoRole, serverSimNow: Date) {
    return this.prisma.measurement.findMany({
      where: {
        astronautId,
        ...(role === "EARTH" ? { transmission: { deliverAt: { lte: serverSimNow } } } : {}),
      },
      include: { transmission: true },
      orderBy: [{ capturedAtSim: "asc" }, { capturedAtReal: "asc" }, { id: "asc" }],
    });
  }

  /** The stored measurement with its transmission, or null (UUID check of T-203). */
  findByIdWithTransmission(id: string) {
    return this.prisma.measurement.findUnique({ where: { id }, include: { transmission: true } });
  }

  /**
   * Creates the measurement and its transmission in ONE nested Prisma write (atomic, as the seed).
   * The client times (capturedAtReal, capturedAtSim, clockVersion in the payload) are stored as received.
   */
  createWithTransmission(measurement: Measurement, transmission: NewTransmissionData) {
    return this.prisma.measurement.create({
      data: {
        id: measurement.id,
        indicator: measurement.indicator,
        unit: measurement.unit,
        context: measurement.context,
        capturedAtReal: new Date(measurement.capturedAtReal),
        capturedAtSim: new Date(measurement.capturedAtSim),
        payloadCanonical: canonicalJson(measurement),
        astronaut: { connect: { id: measurement.astronautId } },
        transmission: { create: { ...transmission, contentId: measurement.id } },
      },
      include: { transmission: true },
    });
  }
}

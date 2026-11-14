import { Injectable } from "@nestjs/common";
import type { DemoRole } from "@astra/contracts";
import { PrismaService } from "../prisma/prisma.service.js";

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
}

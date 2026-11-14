import type { Measurement, Transmission } from "@astra/contracts";
import { canonicalJson } from "../../src/common/canonical-json.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";

// Fictitious data only (AGENTS.md §8). Not clinical values.

export const CLOCK_EPOCH = "2026-11-14T10:00:00.000Z";

/** Clock: simEpoch = realEpoch = CLOCK_EPOCH, factor 60 (DEC-10). */
export async function insertClock(prisma: PrismaClient): Promise<void> {
  await prisma.missionClock.create({
    data: { id: 1, simEpoch: new Date(CLOCK_EPOCH), realEpoch: new Date(CLOCK_EPOCH), factor: 60, clockVersion: 1 },
  });
}

export async function insertAstronaut(prisma: PrismaClient, id: string, displayName: string): Promise<void> {
  await prisma.astronaut.create({ data: { id, displayName } });
}

/** Measurement + its transmission in one nested (atomic) write, as T-203 will do (S2′). */
export async function insertMeasurement(
  prisma: PrismaClient,
  measurement: Measurement,
  transmission: Transmission,
): Promise<void> {
  await prisma.measurement.create({
    data: {
      id: measurement.id,
      astronaut: { connect: { id: measurement.astronautId } },
      indicator: measurement.indicator,
      unit: measurement.unit,
      context: measurement.context,
      capturedAtReal: new Date(measurement.capturedAtReal),
      capturedAtSim: new Date(measurement.capturedAtSim),
      payloadCanonical: canonicalJson(measurement),
      transmission: {
        create: {
          id: transmission.id,
          direction: transmission.direction,
          contentKind: transmission.contentKind,
          contentId: transmission.contentId,
          acceptedAtReal: new Date(transmission.acceptedAtReal),
          acceptedAtSim: new Date(transmission.acceptedAtSim),
          deliverAt: new Date(transmission.deliverAt),
          envProfile: transmission.envProfile,
          envVersion: transmission.envVersion,
        },
      },
    },
  });
}

/** Transmission data for raw inserts in schema tests. */
export function transmissionData(id: string, contentKind: string, contentId: string) {
  return {
    id,
    direction: "SHIP_TO_EARTH",
    contentKind,
    contentId,
    acceptedAtReal: new Date(CLOCK_EPOCH),
    acceptedAtSim: new Date(CLOCK_EPOCH),
    deliverAt: new Date("2026-11-14T12:00:00.000Z"),
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
  };
}

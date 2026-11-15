import {
  EnvironmentProfileSchema,
  MissionClockSchema,
  MeasurementSchema,
  type MissionClock,
  type Measurement,
} from "@astra/contracts";
import { canonicalJson } from "../common/canonical-json.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { SEED_PROFILE, createSeedMeasurements, seedDeliveryAt } from "./seed-data.js";

const CLOCK_ROW_ID = 1;
const CREW = [
  { id: "sam", displayName: "Sam" },
  { id: "alex", displayName: "Alex" },
] as const;

function toMissionClock(realNow: Date): MissionClock {
  return MissionClockSchema.parse({
    simEpoch: realNow.toISOString(),
    realEpoch: realNow.toISOString(),
    factor: 60,
    clockVersion: 1,
  });
}

/** Idempotent fictional demo data initializer. The caller owns the choice of realNow. */
export async function seedDatabase(prisma: PrismaClient, realNow: Date): Promise<void> {
  if (Number.isNaN(realNow.getTime())) throw new RangeError("realNow must be a valid Date");

  if ((await prisma.missionClock.findUnique({ where: { id: CLOCK_ROW_ID } })) === null) {
    const clock = toMissionClock(realNow);
    await prisma.missionClock.create({
      data: {
        id: CLOCK_ROW_ID,
        simEpoch: new Date(clock.simEpoch),
        realEpoch: new Date(clock.realEpoch),
        factor: clock.factor,
        clockVersion: clock.clockVersion,
      },
    });
  }

  const profile = EnvironmentProfileSchema.parse(SEED_PROFILE);
  if ((await prisma.environmentProfile.findUnique({ where: { profile_version: { profile: profile.profile, version: profile.version } } })) === null) {
    await prisma.environmentProfile.create({ data: profile });
  }

  for (const astronaut of CREW) {
    if ((await prisma.astronaut.findUnique({ where: { id: astronaut.id } })) === null) {
      await prisma.astronaut.create({ data: astronaut });
    }
  }

  for (const seedItem of createSeedMeasurements()) {
    const measurement: Measurement = MeasurementSchema.parse(seedItem.measurement);
    if ((await prisma.measurement.findUnique({ where: { id: measurement.id } })) !== null) continue;

    const acceptedAt = new Date(Date.parse(measurement.capturedAtSim) + 60_000);
    const deliveryAt = seedDeliveryAt(measurement);
    await prisma.measurement.create({
      data: {
        id: measurement.id,
        indicator: measurement.indicator,
        unit: measurement.unit,
        context: measurement.context,
        capturedAtReal: new Date(measurement.capturedAtReal),
        capturedAtSim: new Date(measurement.capturedAtSim),
        payloadCanonical: canonicalJson(measurement),
        astronaut: { connect: { id: measurement.astronautId } },
        transmission: {
          create: {
            id: seedItem.transmissionId,
            direction: "SHIP_TO_EARTH",
            contentKind: "MEASUREMENT",
            contentId: measurement.id,
            acceptedAtReal: acceptedAt,
            acceptedAtSim: acceptedAt,
            deliverAt: deliveryAt,
            envProfile: "MARS_TRANSIT",
            envVersion: 1,
          },
        },
      },
    });
  }
}

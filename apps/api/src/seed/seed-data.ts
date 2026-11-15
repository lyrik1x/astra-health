import { EnvironmentProfileSchema, MeasurementSchema, type EnvironmentProfile, type Measurement } from "@astra/contracts";

const SEED_MEASUREMENTS = [
  ["01", "sam", "HEART_RATE", 68, "bpm", "2026-10-26T08:00:00.000Z"],
  ["02", "sam", "HEART_RATE", 72, "bpm", "2026-10-27T08:00:00.000Z"],
  ["03", "sam", "HEART_RATE", 70, "bpm", "2026-10-28T08:00:00.000Z"],
  ["04", "sam", "HEART_RATE", 75, "bpm", "2026-10-29T08:00:00.000Z"],
  ["05", "sam", "HEART_RATE", 66, "bpm", "2026-10-30T08:00:00.000Z"],
  ["06", "sam", "HEART_RATE", 71, "bpm", "2026-10-31T08:00:00.000Z"],
  ["07", "sam", "BODY_TEMPERATURE", 36.6, "degC", "2026-10-30T08:05:00.000Z"],
  ["08", "sam", "BODY_TEMPERATURE", 36.8, "degC", "2026-10-31T08:05:00.000Z"],
  ["09", "alex", "HEART_RATE", 64, "bpm", "2026-10-29T08:10:00.000Z"],
  ["10", "alex", "HEART_RATE", 67, "bpm", "2026-10-30T08:10:00.000Z"],
  ["11", "alex", "HEART_RATE", 65, "bpm", "2026-10-31T08:10:00.000Z"],
] as const;

export const SEED_PROFILE: EnvironmentProfile = EnvironmentProfileSchema.parse({
  profile: "MARS_TRANSIT",
  version: 1,
  oneWayDelayMinutesSim: 120,
  delaySource: "SIMULATED",
  description: "Simulated one-way delay (no verified source yet)",
});

/**
 * T-402 Parte 0 (decision of Bruno, 14 nov): version 2 of MARS_TRANSIT, 20 simulated minutes.
 * Still a simulated demo value, inside the real Earth-Mars range published by NASA (T-001).
 * Version 1 and the seed history keep envVersion 1.
 */
export const SEED_PROFILE_V2: EnvironmentProfile = EnvironmentProfileSchema.parse({
  profile: "MARS_TRANSIT",
  version: 2,
  oneWayDelayMinutesSim: 20,
  delaySource: "SIMULATED",
  description: "Simulated one-way delay (real Earth-Mars range: 4-24 min, NASA)",
});

/** Every profile version the seed creates if missing, oldest first. */
export const SEED_PROFILES: readonly EnvironmentProfile[] = [SEED_PROFILE, SEED_PROFILE_V2];

export interface SeedMeasurement {
  measurement: Measurement;
  transmissionId: string;
}

export function createSeedMeasurements(): SeedMeasurement[] {
  return SEED_MEASUREMENTS.map(([suffix, astronautId, indicator, value, unit, capturedAtSim]) => {
    const id = `a0000000-0000-4000-8000-0000000000${suffix}`;
    const capturedAt = new Date(capturedAtSim);
    const measurement = MeasurementSchema.parse({
      id,
      astronautId,
      indicator,
      value,
      unit,
      context: "AT_REST",
      origin: "MANUAL",
      capturedAtReal: capturedAt.toISOString(),
      capturedAtSim: capturedAt.toISOString(),
      clockVersion: 1,
      envProfile: "MARS_TRANSIT",
      envVersion: 1,
    });
    return {
      measurement,
      transmissionId: `b0000000-0000-4000-8000-0000000000${suffix}`,
    };
  });
}

export function seedDeliveryAt(measurement: Measurement): Date {
  return new Date(Date.parse(measurement.capturedAtSim) + 121 * 60_000);
}

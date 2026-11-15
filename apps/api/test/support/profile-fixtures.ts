import type { PrismaClient } from "../../src/generated/prisma/client.js";

// Fictitious data only (AGENTS.md §8). The delay is a simulated demo value, not a real one.
// Separate file from fixtures.ts on purpose (T-502): avoids conflicts with parallel work in test/.

/** MARS_TRANSIT profile row; defaults follow T-005 §7 (120 simulated minutes, SIMULATED). */
export async function insertProfile(
  prisma: PrismaClient,
  version = 1,
  oneWayDelayMinutesSim = 120,
): Promise<void> {
  await prisma.environmentProfile.create({
    data: {
      profile: "MARS_TRANSIT",
      version,
      oneWayDelayMinutesSim,
      delaySource: "SIMULATED",
      description: `Fictitious Mars transit profile v${version}`,
    },
  });
}

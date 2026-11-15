import { computeSimNow, type EnvironmentProfileId } from "@astra/contracts";
import type { LocalMissionConfig } from "../db/schema";

export interface CaptureTimes {
  capturedAtReal: string;
  capturedAtSim: string;
  clockVersion: number;
  envProfile: EnvironmentProfileId;
  envVersion: number;
}

/**
 * Capture times from the local copy of the clock, without network (T-202 §3.6).
 * Pure: same config and realNow give the same result. These times are never rewritten later.
 */
export function captureTimesFor(config: LocalMissionConfig, realNow: Date): CaptureTimes {
  return {
    capturedAtReal: realNow.toISOString(),
    capturedAtSim: computeSimNow(config.clock, realNow),
    clockVersion: config.clock.clockVersion,
    envProfile: config.profile.profile,
    envVersion: config.profile.version,
  };
}

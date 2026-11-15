import { Injectable } from "@nestjs/common";
import { MissionClockSchema, computeSimNow, type MissionClock } from "@astra/contracts";
import { ApiErrorException } from "../common/api-error.exception.js";
import { NowProvider } from "../common/now-provider.js";
import type { MissionClock as MissionClockRow } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** The only MissionClock row (T-101 S3). */
const CLOCK_ROW_ID = 1;

function clockNotInitialized(): ApiErrorException {
  return new ApiErrorException(503, "MISSION_CLOCK_NOT_INITIALIZED", "Mission clock is not initialized");
}

/** Database row -> contract. A stored row that breaks the contract is an internal error (500). */
function toMissionClock(row: MissionClockRow): MissionClock {
  return MissionClockSchema.parse({
    simEpoch: row.simEpoch.toISOString(),
    realEpoch: row.realEpoch.toISOString(),
    factor: row.factor,
    clockVersion: row.clockVersion,
  });
}

/** Server clock: the persisted MissionClock plus the injected real "now" (ARCHITECTURE §10.3). */
@Injectable()
export class MissionClockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nowProvider: NowProvider,
  ) {}

  /** Persisted clock. Without its row the API answers 503: it never invents a clock. */
  async getClock(): Promise<MissionClock> {
    const row = await this.prisma.missionClock.findUnique({ where: { id: CLOCK_ROW_ID } });
    if (row === null) {
      throw clockNotInitialized();
    }
    return toMissionClock(row);
  }

  /** `serverSimNow` with the single implementation from contracts (D-23). */
  async getServerSimNow(): Promise<string> {
    const clock = await this.getClock();
    return computeSimNow(clock, this.nowProvider.now());
  }

  /** `serverSimNow` for a clock already read (avoids a second query). */
  simNowFor(clock: MissionClock): string {
    return computeSimNow(clock, this.nowProvider.now());
  }

  /**
   * Changes the factor re-anchoring the clock (ARCHITECTURE §10.3), so simNow is continuous:
   * new simEpoch = simNow at `now`, new realEpoch = `now`, clockVersion + 1.
   * Stored times (deliverAt, capturedAtSim, ...) are never rewritten.
   * S1: the same factor returns the current clock without re-anchoring or a new version.
   */
  async setFactor(factor: number): Promise<MissionClock> {
    const now = this.nowProvider.now();
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.missionClock.findUnique({ where: { id: CLOCK_ROW_ID } });
      if (row === null) {
        throw clockNotInitialized();
      }
      const current = toMissionClock(row);
      if (current.factor === factor) {
        return current;
      }

      const next = MissionClockSchema.parse({
        simEpoch: computeSimNow(current, now),
        realEpoch: now.toISOString(),
        factor,
        clockVersion: current.clockVersion + 1,
      });

      // Concurrency: the update only applies if clockVersion is still the one we read.
      // SQLite with better-sqlite3 already serializes transactions, but if another change won
      // the race, count is 0 and we answer 500 (the contract has no conflict code for this route).
      const result = await tx.missionClock.updateMany({
        where: { id: CLOCK_ROW_ID, clockVersion: current.clockVersion },
        data: {
          simEpoch: new Date(next.simEpoch),
          realEpoch: new Date(next.realEpoch),
          factor: next.factor,
          clockVersion: next.clockVersion,
        },
      });
      if (result.count !== 1) {
        throw new Error(`MissionClock changed concurrently (expected clockVersion ${current.clockVersion})`);
      }
      return next;
    });
  }
}

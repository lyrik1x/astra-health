import { Injectable } from "@nestjs/common";
import { MissionClockSchema, computeSimNow, type MissionClock } from "@astra/contracts";
import { ApiErrorException } from "../common/api-error.exception.js";
import { NowProvider } from "../common/now-provider.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** The only MissionClock row (T-101 S3). */
const CLOCK_ROW_ID = 1;

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
      throw new ApiErrorException(503, "MISSION_CLOCK_NOT_INITIALIZED", "Mission clock is not initialized");
    }
    // A stored row that breaks the contract is an internal error (500), not a client error.
    return MissionClockSchema.parse({
      simEpoch: row.simEpoch.toISOString(),
      realEpoch: row.realEpoch.toISOString(),
      factor: row.factor,
      clockVersion: row.clockVersion,
    });
  }

  /** `serverSimNow` with the single implementation from contracts (D-23). */
  async getServerSimNow(): Promise<string> {
    const clock = await this.getClock();
    return computeSimNow(clock, this.nowProvider.now());
  }
}

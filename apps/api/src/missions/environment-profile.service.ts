import { Injectable } from "@nestjs/common";
import { EnvironmentProfileSchema, type EnvironmentProfile, type EnvironmentProfileId } from "@astra/contracts";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Only profile of the MVP (T-005 §2.3). */
const CURRENT_PROFILE: EnvironmentProfileId = "MARS_TRANSIT";

@Injectable()
export class EnvironmentProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** Highest version of MARS_TRANSIT. Without a row the API answers 503 (S3): it never invents a profile. */
  async getCurrentProfile(): Promise<EnvironmentProfile> {
    const row = await this.prisma.environmentProfile.findFirst({
      where: { profile: CURRENT_PROFILE },
      orderBy: { version: "desc" },
    });
    if (row === null) {
      throw new ApiErrorException(503, "MISSION_PROFILE_NOT_INITIALIZED", "Mission profile is not initialized");
    }
    // A stored row that breaks the contract is an internal error (500), not a client error.
    return EnvironmentProfileSchema.parse({
      profile: row.profile,
      version: row.version,
      oneWayDelayMinutesSim: row.oneWayDelayMinutesSim,
      delaySource: row.delaySource,
      description: row.description,
    });
  }
}

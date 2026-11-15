import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import {
  MissionConfigResponseSchema,
  SetClockFactorRequestSchema,
  SetClockFactorResponseSchema,
  type MissionConfigResponse,
  type SetClockFactorRequest,
  type SetClockFactorResponse,
} from "@astra/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { EnvironmentProfileService } from "./environment-profile.service.js";
import { MissionClockService } from "./mission-clock.service.js";

@Controller("mission")
export class MissionController {
  constructor(
    private readonly clock: MissionClockService,
    private readonly profiles: EnvironmentProfileService,
  ) {}

  /** GET /api/mission/config (T-005 §5.1). SHIP and EARTH. */
  @Get("config")
  async getConfig(): Promise<MissionConfigResponse> {
    // Clock first: without both, the clock 503 wins.
    const clock = await this.clock.getClock();
    const profile = await this.profiles.getCurrentProfile();
    return MissionConfigResponseSchema.parse({ clock, profile, serverSimNow: this.clock.simNowFor(clock) });
  }

  /**
   * POST /api/mission/clock/factor (T-005 §5.1). Demo operator control: SHIP and EARTH (S2).
   * Known limitation (ARCHITECTURE §10.3): do not change the factor while the ship is offline,
   * because its offline capturedAtSim values use the previous configuration.
   */
  @Post("clock/factor")
  @HttpCode(200)
  async setFactor(
    @Body(new ZodValidationPipe(SetClockFactorRequestSchema)) body: SetClockFactorRequest,
  ): Promise<SetClockFactorResponse> {
    const clock = await this.clock.setFactor(body.factor);
    return SetClockFactorResponseSchema.parse({ clock });
  }
}

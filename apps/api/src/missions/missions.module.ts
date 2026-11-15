import { Module } from "@nestjs/common";
import { EnvironmentProfileService } from "./environment-profile.service.js";
import { MissionClockService } from "./mission-clock.service.js";
import { MissionController } from "./mission.controller.js";

// T-502: mission config and clock factor routes (T-005 §5.1).
@Module({
  controllers: [MissionController],
  providers: [MissionClockService, EnvironmentProfileService],
  exports: [MissionClockService],
})
export class MissionsModule {}

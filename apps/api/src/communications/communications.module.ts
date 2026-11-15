import { Module } from "@nestjs/common";
import { MeasurementsRepository } from "../measurements/measurements.repository.js";
import { EnvironmentProfileService } from "../missions/environment-profile.service.js";
import { MissionsModule } from "../missions/missions.module.js";
import { SyncController } from "./sync.controller.js";
import { SyncService } from "./sync.service.js";

// T-203 + T-501 (core): the channel. MeasurementsRepository and EnvironmentProfileService are
// stateless Prisma wrappers, registered here so their own modules stay unchanged (approved).
@Module({
  imports: [MissionsModule],
  controllers: [SyncController],
  providers: [SyncService, MeasurementsRepository, EnvironmentProfileService],
})
export class CommunicationsModule {}

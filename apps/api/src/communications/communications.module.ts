import { Module } from "@nestjs/common";
import { IncidentSyncService } from "../incidents/incident-sync.service.js";
import { IncidentsRepository } from "../incidents/incidents.repository.js";
import { MeasurementsRepository } from "../measurements/measurements.repository.js";
import { EnvironmentProfileService } from "../missions/environment-profile.service.js";
import { MissionsModule } from "../missions/missions.module.js";
import { SyncController } from "./sync.controller.js";
import { SyncService } from "./sync.service.js";

// T-203 + T-501 (core): the channel. The repositories and EnvironmentProfileService are
// stateless Prisma wrappers, registered here so their own modules stay unchanged (approved).
// T-405: incident events go through the same channel (IncidentSyncService).
@Module({
  imports: [MissionsModule],
  controllers: [SyncController],
  providers: [SyncService, MeasurementsRepository, EnvironmentProfileService, IncidentsRepository, IncidentSyncService],
})
export class CommunicationsModule {}

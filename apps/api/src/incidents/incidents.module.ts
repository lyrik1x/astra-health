import { Module } from "@nestjs/common";
import { MissionsModule } from "../missions/missions.module.js";
import { IncidentsController } from "./incidents.controller.js";
import { IncidentsRepository } from "./incidents.repository.js";
import { IncidentsService } from "./incidents.service.js";

// T-402 + T-405: GET /api/incidents. The channel side (POST /api/sync/batch) is registered in
// CommunicationsModule, as with measurements.
@Module({
  imports: [MissionsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentsRepository],
})
export class IncidentsModule {}

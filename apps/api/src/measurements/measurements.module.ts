import { Module } from "@nestjs/common";
import { MissionsModule } from "../missions/missions.module.js";
import { MeasurementsController } from "./measurements.controller.js";
import { MeasurementsRepository } from "./measurements.repository.js";
import { MeasurementsService } from "./measurements.service.js";

@Module({
  imports: [MissionsModule],
  controllers: [MeasurementsController],
  providers: [MeasurementsService, MeasurementsRepository],
})
export class MeasurementsModule {}

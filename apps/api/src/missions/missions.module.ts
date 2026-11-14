import { Module } from "@nestjs/common";
import { MissionClockService } from "./mission-clock.service.js";

// T-104 only adds the server clock. The mission routes come in later tickets.
@Module({
  providers: [MissionClockService],
  exports: [MissionClockService],
})
export class MissionsModule {}

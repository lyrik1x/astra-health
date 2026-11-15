import { Module } from "@nestjs/common";
import { CrewController } from "./crew.controller.js";
import { CrewService } from "./crew.service.js";

@Module({
  controllers: [CrewController],
  providers: [CrewService],
})
export class CrewModule {}

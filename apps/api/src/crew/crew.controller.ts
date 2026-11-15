import { Controller, Get } from "@nestjs/common";
import type { CrewResponse } from "@astra/contracts";
import { CrewService } from "./crew.service.js";

@Controller("crew")
export class CrewController {
  constructor(private readonly crew: CrewService) {}

  /** GET /api/crew (T-005 §5.1). */
  @Get()
  list(): Promise<CrewResponse> {
    return this.crew.list();
  }
}

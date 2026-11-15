import { Controller, Get, Query } from "@nestjs/common";
import { AstronautIdSchema, type DemoRole, type IncidentsResponse } from "@astra/contracts";
import { CurrentDemoRole } from "../common/demo-role.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { IncidentsService } from "./incidents.service.js";

@Controller("incidents")
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  /** GET /api/incidents?astronautId= (T-005 §5.1). `state` is the projection for the querying role. */
  @Get()
  list(
    @Query("astronautId", new ZodValidationPipe(AstronautIdSchema)) astronautId: string,
    @CurrentDemoRole() role: DemoRole,
  ): Promise<IncidentsResponse> {
    return this.incidents.listForRole(astronautId, role);
  }
}

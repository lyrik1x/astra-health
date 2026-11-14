import { Controller, Get, Query } from "@nestjs/common";
import { AstronautIdSchema, type DemoRole, type MeasurementsResponse } from "@astra/contracts";
import { CurrentDemoRole } from "../common/demo-role.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { MeasurementsService } from "./measurements.service.js";

@Controller("measurements")
export class MeasurementsController {
  constructor(private readonly measurements: MeasurementsService) {}

  /** GET /api/measurements?astronautId= (T-005 §5.1) */
  @Get()
  list(
    @Query("astronautId", new ZodValidationPipe(AstronautIdSchema)) astronautId: string,
    @CurrentDemoRole() role: DemoRole,
  ): Promise<MeasurementsResponse> {
    return this.measurements.listForRole(astronautId, role);
  }
}

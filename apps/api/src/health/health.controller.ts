import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@astra/contracts";
import { SkipDemoRole } from "../common/demo-role.js";

@Controller("health")
@SkipDemoRole()
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: "ok" };
  }
}

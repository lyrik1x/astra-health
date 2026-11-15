import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { DemoResetResponseSchema } from "@astra/contracts";
import { DemoService } from "./demo.service.js";

@Controller("demo")
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post("reset")
  @HttpCode(HttpStatus.OK)
  async reset() {
    return DemoResetResponseSchema.parse(await this.demoService.reset());
  }
}

import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../../src/common/zod-validation.pipe.js";

// Test-only routes (P3): registered ONLY by createTestApp, never in AppModule.
// T-104 has no real POST route, so these exercise the body limit, the pipe and the filter.

const ProbeBodySchema = z.object({ text: z.string() }).strict();

/** Fixed text that must never reach the client (QA-704). */
export const PROBE_SECRET = "SECRET_INTERNAL_DETAIL C:\\internal\\path\\dev.db";

@Controller("test-probe")
export class ProbeController {
  @Post()
  echo(@Body(new ZodValidationPipe(ProbeBodySchema)) body: z.infer<typeof ProbeBodySchema>) {
    return body;
  }

  @Post("fail")
  fail(): never {
    throw new Error(PROBE_SECRET);
  }
}

import type { NestExpressApplication } from "@nestjs/platform-express";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import type { ApiConfig } from "./config.js";

/**
 * Shared by main.ts and the tests, so the tests exercise the real setup.
 * The app must be created with `{ bodyParser: false }`: the only parser is this JSON one,
 * with the BODY_LIMIT limit (413 PAYLOAD_TOO_LARGE above it).
 */
export function configureApp(
  app: NestExpressApplication,
  config: Pick<ApiConfig, "corsOrigins" | "bodyLimit">,
): void {
  app.setGlobalPrefix("api");
  app.enableCors({ origin: config.corsOrigins });
  app.useBodyParser("json", { limit: config.bodyLimit });
  app.useGlobalFilters(new ApiExceptionFilter());
}

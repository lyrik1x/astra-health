import type { INestApplication } from "@nestjs/common";
import type { ApiConfig } from "./config.js";

/** Shared by main.ts and the tests, so the tests exercise the real setup. */
export function configureApp(app: INestApplication, config: Pick<ApiConfig, "corsOrigins">): void {
  app.setGlobalPrefix("api");
  app.enableCors({ origin: config.corsOrigins });
}

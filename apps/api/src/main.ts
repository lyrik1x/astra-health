import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./config.js";
import { configureApp } from "./configure-app.js";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app, config);
  await app.listen(config.port);
  console.log(`ASTRA HEALTH API listening on http://localhost:${config.port}/api`);
}

bootstrap().catch((error: unknown) => {
  console.error("API failed to start:", error instanceof Error ? error.message : error);
  process.exit(1);
});

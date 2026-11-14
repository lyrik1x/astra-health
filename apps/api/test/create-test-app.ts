import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config.js";
import { configureApp } from "../src/configure-app.js";

/** Same env format as apps/api/.env.example, parsed by the real loadConfig. */
export const TEST_ENV = {
  PORT: "3000",
  DATABASE_URL: "file:./dev.db",
  CORS_ORIGINS: "http://localhost:5173,http://localhost:4173",
};

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, loadConfig(TEST_ENV));
  await app.init();
  return app;
}

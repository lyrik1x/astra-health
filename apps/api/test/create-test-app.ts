import type { INestApplication, Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module.js";
import { NowProvider } from "../src/common/now-provider.js";
import { loadConfig } from "../src/config.js";
import { configureApp } from "../src/configure-app.js";

/** Same env format as apps/api/.env.example, parsed by the real loadConfig. */
export const TEST_ENV = {
  PORT: "3000",
  // Never opened unless a test queries it (Prisma connects lazily); DB tests pass a temp URL.
  DATABASE_URL: "file:./dev.db",
  CORS_ORIGINS: "http://localhost:5173,http://localhost:4173",
  BODY_LIMIT: "1mb",
};

export interface TestAppOptions {
  /** Overrides of TEST_ENV (e.g. a temp DATABASE_URL or a small BODY_LIMIT). */
  env?: NodeJS.ProcessEnv;
  /** Test-only controllers (e.g. ProbeController). Never part of AppModule. */
  controllers?: Type[];
  /** Replacement for NowProvider, to control the real "now". */
  now?: Pick<NowProvider, "now">;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  const config = loadConfig({ ...TEST_ENV, ...options.env });
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(config)],
    controllers: options.controllers ?? [],
  });
  if (options.now !== undefined) {
    builder = builder.overrideProvider(NowProvider).useValue(options.now);
  }
  const moduleRef = await builder.compile();
  // Same as main.ts: the only body parser is the one configureApp registers.
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app, config);
  await app.init();
  return app;
}

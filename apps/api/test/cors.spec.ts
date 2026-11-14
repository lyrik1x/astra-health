import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./create-test-app.js";

// QA-706: solo los orígenes de CORS_ORIGINS reciben la cabecera de permiso.
describe("CORS", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(["http://localhost:4173", "http://localhost:5173"])("allows origin %s", async (origin) => {
    const response = await request(app.getHttpServer()).get("/api/health").set("Origin", origin);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("does not allow an origin outside CORS_ORIGINS", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/health")
      .set("Origin", "http://evil.example.com");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("does not allow a preflight from an origin outside CORS_ORIGINS", async () => {
    const response = await request(app.getHttpServer())
      .options("/api/health")
      .set("Origin", "http://localhost:9999")
      .set("Access-Control-Request-Method", "GET");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

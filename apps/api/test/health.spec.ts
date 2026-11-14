import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./create-test-app.js";

describe("GET /api/health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("responds 200 with { status: 'ok' }", async () => {
    const response = await request(app.getHttpServer()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

import type { INestApplication } from "@nestjs/common";
import { ApiErrorSchema, HealthResponseSchema } from "@astra/contracts";
import request from "supertest";
import { createTestApp } from "./create-test-app.js";
import { ProbeController } from "./support/probe.controller.js";

// Criteria 4 and 6 (QA-703): X-Demo-Role on every route except /api/health.
describe("X-Demo-Role header", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await app.close();
  });

  it("/api/health works without the header and matches HealthResponseSchema", async () => {
    const response = await request(app.getHttpServer()).get("/api/health");
    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(response.body)).toEqual({ status: "ok" });
  });

  const cases: [string, string | undefined][] = [
    ["missing", undefined],
    ["PILOT", "PILOT"],
    ["lowercase ship", "ship"],
    ["empty", ""],
  ];

  it.each(cases)("GET /api/measurements with %s role -> 400 MISSING_OR_INVALID_ROLE", async (_name, role) => {
    let req = request(app.getHttpServer()).get("/api/measurements?astronautId=sam");
    if (role !== undefined) req = req.set("X-Demo-Role", role);
    const response = await req;
    expect(response.status).toBe(400);
    const error = ApiErrorSchema.parse(response.body);
    expect(error.error).toBe("MISSING_OR_INVALID_ROLE");
    expect(error.details).toBeUndefined();
  });

  it("also applies to POST routes (checked before the body)", async () => {
    const response = await request(app.getHttpServer()).post("/api/test-probe").send({ text: "x" });
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error).toBe("MISSING_OR_INVALID_ROLE");
  });
});

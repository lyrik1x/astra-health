import type { INestApplication } from "@nestjs/common";
import { ApiErrorSchema } from "@astra/contracts";
import request from "supertest";
import { createTestApp } from "./create-test-app.js";
import { PROBE_SECRET, ProbeController } from "./support/probe.controller.js";

// Criteria 2, 3 and 5 through the test-only route POST /api/test-probe (P3).
describe("validation pipe, error filter and body limit", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ env: { BODY_LIMIT: "1kb" }, controllers: [ProbeController] });
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (path: string) => request(app.getHttpServer()).post(path).set("X-Demo-Role", "SHIP");

  it("accepts a valid body (pipe returns the parsed value)", async () => {
    const response = await post("/api/test-probe").send({ text: "hello" });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ text: "hello" });
  });

  it("invalid body -> 400 VALIDATION_FAILED with Zod details", async () => {
    const response = await post("/api/test-probe").send({ text: 5, extra: true });
    expect(response.status).toBe(400);
    const error = ApiErrorSchema.parse(response.body);
    expect(error.error).toBe("VALIDATION_FAILED");
    expect(error.details?.length).toBeGreaterThan(0);
    expect(error.details?.some((d) => d.startsWith("text:"))).toBe(true);
  });

  it("malformed JSON -> 400 VALIDATION_FAILED without parser internals", async () => {
    const response = await post("/api/test-probe").set("Content-Type", "application/json").send('{"text":');
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body)).toEqual({
      statusCode: 400,
      error: "VALIDATION_FAILED",
      message: "Invalid request",
    });
  });

  it("body over BODY_LIMIT -> 413 PAYLOAD_TOO_LARGE", async () => {
    const response = await post("/api/test-probe").send({ text: "x".repeat(2048) });
    expect(response.status).toBe(413);
    expect(ApiErrorSchema.parse(response.body)).toEqual({
      statusCode: 413,
      error: "PAYLOAD_TOO_LARGE",
      message: "Request body is too large",
    });
  });

  it("internal error -> 500 with fixed message, no stack nor internal text (QA-704)", async () => {
    const response = await post("/api/test-probe/fail").send({});
    expect(response.status).toBe(500);
    expect(ApiErrorSchema.parse(response.body)).toEqual({
      statusCode: 500,
      error: "INTERNAL_ERROR",
      message: "Internal server error",
    });
    expect(response.text).not.toContain("SECRET_INTERNAL_DETAIL");
    expect(response.text).not.toContain(PROBE_SECRET);
    expect(response.text).not.toMatch(/stack|at \w+ \(/i);
  });

  it("unknown route -> 404 ApiError", async () => {
    const response = await request(app.getHttpServer()).get("/api/does-not-exist").set("X-Demo-Role", "SHIP");
    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(response.body).error).toBe("NOT_FOUND");
  });
});

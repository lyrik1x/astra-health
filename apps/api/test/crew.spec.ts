import type { INestApplication } from "@nestjs/common";
import { ApiErrorSchema, CrewResponseSchema } from "@astra/contracts";
import request from "supertest";
import { createTestApp } from "./create-test-app.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";
import { seedDatabase } from "../src/seed/seed.js";

describe("GET /api/crew", () => {
  let db: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    db = createTestDatabase();
    await seedDatabase(db.prisma, new Date("2026-11-14T10:00:00.000Z"));
    app = await createTestApp({ env: { DATABASE_URL: db.databaseUrl } });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  it.each(["SHIP", "EARTH"] as const)("returns schema-valid, sorted crew for %s", async (role) => {
    const response = await request(app.getHttpServer()).get("/api/crew").set("X-Demo-Role", role);
    expect(response.status).toBe(200);
    expect(CrewResponseSchema.parse(response.body)).toEqual({
      crew: [
        { id: "alex", displayName: "Alex" },
        { id: "sam", displayName: "Sam" },
      ],
    });
  });

  it.each([undefined, "PILOT"] as const)("rejects missing or invalid demo role (%s)", async (role) => {
    let req = request(app.getHttpServer()).get("/api/crew");
    if (role !== undefined) req = req.set("X-Demo-Role", role);
    const response = await req;
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error).toBe("MISSING_OR_INVALID_ROLE");
  });
});

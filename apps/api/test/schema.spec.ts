import { randomUUID } from "node:crypto";
import { CLOCK_EPOCH, insertAstronaut, transmissionData } from "./support/fixtures.js";
import { createTestDatabase, type TestDatabase } from "./support/test-database.js";

// Criterion 1: constraints of the MVP schema, checked against a migrated temp database.
describe("MVP Prisma schema constraints", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = createTestDatabase();
    await insertAstronaut(db.prisma, "sam", "Sam");
  }, 60_000);

  afterAll(async () => {
    await db?.cleanup();
  });

  function eventData(incidentId: string, sequence: number | null, transmissionId: string) {
    return {
      id: randomUUID(),
      incidentId,
      astronautId: "sam",
      type: sequence === null ? "EARTH_REVIEW" : "INCIDENT_OPENED",
      actor: sequence === null ? "EARTH" : "SHIP",
      sequence,
      createdAtReal: new Date(CLOCK_EPOCH),
      createdAtSim: new Date(CLOCK_EPOCH),
      payloadCanonical: "{}",
      transmissionId,
    };
  }

  async function newTransmission(contentKind = "INCIDENT_EVENT"): Promise<string> {
    const id = randomUUID();
    await db.prisma.transmission.create({ data: transmissionData(id, contentKind, randomUUID()) });
    return id;
  }

  it("Transmission is unique by (contentKind, contentId)", async () => {
    const contentId = randomUUID();
    await db.prisma.transmission.create({ data: transmissionData(randomUUID(), "MEASUREMENT", contentId) });
    await expect(
      db.prisma.transmission.create({ data: transmissionData(randomUUID(), "MEASUREMENT", contentId) }),
    ).rejects.toThrow();
    // Same contentId with another kind is a different pair.
    await expect(
      db.prisma.transmission.create({ data: transmissionData(randomUUID(), "MESSAGE", contentId) }),
    ).resolves.toBeDefined();
  });

  it("IncidentEvent is unique by (incidentId, sequence)", async () => {
    const incidentId = randomUUID();
    await db.prisma.incidentEvent.create({ data: eventData(incidentId, 1, await newTransmission()) });
    await expect(
      db.prisma.incidentEvent.create({ data: eventData(incidentId, 1, await newTransmission()) }),
    ).rejects.toThrow();
  });

  it("several EARTH_REVIEW with null sequence in the same incident do not clash", async () => {
    const incidentId = randomUUID();
    await db.prisma.incidentEvent.create({ data: eventData(incidentId, null, await newTransmission()) });
    await db.prisma.incidentEvent.create({ data: eventData(incidentId, null, await newTransmission()) });
    expect(await db.prisma.incidentEvent.count({ where: { incidentId, sequence: null } })).toBe(2);
  });

  it("a content cannot point to a missing transmission (FK, S2′)", async () => {
    await expect(
      db.prisma.incidentEvent.create({ data: eventData(randomUUID(), 1, randomUUID()) }),
    ).rejects.toThrow();
  });

  it("two contents cannot share one transmission (transmissionId unique, S2′)", async () => {
    const transmissionId = await newTransmission();
    await db.prisma.incidentEvent.create({ data: eventData(randomUUID(), 1, transmissionId) });
    await expect(
      db.prisma.incidentEvent.create({ data: eventData(randomUUID(), 1, transmissionId) }),
    ).rejects.toThrow();
  });

  it("a content cannot reference an unknown astronaut (FK)", async () => {
    await expect(
      db.prisma.incidentEvent.create({
        data: { ...eventData(randomUUID(), 1, await newTransmission()), astronautId: "nobody" },
      }),
    ).rejects.toThrow();
  });
});

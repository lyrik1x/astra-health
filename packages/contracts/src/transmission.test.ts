import { describe, expect, it } from "vitest";
import {
  TransmissionSchema,
  TransportStatusSchema,
  transmissionMismatches,
  type Transmission,
} from "./index.js";
import { IDS, parses, transmission } from "./test-fixtures.js";

const valid = transmission("MEASUREMENT", IDS.measurement, "SHIP_TO_EARTH");

describe("TransmissionSchema", () => {
  it("accepts every content kind", () => {
    for (const kind of ["MEASUREMENT", "INCIDENT_EVENT", "MESSAGE"]) {
      expect(parses(TransmissionSchema, { ...valid, contentKind: kind })).toBe(true);
    }
  });

  it("rejects an unknown content kind, unknown keys and invalid dates", () => {
    expect(parses(TransmissionSchema, { ...valid, contentKind: "FILE" })).toBe(false);
    expect(parses(TransmissionSchema, { ...valid, status: "DELIVERED" })).toBe(false);
    expect(parses(TransmissionSchema, { ...valid, deliverAt: "2026-11-14T18:08:43Z" })).toBe(false);
  });
});

describe("TransportStatusSchema", () => {
  it("accepts IN_TRANSIT and DELIVERED", () => {
    expect(parses(TransportStatusSchema, "IN_TRANSIT")).toBe(true);
    expect(parses(TransportStatusSchema, "DELIVERED")).toBe(true);
  });

  it("rejects QUEUED (client-only) and FAILED (later phase)", () => {
    expect(parses(TransportStatusSchema, "QUEUED")).toBe(false);
    expect(parses(TransportStatusSchema, "FAILED")).toBe(false);
  });
});

describe("transmissionMismatches", () => {
  const parsed = TransmissionSchema.parse(valid) as Transmission;

  it("returns nothing when kind, id and direction match", () => {
    expect(
      transmissionMismatches(parsed, {
        contentKind: "MEASUREMENT",
        contentId: IDS.measurement,
        direction: "SHIP_TO_EARTH",
      }),
    ).toEqual([]);
  });

  it("reports each mismatch", () => {
    const paths = transmissionMismatches(parsed, {
      contentKind: "MESSAGE",
      contentId: IDS.message,
      direction: "EARTH_TO_SHIP",
    }).map((mismatch) => mismatch.path);
    expect(paths).toEqual(["contentKind", "contentId", "direction"]);
  });
});

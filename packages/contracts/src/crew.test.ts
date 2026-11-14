import { describe, expect, it } from "vitest";
import { AstronautIdSchema, AstronautSchema } from "./index.js";
import { parses } from "./test-fixtures.js";

describe("AstronautIdSchema (DEC-6 C)", () => {
  it("accepts valid ids without a fixed list", () => {
    for (const id of ["sam", "crew-03", "a", "x".repeat(40)]) {
      expect(parses(AstronautIdSchema, id)).toBe(true);
    }
  });

  it("rejects empty, uppercase, spaces, other symbols and 41 characters", () => {
    for (const id of ["", "Sam", "sam smith", " sam", "sam_1", "x".repeat(41)]) {
      expect(parses(AstronautIdSchema, id)).toBe(false);
    }
  });
});

describe("AstronautSchema", () => {
  it("accepts a fictitious astronaut", () => {
    expect(parses(AstronautSchema, { id: "sam", displayName: "Sam" })).toBe(true);
  });

  it("rejects blank or too long displayName and unknown keys", () => {
    expect(parses(AstronautSchema, { id: "sam", displayName: "  " })).toBe(false);
    expect(parses(AstronautSchema, { id: "sam", displayName: "a".repeat(61) })).toBe(false);
    expect(parses(AstronautSchema, { id: "sam", displayName: "Sam", role: "pilot" })).toBe(false);
  });
});

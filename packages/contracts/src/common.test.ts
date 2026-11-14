import { describe, expect, it } from "vitest";
import {
  DbIntSchema,
  DemoRoleSchema,
  DirectionSchema,
  IsoDateTimeSchema,
  MAX_DB_INT,
  NonBlankText,
  UuidSchema,
} from "./index.js";
import { parses } from "./test-fixtures.js";

describe("UuidSchema", () => {
  it("accepts an RFC 9562 v4 UUID", () => {
    expect(parses(UuidSchema, "f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
  });

  it("rejects a non-UUID", () => {
    expect(parses(UuidSchema, "not-a-uuid")).toBe(false);
  });
});

describe("IsoDateTimeSchema", () => {
  it("accepts UTC with milliseconds and Z", () => {
    expect(parses(IsoDateTimeSchema, "2026-11-14T16:08:43.193Z")).toBe(true);
  });

  it("rejects no milliseconds, another zone, other precision and non-ISO text", () => {
    for (const value of [
      "2026-11-14T16:08:43Z",
      "2026-11-14T16:08:43.193+01:00",
      "2026-11-14T16:08:43.1934Z",
      "2026-11-14 16:08:43.193Z",
      "2026-11-14",
    ]) {
      expect(parses(IsoDateTimeSchema, value)).toBe(false);
    }
  });
});

describe("DbIntSchema (M-15)", () => {
  it("accepts MAX_DB_INT", () => {
    expect(parses(DbIntSchema, MAX_DB_INT)).toBe(true);
  });

  it("rejects MAX_DB_INT + 1 and decimals", () => {
    expect(parses(DbIntSchema, MAX_DB_INT + 1)).toBe(false);
    expect(parses(DbIntSchema, 1.5)).toBe(false);
  });
});

describe("NonBlankText", () => {
  const text = NonBlankText(1, 10);

  it("accepts text surrounded by spaces WITHOUT modifying it", () => {
    const result = text.safeParse("  hi  ");
    expect(result.success).toBe(true);
    expect(result.data).toBe("  hi  ");
  });

  it("accepts exactly the maximum length", () => {
    expect(parses(text, "a".repeat(10))).toBe(true);
  });

  it("rejects empty, whitespace-only and too-long text", () => {
    expect(parses(text, "")).toBe(false);
    expect(parses(text, "   \t ")).toBe(false);
    expect(parses(text, "a".repeat(11))).toBe(false);
  });
});

describe("DemoRoleSchema and DirectionSchema", () => {
  it("accept their values", () => {
    expect(parses(DemoRoleSchema, "SHIP")).toBe(true);
    expect(parses(DemoRoleSchema, "EARTH")).toBe(true);
    expect(parses(DirectionSchema, "SHIP_TO_EARTH")).toBe(true);
    expect(parses(DirectionSchema, "EARTH_TO_SHIP")).toBe(true);
  });

  it("reject other values", () => {
    expect(parses(DemoRoleSchema, "ship")).toBe(false);
    expect(parses(DemoRoleSchema, "ADMIN")).toBe(false);
    expect(parses(DirectionSchema, "EARTH_TO_EARTH")).toBe(false);
  });
});

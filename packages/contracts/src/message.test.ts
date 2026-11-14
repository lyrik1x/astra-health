import { describe, expect, it } from "vitest";
import { MessageSchema } from "./index.js";
import { IDS, message, parses } from "./test-fixtures.js";

const ok = (value: unknown) => parses(MessageSchema, value);

describe("MessageSchema", () => {
  it("accepts both directions", () => {
    expect(ok(message)).toBe(true);
    expect(ok({ ...message, direction: "EARTH_TO_SHIP" })).toBe(true);
  });

  it("keeps the body unmodified", () => {
    const result = MessageSchema.safeParse({ ...message, body: "  Hello  " });
    expect(result.success).toBe(true);
    expect(result.data?.body).toBe("  Hello  ");
  });

  it("rejects empty, blank and too long bodies", () => {
    expect(ok({ ...message, body: "" })).toBe(false);
    expect(ok({ ...message, body: "    " })).toBe(false);
    expect(ok({ ...message, body: "a".repeat(501) })).toBe(false);
  });

  it("rejects incidentId (DEC-7), an invalid direction and dates without milliseconds", () => {
    expect(ok({ ...message, incidentId: IDS.incident })).toBe(false);
    expect(ok({ ...message, direction: "SHIP_TO_SHIP" })).toBe(false);
    expect(ok({ ...message, createdAtSim: "2026-11-14T16:08:43Z" })).toBe(false);
  });
});

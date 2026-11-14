import { describe, expect, it } from "vitest";
import { ApiErrorSchema, RejectionCodeSchema } from "./index.js";
import { parses } from "./test-fixtures.js";

const error = { statusCode: 400, error: "VALIDATION_FAILED", message: "Invalid input" };

describe("RejectionCodeSchema", () => {
  it("has the 15 codes of T-005 §5.3", () => {
    expect(RejectionCodeSchema.options).toHaveLength(15);
    expect(parses(RejectionCodeSchema, "SEQUENCE_GAP")).toBe(true);
  });

  it("rejects an unknown code", () => {
    expect(parses(RejectionCodeSchema, "NOT_A_CODE")).toBe(false);
  });
});

describe("ApiErrorSchema (Q4, Q5)", () => {
  it("accepts a rejection, another uppercase code and string details", () => {
    expect(parses(ApiErrorSchema, error)).toBe(true);
    expect(parses(ApiErrorSchema, { statusCode: 404, error: "NOT_FOUND", message: "Not found" })).toBe(true);
    expect(parses(ApiErrorSchema, { ...error, details: ["items: Too small"] })).toBe(true);
  });

  it("rejects lowercase codes, non-error statuses, blank messages and non-string details", () => {
    expect(parses(ApiErrorSchema, { ...error, error: "validation_failed" })).toBe(false);
    expect(parses(ApiErrorSchema, { ...error, error: "A".repeat(65) })).toBe(false);
    expect(parses(ApiErrorSchema, { ...error, statusCode: 200 })).toBe(false);
    expect(parses(ApiErrorSchema, { ...error, statusCode: 600 })).toBe(false);
    expect(parses(ApiErrorSchema, { ...error, message: " " })).toBe(false);
    expect(parses(ApiErrorSchema, { ...error, details: [{ path: "items" }] })).toBe(false);
  });

  it("rejects internal data keys such as stack", () => {
    expect(parses(ApiErrorSchema, { ...error, stack: "at main.ts:1" })).toBe(false);
  });
});

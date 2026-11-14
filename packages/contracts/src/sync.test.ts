import { describe, expect, it } from "vitest";
import {
  SYNC_BATCH_MAX_ITEMS,
  SyncBatchItemSchema,
  SyncBatchRequestSchema,
  SyncBatchResponseSchema,
  SyncItemResultSchema,
} from "./index.js";
import { IDS, T, events, measurements, message, parses, transmission } from "./test-fixtures.js";

const measurementItem = { kind: "MEASUREMENT", payload: measurements.HEART_RATE };

describe("SyncBatchItemSchema", () => {
  it("accepts each kind with its payload", () => {
    expect(parses(SyncBatchItemSchema, measurementItem)).toBe(true);
    expect(parses(SyncBatchItemSchema, { kind: "INCIDENT_EVENT", payload: events.opened })).toBe(true);
    expect(parses(SyncBatchItemSchema, { kind: "MESSAGE", payload: message })).toBe(true);
  });

  it("rejects an unknown kind and a payload of another kind", () => {
    expect(parses(SyncBatchItemSchema, { kind: "FILE", payload: message })).toBe(false);
    expect(parses(SyncBatchItemSchema, { kind: "MESSAGE", payload: measurements.HEART_RATE })).toBe(false);
  });

  it("rejects an invalid payload and unknown keys", () => {
    expect(parses(SyncBatchItemSchema, { kind: "MEASUREMENT", payload: { ...measurements.MOOD, value: 6 } })).toBe(false);
    expect(parses(SyncBatchItemSchema, { ...measurementItem, priority: 1 })).toBe(false);
  });
});

describe("SyncBatchRequestSchema", () => {
  const batchOf = (count: number) => ({ items: Array.from({ length: count }, () => measurementItem) });

  it("accepts 1 and SYNC_BATCH_MAX_ITEMS (50) items", () => {
    expect(SYNC_BATCH_MAX_ITEMS).toBe(50);
    expect(parses(SyncBatchRequestSchema, batchOf(1))).toBe(true);
    expect(parses(SyncBatchRequestSchema, batchOf(50))).toBe(true);
  });

  it("rejects 0 and 51 items", () => {
    expect(parses(SyncBatchRequestSchema, batchOf(0))).toBe(false);
    expect(parses(SyncBatchRequestSchema, batchOf(51))).toBe(false);
  });

  it("rejects a batch with one unknown kind and unknown envelope keys", () => {
    expect(parses(SyncBatchRequestSchema, { items: [measurementItem, { kind: "FILE", payload: {} }] })).toBe(false);
    expect(parses(SyncBatchRequestSchema, { ...batchOf(1), clientId: "x" })).toBe(false);
  });
});

describe("SyncItemResultSchema", () => {
  const tx = transmission("MEASUREMENT", IDS.measurement, "SHIP_TO_EARTH");
  const accepted = {
    id: IDS.measurement,
    kind: "MEASUREMENT",
    status: "ACCEPTED",
    code: 201,
    retryable: false,
    transmission: tx,
  };
  const conflict = {
    id: IDS.measurement,
    kind: "MEASUREMENT",
    status: "CONFLICT",
    code: 409,
    retryable: false,
    error: { statusCode: 409, error: "UUID_CONFLICT", message: "Same UUID with different content" },
  };
  const invalid = (code: string, retryable: boolean) => ({
    id: IDS.event,
    kind: "INCIDENT_EVENT",
    status: "INVALID",
    code: 400,
    retryable,
    error: { statusCode: 400, error: code, message: "Rejected" },
  });
  const ok = (value: unknown) => parses(SyncItemResultSchema, value);

  it("ACCEPTED and DUPLICATE: with transmission, matching code", () => {
    expect(ok(accepted)).toBe(true);
    expect(ok({ ...accepted, status: "DUPLICATE", code: 200 })).toBe(true);
    expect(ok({ ...accepted, code: 200 })).toBe(false);
    expect(ok({ ...accepted, retryable: true })).toBe(false);
    const { transmission: _omitted, ...withoutTransmission } = accepted;
    expect(ok(withoutTransmission)).toBe(false);
    expect(ok({ ...accepted, error: conflict.error })).toBe(false);
  });

  it("ACCEPTED: the transmission must describe the same kind and id (M-10)", () => {
    expect(ok({ ...accepted, transmission: { ...tx, contentKind: "MESSAGE" } })).toBe(false);
    expect(ok({ ...accepted, transmission: { ...tx, contentId: IDS.message } })).toBe(false);
  });

  it("CONFLICT: 409, not retryable, only conflict codes, no transmission", () => {
    expect(ok(conflict)).toBe(true);
    expect(ok({ ...conflict, error: { ...conflict.error, error: "SEQUENCE_OCCUPIED" } })).toBe(true);
    expect(ok({ ...conflict, error: { ...conflict.error, error: "SEQUENCE_GAP" } })).toBe(false);
    expect(ok({ ...conflict, retryable: true })).toBe(false);
    expect(ok({ ...conflict, transmission: tx })).toBe(false);
    expect(ok({ ...conflict, error: { ...conflict.error, statusCode: 400 } })).toBe(false);
  });

  it("INVALID: retryable exactly for SEQUENCE_GAP, CREATED_AFTER_ACCEPTANCE and UNEXPECTED_ITEM_ERROR (DEC-8)", () => {
    for (const code of ["SEQUENCE_GAP", "CREATED_AFTER_ACCEPTANCE", "UNEXPECTED_ITEM_ERROR"]) {
      expect(ok(invalid(code, true))).toBe(true);
      expect(ok(invalid(code, false))).toBe(false);
    }
    expect(ok(invalid("VALIDATION_FAILED", false))).toBe(true);
    expect(ok(invalid("VALIDATION_FAILED", true))).toBe(false);
  });

  it("INVALID: rejects conflict codes, request-level codes and a wrong status code", () => {
    expect(ok(invalid("UUID_CONFLICT", false))).toBe(false);
    expect(ok(invalid("MISSING_OR_INVALID_ROLE", false))).toBe(false);
    expect(ok(invalid("PAYLOAD_TOO_LARGE", false))).toBe(false);
    expect(ok({ ...invalid("VALIDATION_FAILED", false), code: 409 })).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(ok({ ...accepted, status: "PENDING" })).toBe(false);
  });
});

describe("SyncBatchResponseSchema", () => {
  it("accepts mixed results with serverSimNow", () => {
    const response = {
      serverSimNow: T,
      results: [
        {
          id: IDS.measurement,
          kind: "MEASUREMENT",
          status: "ACCEPTED",
          code: 201,
          retryable: false,
          transmission: transmission("MEASUREMENT", IDS.measurement, "SHIP_TO_EARTH"),
        },
        {
          id: IDS.event,
          kind: "INCIDENT_EVENT",
          status: "INVALID",
          code: 400,
          retryable: true,
          error: { statusCode: 400, error: "SEQUENCE_GAP", message: "Missing predecessor" },
        },
      ],
    };
    expect(parses(SyncBatchResponseSchema, response)).toBe(true);
  });

  it("rejects a response without serverSimNow", () => {
    expect(parses(SyncBatchResponseSchema, { results: [] })).toBe(false);
  });
});

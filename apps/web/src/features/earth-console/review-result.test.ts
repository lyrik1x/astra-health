import { describe, expect, it } from "vitest";
import { SyncItemResultSchema, type SyncItemResult } from "@astra/contracts";
import { interpretReviewResult } from "./review-result";
import { sentResult } from "./test-fixtures";

const ID = "33333333-3333-4333-8333-333333333333";

function invalid(code: "REPORT_NOT_DELIVERED" | "CREATED_AFTER_ACCEPTANCE" | "UNEXPECTED_ITEM_ERROR", retryable: boolean): SyncItemResult {
  return SyncItemResultSchema.parse({
    id: ID,
    kind: "INCIDENT_EVENT",
    status: "INVALID",
    code: 400,
    retryable,
    error: { statusCode: 400, error: code, message: "Fictional test message" },
  });
}

describe("interpretReviewResult", () => {
  it.each(["ACCEPTED", "DUPLICATE"] as const)("%s -> SENT", (status) => {
    const result = SyncItemResultSchema.parse(sentResult(ID, status));
    expect(interpretReviewResult(result)).toEqual({ kind: "SENT" });
  });

  it("permanent INVALID -> REJECTED with its code", () => {
    expect(interpretReviewResult(invalid("REPORT_NOT_DELIVERED", false))).toEqual({
      kind: "REJECTED",
      code: "REPORT_NOT_DELIVERED",
    });
  });

  it.each(["CREATED_AFTER_ACCEPTANCE", "UNEXPECTED_ITEM_ERROR"] as const)("retryable INVALID %s -> RETRY with a new event", (code) => {
    expect(interpretReviewResult(invalid(code, true))).toEqual({ kind: "RETRY", code, rebuild: true });
  });

  it("CONFLICT -> REJECTED with its code", () => {
    const result = SyncItemResultSchema.parse({
      id: ID,
      kind: "INCIDENT_EVENT",
      status: "CONFLICT",
      code: 409,
      retryable: false,
      error: { statusCode: 409, error: "UUID_CONFLICT", message: "Fictional test message" },
    });
    expect(interpretReviewResult(result)).toEqual({ kind: "REJECTED", code: "UUID_CONFLICT" });
  });

  it("no result (network or HTTP error) -> RETRY with the same event", () => {
    expect(interpretReviewResult(undefined)).toEqual({ kind: "RETRY", rebuild: false });
  });
});

import type { RejectionCode, SyncItemResult } from "@astra/contracts";

/**
 * What the console does after sending a review:
 * - SENT: ACCEPTED or DUPLICATE (the server already has it; the badge comes from GET /api/incidents).
 * - RETRY: retryable INVALID (DEC-8), a network error or an HTTP error. The text is kept.
 * - REJECTED: permanent INVALID or CONFLICT, with its code. The text is kept.
 *
 * `rebuild` tells whether the next attempt needs a new event (new UUID and times). After a
 * network or HTTP error (`result` is undefined) the SAME event is sent again, so an attempt that
 * did reach the server answers DUPLICATE instead of creating a second review (AGENTS.md §7).
 */
export type ReviewOutcome =
  | { kind: "SENT" }
  | { kind: "RETRY"; code?: RejectionCode; rebuild: boolean }
  | { kind: "REJECTED"; code: RejectionCode };

export function interpretReviewResult(result: SyncItemResult | undefined): ReviewOutcome {
  if (result === undefined) return { kind: "RETRY", rebuild: false };
  switch (result.status) {
    case "ACCEPTED":
    case "DUPLICATE":
      return { kind: "SENT" };
    case "INVALID":
      return result.retryable
        ? { kind: "RETRY", code: result.error.error, rebuild: true }
        : { kind: "REJECTED", code: result.error.error };
    case "CONFLICT":
      return { kind: "REJECTED", code: result.error.error };
  }
}

import { z } from "zod";
import { SYNC_BATCH_MAX_ITEMS } from "@astra/contracts";
import { ApiErrorException } from "../common/api-error.exception.js";
import { formatZodIssues } from "../common/zod-validation.pipe.js";

/**
 * Envelope of POST /api/sync/batch WITHOUT validating each item (T-203 §3.1).
 * SyncBatchRequestSchema is not used here on purpose: one invalid item would fail the whole
 * batch, and T-005 §5.2 asks for 200 with one result per item.
 */
const SyncEnvelopeSchema = z.object({ items: z.array(z.unknown()).min(1) }).strict();

/** Invalid envelope -> 400 VALIDATION_FAILED. More than SYNC_BATCH_MAX_ITEMS -> 413 PAYLOAD_TOO_LARGE. */
export function parseSyncEnvelope(body: unknown): unknown[] {
  const result = SyncEnvelopeSchema.safeParse(body);
  if (!result.success) {
    throw new ApiErrorException(400, "VALIDATION_FAILED", "Invalid request", formatZodIssues(result.error));
  }
  if (result.data.items.length > SYNC_BATCH_MAX_ITEMS) {
    throw new ApiErrorException(
      413,
      "PAYLOAD_TOO_LARGE",
      `A batch accepts at most ${SYNC_BATCH_MAX_ITEMS} items`,
    );
  }
  return result.data.items;
}

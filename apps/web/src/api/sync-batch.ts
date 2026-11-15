import {
  SyncBatchRequestSchema,
  SyncBatchResponseSchema,
  type SyncBatchRequest,
  type SyncBatchResponse,
} from "@astra/contracts";
import { apiFetch, type ApiFetch } from "./client";

/**
 * Sends POST /api/sync/batch. The request is validated before sending and the response with the
 * shared contract. The results must describe the same items, in the same order (T-005 §5.2).
 */
export async function postSyncBatch(request: SyncBatchRequest, fetcher: ApiFetch = apiFetch): Promise<SyncBatchResponse> {
  const body = SyncBatchRequestSchema.parse(request);
  const response = await fetcher("/api/sync/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST /api/sync/batch failed with HTTP ${response.status}`);
  }
  const parsed = SyncBatchResponseSchema.parse(await response.json());
  const sameItems =
    parsed.results.length === body.items.length &&
    parsed.results.every((result, index) => {
      const item = body.items[index];
      return item !== undefined && result.id === item.payload.id && result.kind === item.kind;
    });
  if (!sameItems) {
    throw new Error("POST /api/sync/batch returned results that do not match the sent items");
  }
  return parsed;
}

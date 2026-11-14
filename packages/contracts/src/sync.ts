import { z } from "zod";
import {
  ApiErrorSchema,
  ConflictCodeSchema,
  InvalidItemCodeSchema,
  RETRYABLE_INVALID_CODES,
} from "./api-error.js";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";
import { IncidentEventSchema } from "./incident.js";
import { MeasurementSchema } from "./measurement.js";
import { MessageSchema } from "./message.js";
import { ContentKindSchema, TransmissionSchema, transmissionMismatches } from "./transmission.js";

/** Technical limit: maximum items per batch accepted by the server (T-005 §5.2). Not clinical. */
export const SYNC_BATCH_MAX_ITEMS = 50;

/** Discriminated by `kind` (T-005 §5.2). Role rules are checked by the server, not here. */
export const SyncBatchItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MEASUREMENT"), payload: MeasurementSchema }).strict(),
  z.object({ kind: z.literal("INCIDENT_EVENT"), payload: IncidentEventSchema }).strict(),
  z.object({ kind: z.literal("MESSAGE"), payload: MessageSchema }).strict(),
]);
export type SyncBatchItem = z.infer<typeof SyncBatchItemSchema>;

export const SyncBatchRequestSchema = z
  .object({
    // 1..SYNC_BATCH_MAX_ITEMS items: technical limit, not clinical.
    items: z.array(SyncBatchItemSchema).min(1).max(SYNC_BATCH_MAX_ITEMS),
  })
  .strict();
export type SyncBatchRequest = z.infer<typeof SyncBatchRequestSchema>;

const resultBase = {
  id: UuidSchema,
  kind: ContentKindSchema,
};

/** The transmission of a result must describe the same item: same kind and id (M-10, Q6). */
function checkResultTransmission(
  result: { id: string; kind: z.infer<typeof ContentKindSchema>; transmission: z.infer<typeof TransmissionSchema> },
  ctx: z.RefinementCtx,
): void {
  for (const mismatch of transmissionMismatches(result.transmission, {
    contentKind: result.kind,
    contentId: result.id,
  })) {
    ctx.addIssue({ code: "custom", message: mismatch.message, path: ["transmission", mismatch.path] });
  }
}

const AcceptedResultSchema = z
  .object({
    ...resultBase,
    status: z.literal("ACCEPTED"),
    code: z.literal(201),
    retryable: z.literal(false),
    transmission: TransmissionSchema,
  })
  .strict()
  .superRefine(checkResultTransmission);

const DuplicateResultSchema = z
  .object({
    ...resultBase,
    status: z.literal("DUPLICATE"),
    code: z.literal(200),
    retryable: z.literal(false),
    // The ORIGINAL transmission.
    transmission: TransmissionSchema,
  })
  .strict()
  .superRefine(checkResultTransmission);

const ConflictResultSchema = z
  .object({
    ...resultBase,
    status: z.literal("CONFLICT"),
    code: z.literal(409),
    retryable: z.literal(false),
    error: z
      .object({ ...ApiErrorSchema.shape, statusCode: z.literal(409), error: ConflictCodeSchema })
      .strict(),
  })
  .strict();

const InvalidResultSchema = z
  .object({
    ...resultBase,
    status: z.literal("INVALID"),
    code: z.literal(400),
    retryable: z.boolean(),
    error: z
      .object({ ...ApiErrorSchema.shape, statusCode: z.literal(400), error: InvalidItemCodeSchema })
      .strict(),
  })
  .strict()
  .superRefine((result, ctx) => {
    // retryable is true exactly for the DEC-8 codes.
    const expected = RETRYABLE_INVALID_CODES.includes(result.error.error);
    if (result.retryable !== expected) {
      ctx.addIssue({
        code: "custom",
        message: `retryable must be ${expected} for ${result.error.error}`,
        path: ["retryable"],
      });
    }
  });

/** Per-item result, discriminated by `status` (T-005 §5.2 and §5.3). */
export const SyncItemResultSchema = z.discriminatedUnion("status", [
  AcceptedResultSchema,
  DuplicateResultSchema,
  ConflictResultSchema,
  InvalidResultSchema,
]);
export type SyncItemResult = z.infer<typeof SyncItemResultSchema>;

/** `results` keep the same order as the request `items` (checked by the server and client). */
export const SyncBatchResponseSchema = z
  .object({
    serverSimNow: IsoDateTimeSchema,
    results: z.array(SyncItemResultSchema),
  })
  .strict();
export type SyncBatchResponse = z.infer<typeof SyncBatchResponseSchema>;

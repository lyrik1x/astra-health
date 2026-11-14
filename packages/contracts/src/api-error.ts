import { z } from "zod";

/** Stable rejection codes of T-005 §5.3. */
export const RejectionCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "ROLE_NOT_ALLOWED",
  "UNKNOWN_ASTRONAUT",
  "UUID_CONFLICT",
  "SEQUENCE_OCCUPIED",
  "SEQUENCE_GAP",
  "CREATED_AFTER_ACCEPTANCE",
  "INVALID_TRANSITION",
  "INCIDENT_ALREADY_OPEN",
  "INCIDENT_NOT_OWNED",
  "REVIEW_NOT_DELIVERED",
  "REPORT_NOT_DELIVERED",
  "UNEXPECTED_ITEM_ERROR",
  "MISSING_OR_INVALID_ROLE",
  "PAYLOAD_TOO_LARGE",
]);
export type RejectionCode = z.infer<typeof RejectionCodeSchema>;

/** Codes whose item status is CONFLICT (T-005 §5.3). */
export const ConflictCodeSchema = RejectionCodeSchema.extract(["UUID_CONFLICT", "SEQUENCE_OCCUPIED"]);
export type ConflictCode = z.infer<typeof ConflictCodeSchema>;

/** Codes whose item status is INVALID (T-005 §5.3). Request-level codes are excluded. */
export const InvalidItemCodeSchema = RejectionCodeSchema.extract([
  "VALIDATION_FAILED",
  "ROLE_NOT_ALLOWED",
  "UNKNOWN_ASTRONAUT",
  "SEQUENCE_GAP",
  "CREATED_AFTER_ACCEPTANCE",
  "INVALID_TRANSITION",
  "INCIDENT_ALREADY_OPEN",
  "INCIDENT_NOT_OWNED",
  "REVIEW_NOT_DELIVERED",
  "REPORT_NOT_DELIVERED",
  "UNEXPECTED_ITEM_ERROR",
]);
export type InvalidItemCode = z.infer<typeof InvalidItemCodeSchema>;

/** The only INVALID codes that are retryable (DEC-8, M-16). */
export const RETRYABLE_INVALID_CODES: readonly InvalidItemCode[] = [
  "SEQUENCE_GAP",
  "CREATED_AFTER_ACCEPTANCE",
  "UNEXPECTED_ITEM_ERROR",
];

/**
 * Stable UPPERCASE error code (Q4). Rejections use RejectionCodeSchema; other errors
 * (for example the 404 of demo reset or a 5xx) may use other uppercase codes.
 * Up to 64 characters: format limit, not clinical.
 */
export const ErrorCodeSchema = z.string().max(64).regex(/^[A-Z][A-Z0-9_]*$/);

/** Common error format `{ statusCode, error, message, details? }` (T-005 §2.8, Q5). */
export const ApiErrorSchema = z
  .object({
    // HTTP error status 400-599: protocol range, not clinical.
    statusCode: z.number().int().gte(400).lte(599),
    error: ErrorCodeSchema,
    message: z.string().refine((text) => text.trim().length > 0, { message: "Text must not be blank" }),
    // Only Zod validation messages about the client input; never traces or internal data.
    details: z.array(z.string()).optional(),
  })
  .strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;

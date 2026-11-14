import { z } from "zod";
import {
  DirectionSchema,
  IsoDateTimeSchema,
  PositiveDbIntSchema,
  UuidSchema,
  type Direction,
} from "./common.js";
import { EnvironmentProfileIdSchema } from "./environment.js";

export const ContentKindSchema = z.enum(["MEASUREMENT", "INCIDENT_EVENT", "MESSAGE"]);
export type ContentKind = z.infer<typeof ContentKindSchema>;

/** Computed on every query from `deliverAt` vs `serverSimNow`, never stored. `QUEUED` is client-only. */
export const TransportStatusSchema = z.enum(["IN_TRANSIT", "DELIVERED"]);
export type TransportStatus = z.infer<typeof TransportStatusSchema>;

/** Assigned by the server in the same transaction as its content (T-005 §2.7). */
export const TransmissionSchema = z
  .object({
    id: UuidSchema,
    direction: DirectionSchema,
    contentKind: ContentKindSchema,
    contentId: UuidSchema,
    acceptedAtReal: IsoDateTimeSchema,
    acceptedAtSim: IsoDateTimeSchema,
    deliverAt: IsoDateTimeSchema,
    envProfile: EnvironmentProfileIdSchema,
    // 1..MAX_DB_INT: technical limit, not clinical.
    envVersion: PositiveDbIntSchema,
  })
  .strict();

export type Transmission = z.infer<typeof TransmissionSchema>;

export interface ExpectedTransmission {
  contentKind: ContentKind;
  contentId: string;
  direction?: Direction;
}

export interface TransmissionMismatch {
  path: "contentKind" | "contentId" | "direction";
  message: string;
}

/**
 * Structural coherence between a transmission and the content it carries (M-10 and Q6):
 * same `contentKind`, `contentId` equal to the content id and, when given, the expected
 * direction. Returns one entry per mismatch (empty when coherent).
 */
export function transmissionMismatches(
  transmission: Transmission,
  expected: ExpectedTransmission,
): TransmissionMismatch[] {
  const mismatches: TransmissionMismatch[] = [];
  if (transmission.contentKind !== expected.contentKind) {
    mismatches.push({ path: "contentKind", message: `contentKind must be ${expected.contentKind}` });
  }
  if (transmission.contentId !== expected.contentId) {
    mismatches.push({ path: "contentId", message: "contentId must equal the content id" });
  }
  if (expected.direction !== undefined && transmission.direction !== expected.direction) {
    mismatches.push({ path: "direction", message: `direction must be ${expected.direction}` });
  }
  return mismatches;
}

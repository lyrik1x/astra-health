import type {
  ConflictCode,
  ContentKind,
  DemoRole,
  EnvironmentProfile,
  InvalidItemCode,
  SyncItemResult,
  Transmission,
} from "@astra/contracts";

// Helpers of POST /api/sync/batch shared by every content kind (T-203, T-402/T-405).

export const MS_PER_MINUTE = 60_000;

/** The same instant for the whole batch: real now, simulated now and the current profile. */
export interface BatchContext {
  role: DemoRole;
  acceptedAtReal: Date;
  acceptedAtSim: Date;
  profile: EnvironmentProfile;
}

export interface ItemRef {
  id: string;
  kind: ContentKind;
}

/** deliverAt = acceptedAtSim + delay of the current profile, in simulated time (AGENTS.md §11). */
export function deliverAtFor(context: BatchContext): Date {
  return new Date(context.acceptedAtSim.getTime() + context.profile.oneWayDelayMinutesSim * MS_PER_MINUTE);
}

export function accepted(ref: ItemRef, transmission: Transmission): SyncItemResult {
  return { ...ref, status: "ACCEPTED", code: 201, retryable: false, transmission };
}

/** DUPLICATE always carries the ORIGINAL transmission. */
export function duplicate(ref: ItemRef, transmission: Transmission): SyncItemResult {
  return { ...ref, status: "DUPLICATE", code: 200, retryable: false, transmission };
}

export function conflict(ref: ItemRef, error: ConflictCode, message: string): SyncItemResult {
  return { ...ref, status: "CONFLICT", code: 409, retryable: false, error: { statusCode: 409, error, message } };
}

export function invalid(
  ref: ItemRef,
  error: InvalidItemCode,
  message: string,
  retryable = false,
  details?: string[],
): SyncItemResult {
  return {
    ...ref,
    status: "INVALID",
    code: 400,
    retryable,
    error: details === undefined ? { statusCode: 400, error, message } : { statusCode: 400, error, message, details },
  };
}

export function unexpected(ref: ItemRef, message = "Unexpected error processing this item"): SyncItemResult {
  return invalid(ref, "UNEXPECTED_ITEM_ERROR", message, true);
}

/** Prisma unique constraint violation (two sends of the same UUID or sequence racing). */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

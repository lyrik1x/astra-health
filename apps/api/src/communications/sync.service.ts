import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import {
  ContentKindSchema,
  SyncBatchItemSchema,
  SyncBatchResponseSchema,
  UuidSchema,
  computeSimNow,
  type ContentKind,
  type DemoRole,
  type EnvironmentProfile,
  type InvalidItemCode,
  type Measurement,
  type SyncBatchResponse,
  type SyncItemResult,
  type Transmission,
} from "@astra/contracts";
import { canonicalJson } from "../common/canonical-json.js";
import { NowProvider } from "../common/now-provider.js";
import { formatZodIssues } from "../common/zod-validation.pipe.js";
import { MeasurementsRepository } from "../measurements/measurements.repository.js";
import { toTransmission } from "../measurements/measurements.service.js";
import { EnvironmentProfileService } from "../missions/environment-profile.service.js";
import { MissionClockService } from "../missions/mission-clock.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Used in a result only when the item has no valid UUID or kind of its own, so the response
 * still matches the contract (one result per item, same order). Never stored.
 */
const UNKNOWN_ITEM_ID = "00000000-0000-0000-0000-000000000000";
const UNKNOWN_ITEM_KIND: ContentKind = "MEASUREMENT";

const MS_PER_MINUTE = 60_000;

/** The same instant for the whole batch: real now, simulated now and the current profile. */
interface BatchContext {
  role: DemoRole;
  acceptedAtReal: Date;
  acceptedAtSim: Date;
  profile: EnvironmentProfile;
}

interface ItemRef {
  id: string;
  kind: ContentKind;
}

function invalid(ref: ItemRef, error: InvalidItemCode, message: string, retryable = false, details?: string[]): SyncItemResult {
  return {
    ...ref,
    status: "INVALID",
    code: 400,
    retryable,
    error: details === undefined ? { statusCode: 400, error, message } : { statusCode: 400, error, message, details },
  };
}

function unexpected(ref: ItemRef, message = "Unexpected error processing this item"): SyncItemResult {
  return invalid(ref, "UNEXPECTED_ITEM_ERROR", message, true);
}

/** Best-effort id and kind of a raw item, for its result (the item may be invalid). */
function refOf(item: unknown): ItemRef {
  const raw = (item ?? {}) as { kind?: unknown; payload?: { id?: unknown } };
  const kind = ContentKindSchema.safeParse(raw.kind);
  const id = UuidSchema.safeParse(raw.payload?.id);
  return {
    id: id.success ? id.data : UNKNOWN_ITEM_ID,
    kind: kind.success ? kind.data : UNKNOWN_ITEM_KIND,
  };
}

/** Prisma unique constraint violation (two sends of the same UUID racing). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/** POST /api/sync/batch (T-005 §5.2). Only measurements in T-203; events and messages arrive in T-405/T-505. */
@Injectable()
export class SyncService {
  private readonly logger = new Logger("SyncService");

  constructor(
    private readonly measurements: MeasurementsRepository,
    private readonly clock: MissionClockService,
    private readonly profiles: EnvironmentProfileService,
    private readonly nowProvider: NowProvider,
    private readonly prisma: PrismaService,
  ) {}

  async processBatch(items: unknown[], role: DemoRole): Promise<SyncBatchResponse> {
    // Clock or profile missing -> 503 for the whole batch (transient for the client).
    const clock = await this.clock.getClock();
    const profile = await this.profiles.getCurrentProfile();
    const now = this.nowProvider.now();
    const serverSimNow = computeSimNow(clock, now);
    const context: BatchContext = { role, acceptedAtReal: now, acceptedAtSim: new Date(serverSimNow), profile };

    // Sequential on purpose: results keep the order of `items`, and a repeated UUID inside
    // the same batch sees the first one already stored (-> DUPLICATE or CONFLICT).
    const results: SyncItemResult[] = [];
    for (const item of items) {
      results.push(await this.processItemIsolated(item, context));
    }
    return SyncBatchResponseSchema.parse({ serverSimNow, results });
  }

  /** M-16: any unexpected error stays in this item; never a 500 for the whole batch. */
  private async processItemIsolated(item: unknown, context: BatchContext): Promise<SyncItemResult> {
    try {
      return await this.processItem(item, context);
    } catch (error) {
      this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      return unexpected(refOf(item));
    }
  }

  private async processItem(item: unknown, context: BatchContext): Promise<SyncItemResult> {
    // 1. Schema.
    const parsed = SyncBatchItemSchema.safeParse(item);
    if (!parsed.success) {
      return invalid(refOf(item), "VALIDATION_FAILED", "Invalid item", false, formatZodIssues(parsed.error));
    }
    const ref: ItemRef = { id: parsed.data.payload.id, kind: parsed.data.kind };

    if (parsed.data.kind !== "MEASUREMENT") {
      // T-405 / T-505. Retryable, so the client keeps them and resends them later.
      return unexpected(ref, "Not supported yet");
    }

    // 2. Role: MEASUREMENT only from SHIP.
    if (context.role !== "SHIP") {
      return invalid(ref, "ROLE_NOT_ALLOWED", "Only SHIP can send measurements");
    }
    return this.processMeasurement(parsed.data.payload, context);
  }

  private async processMeasurement(measurement: Measurement, context: BatchContext): Promise<SyncItemResult> {
    const ref: ItemRef = { id: measurement.id, kind: "MEASUREMENT" };

    // 3. UUID.
    const existing = await this.checkExistingUuid(measurement);
    if (existing !== null) return existing;

    // 4. Astronaut.
    const astronaut = await this.prisma.astronaut.findUnique({ where: { id: measurement.astronautId } });
    if (astronaut === null) {
      return invalid(ref, "UNKNOWN_ASTRONAUT", "Unknown astronaut");
    }

    // 5. Accept: measurement + transmission in one write. deliverAt in simulated time (§11).
    const deliverAt = new Date(context.acceptedAtSim.getTime() + context.profile.oneWayDelayMinutesSim * MS_PER_MINUTE);
    try {
      const row = await this.measurements.createWithTransmission(measurement, {
        id: randomUUID(),
        direction: "SHIP_TO_EARTH",
        contentKind: "MEASUREMENT",
        acceptedAtReal: context.acceptedAtReal,
        acceptedAtSim: context.acceptedAtSim,
        deliverAt,
        envProfile: context.profile.profile,
        envVersion: context.profile.version,
      });
      return { ...ref, status: "ACCEPTED", code: 201, retryable: false, transmission: toTransmission(row.transmission) };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another send of the same UUID won the race: check the UUID again.
      const retry = await this.checkExistingUuid(measurement);
      if (retry !== null) return retry;
      throw error;
    }
  }

  /** Same UUID: same canonical payload -> DUPLICATE with the ORIGINAL transmission; otherwise CONFLICT. */
  private async checkExistingUuid(measurement: Measurement): Promise<SyncItemResult | null> {
    const row = await this.measurements.findByIdWithTransmission(measurement.id);
    if (row === null) return null;

    const ref: ItemRef = { id: measurement.id, kind: "MEASUREMENT" };
    if (canonicalJson(measurement) === row.payloadCanonical) {
      const transmission: Transmission = toTransmission(row.transmission);
      return { ...ref, status: "DUPLICATE", code: 200, retryable: false, transmission };
    }
    return {
      ...ref,
      status: "CONFLICT",
      code: 409,
      retryable: false,
      error: { statusCode: 409, error: "UUID_CONFLICT", message: "Same UUID with different content; not overwritten" },
    };
  }
}

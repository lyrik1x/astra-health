import { z } from "zod";

/** Upper bound of a Prisma `Int` (T-005 §1, M-15). */
export const MAX_DB_INT = 2147483647;

/** ISO 8601 UTC with milliseconds and `Z` only (T-005 §1). */
const isoDateTime = z.string().datetime({ precision: 3 });

/**
 * Persisted configuration of the simulated mission clock (ARCHITECTURE §5.1, T-005 §2.2).
 * `factor` limits are technical, not clinical. T-102 may adjust this schema.
 */
export const MissionClockSchema = z
  .object({
    simEpoch: isoDateTime,
    realEpoch: isoDateTime,
    factor: z.number().finite().gt(0).lte(3600),
    clockVersion: z.number().int().gte(1).lte(MAX_DB_INT),
  })
  .strict();

export type MissionClock = z.infer<typeof MissionClockSchema>;

/**
 * Single implementation of `simNow = simEpoch + (realNow − realEpoch) × factor`
 * (ARCHITECTURE §10.3, D-23). Works in milliseconds and returns an ISO date.
 *
 * Rounding: a decimal `factor` can produce fractional simulated milliseconds.
 * They are rounded explicitly with `Math.floor` (towards −∞), so the result is
 * always a whole millisecond and never ahead of the exact value.
 *
 * Throws `RangeError` if `realNow` is an invalid date or the result is not representable.
 */
export function computeSimNow(clock: MissionClock, realNow: Date): string {
  const simEpochMs = Date.parse(clock.simEpoch);
  const realEpochMs = Date.parse(clock.realEpoch);
  const realNowMs = realNow.getTime();

  if (Number.isNaN(realNowMs)) {
    throw new RangeError("computeSimNow: realNow is not a valid date");
  }

  const elapsedSimMs = (realNowMs - realEpochMs) * clock.factor;
  const simNowMs = Math.floor(simEpochMs + elapsedSimMs);
  const simNow = new Date(simNowMs);

  if (Number.isNaN(simNow.getTime())) {
    throw new RangeError("computeSimNow: simulated time is out of range");
  }

  return simNow.toISOString();
}

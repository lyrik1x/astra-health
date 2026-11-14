import { z } from "zod";
import { IsoDateTimeSchema, PositiveDbIntSchema } from "./common.js";

/**
 * Clock factor: `> 0` and `≤ 3600` (technical limit, not clinical; T-005 §2.2).
 * In Zod 4, `z.number()` already rejects Infinity and NaN, so it is always finite.
 */
export const ClockFactorSchema = z.number().gt(0).lte(3600);

/** Persisted configuration of the simulated mission clock (ARCHITECTURE §5.1, T-005 §2.2). */
export const MissionClockSchema = z
  .object({
    simEpoch: IsoDateTimeSchema,
    realEpoch: IsoDateTimeSchema,
    factor: ClockFactorSchema,
    // 1..MAX_DB_INT, goes up on every re-anchor (technical limit, not clinical).
    clockVersion: PositiveDbIntSchema,
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

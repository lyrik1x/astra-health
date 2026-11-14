import { z } from "zod";
import { NonBlankText, NonNegativeDbIntSchema, PositiveDbIntSchema } from "./common.js";

/** Only `MARS_TRANSIT` in the MVP (T-005 §2.3). */
export const EnvironmentProfileIdSchema = z.enum(["MARS_TRANSIT"]);
export type EnvironmentProfileId = z.infer<typeof EnvironmentProfileIdSchema>;

/** `SIMULATED` until V-7 has a source; the UI labels it. */
export const DelaySourceSchema = z.enum(["SIMULATED"]);
export type DelaySource = z.infer<typeof DelaySourceSchema>;

export const EnvironmentProfileSchema = z
  .object({
    profile: EnvironmentProfileIdSchema,
    // 1..MAX_DB_INT: technical limit, not clinical.
    version: PositiveDbIntSchema,
    // One-way delay in SIMULATED minutes; 0..MAX_DB_INT is a technical limit, not clinical.
    oneWayDelayMinutesSim: NonNegativeDbIntSchema,
    delaySource: DelaySourceSchema,
    // 1-200 characters: format limit, not clinical.
    description: NonBlankText(1, 200),
  })
  .strict();

export type EnvironmentProfile = z.infer<typeof EnvironmentProfileSchema>;

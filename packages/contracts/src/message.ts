import { z } from "zod";
import {
  DirectionSchema,
  IsoDateTimeSchema,
  NonBlankText,
  PositiveDbIntSchema,
  UuidSchema,
} from "./common.js";
import { AstronautIdSchema } from "./crew.js";

/** Message of one astronaut's conversation. No `incidentId` in the MVP (DEC-7). */
export const MessageSchema = z
  .object({
    id: UuidSchema,
    astronautId: AstronautIdSchema,
    direction: DirectionSchema,
    // 1-500 characters, validated without transforming: format limit, not clinical.
    body: NonBlankText(1, 500),
    createdAtReal: IsoDateTimeSchema,
    createdAtSim: IsoDateTimeSchema,
    // 1..MAX_DB_INT: technical limit, not clinical.
    clockVersion: PositiveDbIntSchema,
  })
  .strict();

export type Message = z.infer<typeof MessageSchema>;

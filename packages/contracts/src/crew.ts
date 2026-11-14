import { z } from "zod";
import { NonBlankText } from "./common.js";

/**
 * Astronaut id: 1-40 lowercase letters, digits or hyphens (format limit, not clinical).
 * No fixed list in code (DEC-6 C): the server checks existence against `crew`.
 */
export const AstronautIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/);
export type AstronautId = z.infer<typeof AstronautIdSchema>;

export const AstronautSchema = z
  .object({
    id: AstronautIdSchema,
    // 1-60 characters: format limit, not clinical.
    displayName: NonBlankText(1, 60),
  })
  .strict();

export type Astronaut = z.infer<typeof AstronautSchema>;

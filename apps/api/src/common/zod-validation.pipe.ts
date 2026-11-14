import type { PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { ApiErrorException } from "./api-error.exception.js";

/** "items.0.value: Too small" style messages about the client input (no internal data). */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Applies a schema from @astra/contracts to a body, query or param (ARCHITECTURE §4).
 * Usage: `@Query("astronautId", new ZodValidationPipe(AstronautIdSchema))`.
 * Returns the parsed value (unknown keys already rejected by the strict schemas).
 */
export class ZodValidationPipe<Schema extends z.ZodType> implements PipeTransform<unknown, z.output<Schema>> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiErrorException(400, "VALIDATION_FAILED", "Invalid request", formatZodIssues(result.error));
    }
    return result.data;
  }
}

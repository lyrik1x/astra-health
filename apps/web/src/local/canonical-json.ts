/**
 * Keys sorted recursively, arrays keep their order: the same rule as the server
 * (apps/api/src/common/canonical-json.ts), applied to payloads already parsed by Zod.
 * Used to compare a local payload with the one the server returns (idempotency, D-22).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

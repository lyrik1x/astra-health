/**
 * Canonical JSON (S3, T-005 §5.2): object keys sorted recursively, arrays keep their order.
 * Used on payloads ALREADY parsed by Zod, so two equal payloads always give the same text
 * (idempotency comparison of T-203). Like JSON.stringify, keys with `undefined` are omitted.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

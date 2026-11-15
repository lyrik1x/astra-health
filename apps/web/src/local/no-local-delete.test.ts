import { describe, expect, it } from "vitest";

// T-202 §3.7: nothing in local/ or db/ deletes records. Pruning the outbox (only the outbox) is T-203.
const sources = import.meta.glob<string>(["./*.ts", "../db/*.ts", "!./*.test.ts", "!../db/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("local persistence never deletes", () => {
  it("scans the local sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(6);
  });

  it("has no delete, bulkDelete or clear calls", () => {
    const offenders = Object.entries(sources)
      .filter(([, code]) => /\.(delete|bulkDelete|clear)\s*\(|Dexie\.delete/.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

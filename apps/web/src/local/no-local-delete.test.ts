import { describe, expect, it } from "vitest";

// T-202 §3.7 and T-203 §4.3: nothing in local/, db/ or sync/ deletes domain records.
// The ONLY delete allowed is pruning an outbox entry (`db.outbox.delete(`) after CONFIRMED.
const sources = import.meta.glob<string>(
  ["./*.ts", "../db/*.ts", "../sync/*.ts", "!./*.test.ts", "!../db/*.test.ts", "!../sync/*.test.ts"],
  { query: "?raw", import: "default", eager: true },
);

const ALLOWED_OUTBOX_DELETE = /\bdb\.outbox\.delete\s*\(/g;
const FORBIDDEN = /\.(delete|bulkDelete|clear)\s*\(|Dexie\.delete/;

describe("local persistence never deletes", () => {
  it("scans the local and sync sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(sources).some((path) => path.startsWith("../sync/"))).toBe(true);
  });

  it("has no delete, bulkDelete or clear calls except pruning the outbox", () => {
    const offenders = Object.entries(sources)
      .filter(([, code]) => FORBIDDEN.test(code.replace(ALLOWED_OUTBOX_DELETE, "")))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("still detects a forbidden delete next to an allowed one", () => {
    const code = "await db.outbox.delete(id);\nawait db.measurements.delete(id);";
    expect(FORBIDDEN.test(code.replace(ALLOWED_OUTBOX_DELETE, ""))).toBe(true);
  });
});

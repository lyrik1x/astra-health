import { describe, expect, it } from "vitest";

// QA-412 (T-503 §3.1): the Earth console reads mission data only from the API. Neither the
// console nor the API files it uses may import src/local, src/db, src/sync or dexie.
const sources = import.meta.glob<string>(
  ["./**/*.{ts,tsx}", "../../api/*.ts", "!./**/*.test.ts", "!../../api/*.test.ts"],
  { query: "?raw", import: "default", eager: true },
);

const FORBIDDEN = /(?:from\s+|import\s*\(\s*|import\s+)["'](?:dexie(?:\/[^"']*)?|(?:\.\.?\/)+(?:local|db|sync)(?:\/[^"']*)?)["']/;

describe("Earth console sources", () => {
  it("scans the console and the API files", () => {
    const paths = Object.keys(sources);
    expect(paths.some((path) => path.endsWith("ConsolePage.tsx"))).toBe(true);
    expect(paths.some((path) => path.endsWith("api/incidents.ts"))).toBe(true);
  });

  it("detects a forbidden import (self-check of the pattern)", () => {
    expect(FORBIDDEN.test('import { db } from "../../db/ship-db";')).toBe(true);
    expect(FORBIDDEN.test('import Dexie from "dexie";')).toBe(true);
    expect(FORBIDDEN.test('import { x } from "../../local/measurements-repo";')).toBe(true);
    expect(FORBIDDEN.test('import { fetchIncidents } from "../../api/incidents";')).toBe(false);
  });

  it("never imports src/local, src/db, src/sync or dexie", () => {
    const offenders = Object.entries(sources)
      .filter(([, code]) => FORBIDDEN.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

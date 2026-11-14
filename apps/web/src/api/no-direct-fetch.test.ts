import { describe, expect, it } from "vitest";

// T-103: only api/client.ts may call fetch; everything else uses apiFetch.
const sources = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.ts", "!./client.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("API access", () => {
  it("scans the web sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(5);
  });

  it("does not call fetch directly outside api/client.ts", () => {
    const offenders = Object.entries(sources)
      .filter(([, code]) => /\bfetch\s*\(/.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

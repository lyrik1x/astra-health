import { describe, expect, it } from "vitest";
import { en } from "./en";
import { createAppI18n } from "./index";

// QA-603: every key used by the UI has English text, so no raw key reaches the screen.
const sources = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.ts", "!./en.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const KEY_PATTERN = /["'`]((?:app|banner|demoRole|nav|pages|status|api)\.[A-Za-z0-9_.]+)["'`]/g;

function usedKeys(): string[] {
  const keys = new Set<string>();
  for (const code of Object.values(sources)) {
    for (const match of code.matchAll(KEY_PATTERN)) {
      if (match[1]) keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

function flatten(tree: object, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") {
      for (const [k, v] of flatten(value as object, path)) out.set(k, v);
    } else {
      out.set(path, value);
    }
  }
  return out;
}

describe("English translations", () => {
  const leaves = flatten(en);
  const keys = usedKeys();
  const i18n = createAppI18n(null);

  it("finds the keys used in the UI", () => {
    expect(keys.length).toBeGreaterThan(20);
  });

  it("has a non-empty string for every English entry", () => {
    for (const [key, value] of leaves) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
    }
  });

  it("has English text for every key used in the UI", () => {
    const missing = keys.filter((key) => typeof leaves.get(key) !== "string");
    expect(missing).toEqual([]);
    for (const key of keys) {
      expect(i18n.t(key), key).not.toBe(key);
    }
  });
});

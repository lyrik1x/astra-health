import { describe, expect, it } from "vitest";
import { en } from "./en";
import { es } from "./es";
import { createAppI18n } from "./index";

// QA-603: every key used by the UI has text in each language, so no raw key reaches the screen.
const sources = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.ts", "!./en.ts", "!./es.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const KEY_PATTERN = /["'`]((?:app|banner|demoRole|demoReset|language|nav|pages|status|api)\.[A-Za-z0-9_.]+)["'`]/g;

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

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1] ?? "").sort();
}

// D-45 translation rule: neutral wording, no alarming labels.
const FORBIDDEN_SPANISH_WORDS = /\b(anormal\w*|riesgos?|alertas?)\b/i;

describe("Spanish translations (D-45)", () => {
  const enLeaves = flatten(en);
  const esLeaves = flatten(es);
  const keys = usedKeys();
  const i18n = createAppI18n(null);
  void i18n.changeLanguage("es");

  it("has exactly the same keys as English", () => {
    const missing = [...enLeaves.keys()].filter((key) => !esLeaves.has(key));
    const extra = [...esLeaves.keys()].filter((key) => !enLeaves.has(key));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("has a non-empty string for every Spanish entry", () => {
    for (const [key, value] of esLeaves) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
    }
  });

  it("keeps the same {{placeholders}} as English", () => {
    for (const [key, value] of enLeaves) {
      expect(placeholders(String(esLeaves.get(key))), key).toEqual(placeholders(String(value)));
    }
  });

  it("does not use alarming words", () => {
    for (const [key, value] of esLeaves) {
      expect(FORBIDDEN_SPANISH_WORDS.test(String(value)), key).toBe(false);
    }
  });

  it("has Spanish text for every key used in the UI", () => {
    expect(i18n.language).toBe("es");
    for (const key of keys) {
      expect(i18n.t(key), key).not.toBe(key);
    }
  });
});

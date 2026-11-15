import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";

/**
 * Words the body map must never show (T-606 §3.4, D-29), in English and Spanish.
 * Easy to extend: add one word per entry.
 */
const FORBIDDEN_WORDS: readonly string[] = [
  "normal",
  "abnormal",
  "high",
  "low",
  "risk",
  "alert",
  "warning",
  "danger",
  "anormal",
  "riesgo",
  "alerta",
  "peligro",
  "alto",
  "bajo",
];

/** Whole words only, ignoring case, so "below" or "follow" do not count as "low". */
function forbiddenWordsIn(text: string): string[] {
  return FORBIDDEN_WORDS.filter((word) => new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, "iu").test(text));
}

function allStrings(tree: object): string[] {
  return Object.values(tree).flatMap((value) =>
    typeof value === "string" ? [value] : value !== null && typeof value === "object" ? allStrings(value as object) : [],
  );
}

describe("pages.bodyMap texts", () => {
  it("detects forbidden words (self-check of the matcher)", () => {
    expect(forbiddenWordsIn("High value")).toEqual(["high"]);
    expect(forbiddenWordsIn("Abnormal")).toEqual(["abnormal"]);
    expect(forbiddenWordsIn("shown below, follow the list")).toEqual([]);
  });

  it.each([
    ["en", en],
    ["es", es],
  ])("contains none of the forbidden words (%s)", (_language, texts) => {
    const strings = allStrings(texts.pages.bodyMap);
    expect(strings.length).toBeGreaterThan(0);
    for (const text of strings) {
      expect(forbiddenWordsIn(text), text).toEqual([]);
    }
  });

  it("shows the required footnote and empty text", () => {
    expect(en.pages.bodyMap.footnote).toBe("Latest recorded values. Body locations are illustrative; no clinical meaning.");
    expect(en.pages.bodyMap.empty).toBe("No records yet");
  });
});

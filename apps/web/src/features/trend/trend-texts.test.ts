import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";

// T-605 §3.2 / D-29: the trend texts are neutral; no clinical or alarming words.
const FORBIDDEN_ENGLISH = /\b(normal|abnormal|high|low|risk|alert|warning)\b/i;
const FORBIDDEN_SPANISH = /\b(normal|anormal|alt[oa]s?|baj[oa]s?|riesgos?|alertas?|advertencias?)\b/i;

describe("trend texts", () => {
  it("has the footer and empty texts of the ticket", () => {
    expect(en.pages.trend.footer).toBe("Your own records over simulated mission time. No clinical ranges are shown.");
    expect(en.pages.trend.empty).toBe("Not enough records for a trend yet.");
  });

  it("uses no forbidden words in English", () => {
    for (const [key, value] of Object.entries(en.pages.trend)) {
      expect(FORBIDDEN_ENGLISH.test(value), key).toBe(false);
    }
  });

  it("uses no forbidden words in Spanish", () => {
    for (const [key, value] of Object.entries(es.pages.trend)) {
      expect(FORBIDDEN_SPANISH.test(value), key).toBe(false);
    }
  });
});

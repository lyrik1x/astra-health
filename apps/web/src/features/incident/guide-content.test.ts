import { describe, expect, it } from "vitest";
import { en } from "../../i18n/en";
import { EMERGENCY_GUIDE, GUIDE_LABEL_KEY, GUIDE_STEPS, GUIDE_VERSION } from "./guide-content";

const FORBIDDEN = /diagnos|medication|dose|normal|risk|danger/i;

/** The exact emergency text required by the ticket (it says "Emergency" on purpose). */
const EMERGENCY_TEXT =
  "Emergency guide: design pending — not operational instructions (no competent medical review)";

function lookup(key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
}

function leaves(tree: object, prefix: string): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) =>
    value !== null && typeof value === "object"
      ? leaves(value as object, `${prefix}.${key}`)
      : [[`${prefix}.${key}`, String(value)] as [string, string]],
  );
}

describe("guide content", () => {
  it("is version astra-guide-1 with the Educational prototype label", () => {
    expect(GUIDE_VERSION).toBe("astra-guide-1");
    expect(lookup(GUIDE_LABEL_KEY)).toBe("Educational prototype");
  });

  it("has exactly the three non-clinical steps with their stepId, in order", () => {
    expect(GUIDE_STEPS.map((step) => step.stepId)).toEqual(["repeat-measurement", "rest", "notify-flight-surgeon"]);
    expect(GUIDE_STEPS.map((step) => lookup(step.labelKey))).toEqual([
      "Repeat the measurement",
      "Rest",
      "Notify the flight surgeon",
    ]);
  });

  it("the emergency guide has no steps, only the design pending text", () => {
    expect(EMERGENCY_GUIDE.steps).toEqual([]);
    expect(lookup(EMERGENCY_GUIDE.textKey)).toBe(EMERGENCY_TEXT);
  });

  it("no guide text has clinical words", () => {
    const texts = [GUIDE_LABEL_KEY, ...GUIDE_STEPS.map((step) => step.labelKey)].map((key) => String(lookup(key)));
    for (const text of texts) expect(text).not.toMatch(FORBIDDEN);
    expect(EMERGENCY_TEXT).not.toMatch(FORBIDDEN);
  });

  it("no text of pages.incident has clinical words (except the exact emergency text)", () => {
    const all = leaves(en.pages.incident, "pages.incident");
    expect(all.length).toBeGreaterThan(30);
    for (const [key, text] of all) {
      if (text === EMERGENCY_TEXT) continue;
      expect(text, key).not.toMatch(FORBIDDEN);
      expect(text, key).not.toMatch(/critical|emergency detected/i);
    }
  });
});

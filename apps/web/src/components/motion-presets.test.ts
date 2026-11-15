import { describe, expect, it } from "vitest";
import { isReducedMotion, revealMotion, transitWaveMotion } from "./motion-presets";

describe("T-711 motion presets", () => {
  it("does not animate entries with reduced motion and still shows the final state", () => {
    for (const kind of ["rise", "fade"] as const) {
      const preset = revealMotion(kind, true);
      expect(preset.initial).toBe(false);
      expect(preset.animate.opacity).toBe(1);
      expect(preset.transition.duration).toBe(0);
    }
  });

  it("animates entries from transparent to fully visible without reduced motion", () => {
    const rise = revealMotion("rise", false);
    expect(rise.initial).toEqual({ opacity: 0, y: 8 });
    expect(rise.animate).toEqual({ opacity: 1, y: 0 });
    const fade = revealMotion("fade", false);
    expect(fade.initial).toEqual({ opacity: 0 });
    expect(fade.animate).toEqual({ opacity: 1 });
  });

  it("draws no transit wave with reduced motion", () => {
    expect(transitWaveMotion(true)).toBeNull();
    expect(transitWaveMotion(false)?.transition.repeat).toBe(Infinity);
  });

  it("treats an unknown motion preference as reduced", () => {
    expect(isReducedMotion(null)).toBe(true);
    expect(isReducedMotion(true)).toBe(true);
    expect(isReducedMotion(false)).toBe(false);
  });
});

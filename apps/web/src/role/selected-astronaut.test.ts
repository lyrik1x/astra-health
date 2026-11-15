import { describe, expect, it } from "vitest";
import type { StorageLike } from "../i18n/language-storage";
import {
  loadSelectedAstronaut,
  resolveAstronautId,
  saveSelectedAstronaut,
  SELECTED_ASTRONAUT_STORAGE_KEY,
} from "./selected-astronaut";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const failingStorage: StorageLike = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

const crew = [
  { id: "astro-a", displayName: "Astronaut A" },
  { id: "astro-b", displayName: "Astronaut B" },
];

describe("selected astronaut (T-605 §3.3)", () => {
  it("saves and loads the chosen astronaut", () => {
    const storage = fakeStorage();
    expect(saveSelectedAstronaut("astro-b", storage)).toBe(true);
    expect(storage.data.get(SELECTED_ASTRONAUT_STORAGE_KEY)).toBe("astro-b");
    expect(loadSelectedAstronaut(storage)).toBe("astro-b");
  });

  it("loads null when nothing was saved", () => {
    expect(loadSelectedAstronaut(fakeStorage())).toBeNull();
    expect(loadSelectedAstronaut(null)).toBeNull();
  });

  it("never throws when storage fails", () => {
    expect(loadSelectedAstronaut(failingStorage)).toBeNull();
    expect(saveSelectedAstronaut("astro-b", failingStorage)).toBe(false);
    expect(saveSelectedAstronaut("astro-b", null)).toBe(false);
  });

  it("uses the saved astronaut when it is in the crew", () => {
    expect(resolveAstronautId("astro-b", crew)).toBe("astro-b");
  });

  it("falls back to the first crew member when the saved one is missing or unknown", () => {
    expect(resolveAstronautId(null, crew)).toBe("astro-a");
    expect(resolveAstronautId("astro-gone", crew)).toBe("astro-a");
    expect(resolveAstronautId(loadSelectedAstronaut(failingStorage), crew)).toBe("astro-a");
  });

  it("gives an empty id without a crew", () => {
    expect(resolveAstronautId("astro-b", null)).toBe("");
    expect(resolveAstronautId("astro-b", [])).toBe("");
  });
});

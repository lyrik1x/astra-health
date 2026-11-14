import { describe, expect, it } from "vitest";
import { createAppI18n } from "./index";
import { LANGUAGE_STORAGE_KEY, loadLanguage, saveLanguage, type StorageLike } from "./language-storage";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const brokenStorage: StorageLike = {
  getItem: () => {
    throw new Error("storage blocked");
  },
  setItem: () => {
    throw new Error("quota exceeded");
  },
};

describe("language storage", () => {
  it("saves a language and restores it", () => {
    const storage = memoryStorage();
    expect(saveLanguage("es", storage)).toBe(true);
    expect(storage.data.get(LANGUAGE_STORAGE_KEY)).toBe("es");
    // Spanish is not supported yet; a future supported list restores it.
    expect(loadLanguage(storage, ["en", "es"])).toBe("es");
  });

  it("falls back to English for an unsupported or missing value", () => {
    const storage = memoryStorage();
    expect(loadLanguage(storage)).toBe("en");
    storage.data.set(LANGUAGE_STORAGE_KEY, "xx");
    expect(loadLanguage(storage)).toBe("en");
    expect(loadLanguage(null)).toBe("en");
  });

  it("does not throw when storage fails", () => {
    expect(loadLanguage(brokenStorage)).toBe("en");
    expect(saveLanguage("en", brokenStorage)).toBe(false);
    expect(saveLanguage("en", null)).toBe(false);
  });
});

describe("createAppI18n", () => {
  it("starts in the saved language and saves language changes", async () => {
    const storage = memoryStorage();
    storage.data.set(LANGUAGE_STORAGE_KEY, "en");
    const i18n = createAppI18n(storage);
    expect(i18n.language).toBe("en");

    storage.data.clear();
    await i18n.changeLanguage("en");
    expect(storage.data.get(LANGUAGE_STORAGE_KEY)).toBe("en");
  });

  it("works when storage is broken", () => {
    const i18n = createAppI18n(brokenStorage);
    expect(i18n.language).toBe("en");
    expect(i18n.t("app.name")).toBe("ASTRA HEALTH");
  });
});

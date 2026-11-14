/** Languages with complete texts. English only in the MVP; Spanish arrives in Phase 2. */
export const SUPPORTED_LANGUAGES = ["en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

/** S2 (T-103): the language lives in localStorage for both roles (Earth never opens Dexie). */
export const LANGUAGE_STORAGE_KEY = "astra.language";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Browser storage can be missing or blocked (private mode, disabled site data). */
export function getBrowserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Returns the saved language, or the default when nothing valid can be read. */
export function loadLanguage(
  storage: StorageLike | null = getBrowserStorage(),
  supported: readonly string[] = SUPPORTED_LANGUAGES,
): string {
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
    return saved && supported.includes(saved) ? saved : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/** Saves the language. Returns false (and never throws) when storage fails. */
export function saveLanguage(language: string, storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(LANGUAGE_STORAGE_KEY, language);
    return true;
  } catch {
    return false;
  }
}

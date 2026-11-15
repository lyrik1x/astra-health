import type { Astronaut } from "@astra/contracts";
import { getBrowserStorage, type StorageLike } from "../i18n/language-storage";

/**
 * T-605: the astronaut chosen on any ship page, kept between pages and reloads. It only picks
 * which astronaut is shown; it never changes any data. It lives in localStorage (not Dexie),
 * so it survives Reset demo.
 */
export const SELECTED_ASTRONAUT_STORAGE_KEY = "astra.selectedAstronaut";

/** Returns the saved astronaut id, or null when nothing can be read. Never throws. */
export function loadSelectedAstronaut(storage: StorageLike | null = getBrowserStorage()): string | null {
  try {
    const saved = storage?.getItem(SELECTED_ASTRONAUT_STORAGE_KEY);
    return saved ? saved : null;
  } catch {
    return null;
  }
}

/** Saves the astronaut id. Returns false (and never throws) when storage fails. */
export function saveSelectedAstronaut(astronautId: string, storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage || !astronautId) return false;
  try {
    storage.setItem(SELECTED_ASTRONAUT_STORAGE_KEY, astronautId);
    return true;
  } catch {
    return false;
  }
}

/** Pure: the saved id when it is still in the crew; otherwise the first crew member, or "". */
export function resolveAstronautId(savedId: string | null, crew: readonly Astronaut[] | null): string {
  if (savedId && crew?.some((astronaut) => astronaut.id === savedId)) return savedId;
  return crew?.[0]?.id ?? "";
}

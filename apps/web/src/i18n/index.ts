import { createInstance, type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { es } from "./es";
import { DEFAULT_LANGUAGE, getBrowserStorage, loadLanguage, saveLanguage, type StorageLike } from "./language-storage";

export const resources = { en: { translation: en }, es: { translation: es } };

function setDocumentLanguage(language: string): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }
}

/** Creates the i18n instance: restores the saved language and saves every change. */
export function createAppI18n(storage: StorageLike | null = getBrowserStorage()): I18n {
  const instance = createInstance();
  instance.use(initReactI18next);
  instance.on("languageChanged", (language: string) => {
    saveLanguage(language, storage);
    setDocumentLanguage(language);
  });
  void instance.init({
    resources,
    lng: loadLanguage(storage),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: Object.keys(resources),
    initAsync: false,
    // React already escapes interpolated values.
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}

import { useId } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../i18n/language-storage";

/**
 * EN/ES selector (D-45), shown to both roles. Changing the language saves it through
 * the i18n instance (createAppI18n → saveLanguage), so it survives a reload.
 */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const labelId = useId();
  const current = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {t("language.label")}
      </span>
      <div role="group" aria-labelledby={labelId} className="inline-flex rounded-control border border-border bg-surface p-0.5">
        {SUPPORTED_LANGUAGES.map((language) => {
          const active = language === current;
          return (
            <button
              key={language}
              type="button"
              lang={language}
              aria-pressed={active}
              onClick={() => void i18n.changeLanguage(language)}
              className={`inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium ${
                active ? "bg-accent text-on-accent" : "text-fg hover:bg-surface-raised"
              }`}
            >
              {t(`language.${language}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

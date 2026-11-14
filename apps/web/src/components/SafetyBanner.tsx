import { useTranslation } from "react-i18next";
import { InfoIcon } from "./icons";

const NOTICE_KEYS = ["banner.educational", "banner.fictionalData", "banner.simulated"] as const;

/** The three permanent notices (T-103 §2.5). Always rendered, in both roles and every section. */
export function SafetyBanner() {
  const { t } = useTranslation();
  return (
    <div role="note" aria-label={t("banner.label")} className="border-b border-border bg-surface-raised">
      <ul className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs text-fg">
        {NOTICE_KEYS.map((key) => (
          <li key={key} className="flex items-center gap-1.5">
            <InfoIcon className="size-3.5 text-accent" />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

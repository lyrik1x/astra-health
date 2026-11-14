import { useTranslation } from "react-i18next";
import { DISPLAY_STATUSES, StatusBadge } from "./StatusBadge";
import { Card } from "./ui";

/** Shows the seven states, so the demo (and reviewers) can see them all together. */
export function StatusLegend() {
  const { t } = useTranslation();
  return (
    <Card title={t("status.legendTitle")}>
      <p className="mb-4 text-sm text-fg-muted">{t("status.legendDescription")}</p>
      <ul className="flex flex-wrap gap-2">
        {DISPLAY_STATUSES.map((status) => (
          <li key={status}>
            <StatusBadge status={status} errorCode={status === "SYNC_ERROR" ? "UUID_CONFLICT" : undefined} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

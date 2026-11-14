import { useTranslation } from "react-i18next";
import { PlaceholderPage } from "../PlaceholderPage";

export function IncidentPage() {
  const { t } = useTranslation();
  return <PlaceholderPage title={t("pages.incident.title")} description={t("pages.incident.description")} />;
}

import { useTranslation } from "react-i18next";
import { PlaceholderPage } from "../PlaceholderPage";

export function RecordMeasurementPage() {
  const { t } = useTranslation();
  return (
    <PlaceholderPage title={t("pages.recordMeasurement.title")} description={t("pages.recordMeasurement.description")} />
  );
}

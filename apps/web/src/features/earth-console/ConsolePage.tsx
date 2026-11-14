import { useTranslation } from "react-i18next";
import { StatusLegend } from "../../components/StatusLegend";
import { PlaceholderPage } from "../PlaceholderPage";

/** Earth console. It reads mission data only from the API, never from IndexedDB. */
export function ConsolePage() {
  const { t } = useTranslation();
  return (
    <PlaceholderPage title={t("pages.console.title")} description={t("pages.console.description")}>
      <StatusLegend />
    </PlaceholderPage>
  );
}

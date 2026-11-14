import { useTranslation } from "react-i18next";
import { PlaceholderPage } from "../PlaceholderPage";

export function MessagesPage() {
  const { t } = useTranslation();
  return <PlaceholderPage title={t("pages.messages.title")} description={t("pages.messages.description")} />;
}

import { useTranslation } from "react-i18next";
import { PencilIcon } from "../../components/icons";
import { StatusLegend } from "../../components/StatusLegend";
import { Button } from "../../components/ui";
import type { SectionId } from "../../navigation/sections";
import { PlaceholderPage } from "../PlaceholderPage";

export function DashboardPage({ onNavigate }: { onNavigate: (section: SectionId) => void }) {
  const { t } = useTranslation();
  return (
    <PlaceholderPage title={t("pages.dashboard.title")} description={t("pages.dashboard.description")}>
      <div>
        <Button onClick={() => onNavigate("recordMeasurement")}>
          <PencilIcon className="size-4" />
          {t("pages.dashboard.recordAction")}
        </Button>
      </div>
      <StatusLegend />
    </PlaceholderPage>
  );
}

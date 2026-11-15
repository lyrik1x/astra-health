import { useTranslation } from "react-i18next";
import { ConsoleIcon, InfoIcon } from "../../components/icons";
import { StatusLegend } from "../../components/StatusLegend";
import { Card, PageHeader } from "../../components/ui";
import { IncidentCard } from "./IncidentCard";
import { MeasurementList } from "./MeasurementList";
import { useConsoleData } from "./use-console-data";

const SELECT_ID = "console-astronaut";

/**
 * Earth console (T-503). It reads mission data only from the API, never from IndexedDB (QA-412).
 * The API only returns what was already delivered to Earth (`deliverAt <= serverSimNow`).
 */
export function ConsolePage() {
  const { t } = useTranslation();
  const { crew, selectedId, selectAstronaut, snapshot, apiError, refresh } = useConsoleData();
  const hasData = snapshot !== null && (snapshot.measurements.length > 0 || snapshot.incidents.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={ConsoleIcon} title={t("pages.console.title")} description={t("pages.console.description")} />

      {apiError && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-fg-muted">
          <InfoIcon className="size-4 shrink-0" />
          <span>{t("pages.console.apiWarning")}</span>
        </p>
      )}

      <Card>
        {crew === null ? (
          <p className="text-sm text-fg-muted">{t("pages.console.loading")}</p>
        ) : crew.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("pages.console.noCrew")}</p>
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor={SELECT_ID} className="text-sm font-medium">
              {t("pages.console.astronaut")}
            </label>
            <select
              id={SELECT_ID}
              value={selectedId ?? ""}
              onChange={(change) => selectAstronaut(change.target.value)}
              className="min-h-11 w-full rounded-control border border-border bg-surface-raised px-3 text-fg sm:max-w-xs"
            >
              {crew.map((astronaut) => (
                <option key={astronaut.id} value={astronaut.id}>
                  {astronaut.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {selectedId !== null && snapshot === null && !apiError && (
        <p className="text-sm text-fg-muted">{t("pages.console.loading")}</p>
      )}

      {snapshot !== null && !hasData && (
        <Card>
          <p className="text-sm text-fg-muted">{t("pages.console.noData")}</p>
        </Card>
      )}

      {snapshot !== null && hasData && (
        <>
          <Card title={t("pages.console.incidents.title")}>
            {snapshot.incidents.length === 0 ? (
              <p className="text-sm text-fg-muted">{t("pages.console.incidents.empty")}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {snapshot.incidents.map((incident) => (
                  <IncidentCard key={incident.incidentId} incident={incident} onReviewSent={refresh} />
                ))}
              </div>
            )}
          </Card>
          <MeasurementList items={snapshot.measurements} />
        </>
      )}

      <StatusLegend />
    </div>
  );
}

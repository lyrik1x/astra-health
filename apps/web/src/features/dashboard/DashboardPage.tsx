import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Astronaut, Indicator } from "@astra/contracts";
import { GridIcon, InfoIcon, PencilIcon } from "../../components/icons";
import { Reveal } from "../../components/motion";
import { StatusBadge } from "../../components/StatusBadge";
import { StatusLegend } from "../../components/StatusLegend";
import { Button, Card, PageHeader } from "../../components/ui";
import type { LocalMeasurementRecord, LocalMissionConfig } from "../../db/schema";
import { getLocalCrew } from "../../local/crew-repo";
import { listMeasurementsLocal } from "../../local/measurements-repo";
import { getLocalMissionConfig } from "../../local/mission-config-repo";
import type { SectionId } from "../../navigation/sections";
import { BodyMap } from "../body-map/BodyMap";
import { INITIAL_SELECTION, selectIndicator, type IndicatorSelection } from "../body-map/indicator-selection";
import { loadSelectedAstronaut, resolveAstronautId, saveSelectedAstronaut } from "../../role/selected-astronaut";
import { CONTEXTS, getIndicatorDefinition } from "../measurements/indicators";
import { TrendCard } from "../trend/TrendCard";
import { displayStatusFor } from "./display-status";
import { formatMeasurementValue, formatUtcMinute } from "./format-value";

/** The list is read again with this period, so state changes show without a reload (T-204 §3.4). */
const REFRESH_MS = 2_000;

interface DashboardData {
  crew: Astronaut[] | null;
  config: LocalMissionConfig | null;
  records: LocalMeasurementRecord[];
  realNow: Date;
}

function contextLabelKey(context: LocalMeasurementRecord["context"]): string {
  return CONTEXTS.find((item) => item.context === context)?.labelKey ?? "pages.dashboard.unknownContext";
}

function MeasurementRow({ record, config, realNow }: { record: LocalMeasurementRecord; config: LocalMissionConfig | null; realNow: Date }) {
  const { t } = useTranslation();
  const definition = getIndicatorDefinition(record.indicator);
  const badges = displayStatusFor(record, config, realNow);
  return (
    // T-711: same layout and size for every value; only new rows (new id) play the soft entry.
    <Reveal
      as="li"
      className="flex flex-col gap-3 rounded-control border border-border bg-surface-raised/40 p-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-semibold tracking-wider break-words text-fg-muted uppercase">{t(definition.labelKey)}</p>
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-mono text-2xl font-semibold">{formatMeasurementValue(record.indicator, record.value)}</span>
          <span className="text-sm text-fg-muted">{t(definition.unitLabelKey)}</span>
        </p>
        <p className="text-sm text-fg-muted">{t(contextLabelKey(record.context))}</p>
        <p className="text-sm text-fg-muted">{t("pages.dashboard.capturedSim", { time: formatUtcMinute(record.capturedAtSim) })}</p>
        <p className="text-xs text-fg-muted">{t("pages.dashboard.capturedReal", { time: formatUtcMinute(record.capturedAtReal) })}</p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label={t("pages.dashboard.statusLabel")}>
        {badges.map((badge) => (
          <li key={badge.status}>
            <StatusBadge status={badge.status} errorCode={badge.errorCode} />
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

export function DashboardPage({ onNavigate }: { onNavigate: (section: SectionId) => void }) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // T-606b: the indicator chosen on the body map (or in the trend selector) also drives the trend.
  const [selection, setSelection] = useState<IndicatorSelection>(INITIAL_SELECTION);
  const choose = (indicator: Indicator) => setSelection((current) => selectIndicator(current, indicator));

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const [crew, config] = await Promise.all([getLocalCrew(), getLocalMissionConfig()]);
        const astronautId = selectedId || resolveAstronautId(loadSelectedAstronaut(), crew);
        const records = astronautId ? await listMeasurementsLocal(astronautId) : [];
        if (!active) return;
        // Most recent first: listMeasurementsLocal returns oldest first.
        setData({ crew, config, records: [...records].reverse(), realNow: new Date() });
        setLoadFailed(false);
        if (!selectedId && astronautId) setSelectedId(astronautId);
      } catch (error) {
        console.error("Could not read local measurements", error);
        if (active) setLoadFailed(true);
      }
    }
    void refresh();
    const handle = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(handle);
    };
  }, [selectedId]);

  const crew = data?.crew ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={GridIcon} title={t("pages.dashboard.title")} description={t("pages.dashboard.description")} />

      <div>
        <Button onClick={() => onNavigate("recordMeasurement")}>
          <PencilIcon className="size-4" />
          {t("pages.dashboard.recordAction")}
        </Button>
      </div>

      <Card title={t("pages.dashboard.measurementsTitle")}>
        {loadFailed && <p className="text-sm text-fg-muted">{t("pages.dashboard.loadError")}</p>}
        {!loadFailed && data === null && <p className="text-sm text-fg-muted">{t("pages.dashboard.loading")}</p>}
        {!loadFailed && data !== null && crew === null && (
          <p className="flex items-center gap-1.5 text-sm text-fg-muted">
            <InfoIcon className="size-4 shrink-0" />
            <span>{t("pages.recordMeasurement.noMissionData")}</span>
          </p>
        )}
        {!loadFailed && data !== null && crew !== null && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="dashboard-astronaut" className="text-sm font-medium">
                {t("pages.recordMeasurement.astronaut")}
              </label>
              <select
                id="dashboard-astronaut"
                className="min-h-11 w-full max-w-xs rounded-control border border-border bg-surface-raised px-3 text-fg"
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  saveSelectedAstronaut(event.target.value);
                }}
              >
                {crew.map((astronaut) => (
                  <option key={astronaut.id} value={astronaut.id}>
                    {astronaut.displayName}
                  </option>
                ))}
              </select>
            </div>
            {data.records.length === 0 ? (
              <p className="text-sm text-fg-muted">{t("pages.dashboard.empty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.records.map((record) => (
                  <MeasurementRow key={record.id} record={record} config={data.config} realNow={data.realNow} />
                ))}
              </ul>
            )}
            <BodyMap
              records={data.records}
              formatValue={formatMeasurementValue}
              config={data.config}
              realNow={data.realNow}
              selectedIndicator={selection.selected}
              onSelectIndicator={choose}
            />
          </div>
        )}
      </Card>

      {/* T-605: same 2 s read as the list above; the card never reads Dexie by itself. */}
      {!loadFailed && data !== null && crew !== null && (
        <TrendCard records={data.records} indicator={selection.trend} onIndicatorChange={choose} />
      )}

      <StatusLegend />
    </div>
  );
}

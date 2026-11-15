import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Reveal } from "../../components/motion";
import { Card } from "../../components/ui";
import type { LocalMeasurementRecord } from "../../db/schema";
import { formatMeasurementValue, formatUtcMinute } from "../dashboard/format-value";
import { getIndicatorDefinition } from "../measurements/indicators";
import { buildTrendSeries, TREND_INDICATORS, type TrendIndicator, type TrendResult } from "./build-trend-series";
import { plotTrend, TREND_VIEW } from "./trend-geometry";

type SeriesTrend = Extract<TrendResult, { kind: "series" }>;

/** One neutral color for every mark: the app accent. Nothing depends on the value. */
const LINE_COLOR = "var(--color-accent)";
const AXIS_COLOR = "var(--color-fg-muted)";

function TrendChart({ trend }: { trend: SeriesTrend }) {
  const { t } = useTranslation();
  const definition = getIndicatorDefinition(trend.indicator);
  const unit = t(definition.unitLabelKey);
  const plotted = plotTrend(trend);
  const isBloodPressure = trend.indicator === "BLOOD_PRESSURE";
  const firstSeries = trend.series[0];
  const secondSeries = trend.series[1];
  const count = firstSeries?.points.length ?? 0;
  const minText = formatMeasurementValue(trend.indicator, trend.minValue);
  const maxText = formatMeasurementValue(trend.indicator, trend.maxValue);
  const summary = t("pages.trend.summary", {
    indicator: t(definition.labelKey),
    count,
    min: minText,
    max: maxText,
    unit,
  });

  const xStart = TREND_VIEW.left;
  const xEnd = TREND_VIEW.width - TREND_VIEW.right;
  const yTop = TREND_VIEW.top;
  const yBottom = TREND_VIEW.height - TREND_VIEW.bottom;

  return (
    <div className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${TREND_VIEW.width} ${TREND_VIEW.height}`}
        className="h-auto w-full max-w-xl"
      >
        <line x1={xStart} y1={yTop} x2={xStart} y2={yBottom} stroke={AXIS_COLOR} strokeWidth={1} />
        <line x1={xStart} y1={yBottom} x2={xEnd} y2={yBottom} stroke={AXIS_COLOR} strokeWidth={1} />
        <text x={xStart - 4} y={yTop + 4} textAnchor="end" fontSize={10} fill={AXIS_COLOR}>
          {`${maxText} ${unit}`}
        </text>
        <text x={xStart - 4} y={yBottom} textAnchor="end" fontSize={10} fill={AXIS_COLOR}>
          {`${minText} ${unit}`}
        </text>
        <text x={xStart} y={TREND_VIEW.height - 8} textAnchor="start" fontSize={9} fill={AXIS_COLOR}>
          {formatUtcMinute(trend.minTime)}
        </text>
        <text x={xEnd} y={TREND_VIEW.height - 8} textAnchor="end" fontSize={9} fill={AXIS_COLOR}>
          {formatUtcMinute(trend.maxTime)}
        </text>
        {plotted.map((series) => {
          const dashed = series.seriesId === "diastolic";
          return (
            <g key={series.seriesId}>
              <path
                d={series.path}
                fill="none"
                stroke={LINE_COLOR}
                strokeWidth={2}
                strokeDasharray={dashed ? "4 3" : undefined}
              />
              {series.points.map((point) =>
                dashed ? (
                  <rect key={point.id} x={point.x - 3} y={point.y - 3} width={6} height={6} fill={LINE_COLOR} />
                ) : (
                  <circle key={point.id} cx={point.x} cy={point.y} r={3} fill={LINE_COLOR} />
                ),
              )}
            </g>
          );
        })}
      </svg>

      {isBloodPressure && (
        <p className="flex flex-wrap gap-4 text-xs text-fg-muted" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5">
            <svg width="20" height="8" viewBox="0 0 20 8">
              <line x1="0" y1="4" x2="20" y2="4" stroke={LINE_COLOR} strokeWidth={2} />
              <circle cx="10" cy="4" r="3" fill={LINE_COLOR} />
            </svg>
            {t("pages.trend.systolic")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="20" height="8" viewBox="0 0 20 8">
              <line x1="0" y1="4" x2="20" y2="4" stroke={LINE_COLOR} strokeWidth={2} strokeDasharray="4 3" />
              <rect x="7" y="1" width="6" height="6" fill={LINE_COLOR} />
            </svg>
            {t("pages.trend.diastolic")}
          </span>
        </p>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">{t("pages.trend.showData")}</summary>
        <table className="mt-2 w-full max-w-xl text-left">
          <thead className="text-fg-muted">
            <tr>
              <th scope="col" className="py-1 pr-4 font-medium">
                {t("pages.trend.columnTime")}
              </th>
              <th scope="col" className="py-1 font-medium">
                {t("pages.trend.columnValue", { unit })}
              </th>
            </tr>
          </thead>
          <tbody>
            {firstSeries?.points.map((point, index) => {
              const diastolic = secondSeries?.points[index]?.value;
              const value =
                isBloodPressure && diastolic !== undefined
                  ? formatMeasurementValue(trend.indicator, { systolic: point.value, diastolic })
                  : formatMeasurementValue(trend.indicator, point.value);
              return (
                <tr key={point.id} className="border-t border-border">
                  <td className="py-1 pr-4">{formatUtcMinute(point.capturedAtSim)}</td>
                  <td className="py-1 font-mono">{value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/**
 * T-605: simple trend of one indicator for the selected astronaut. It receives the records the
 * Dashboard already reads every 2 s; it never reads Dexie by itself, so it works offline.
 */
export interface TrendCardProps {
  records: readonly LocalMeasurementRecord[];
  /** T-606b: the Dashboard owns the indicator, so choosing one on the body map changes the trend. */
  indicator: TrendIndicator;
  onIndicatorChange: (indicator: TrendIndicator) => void;
}

export function TrendCard({ records, indicator, onIndicatorChange }: TrendCardProps) {
  const { t } = useTranslation();
  const trend = useMemo(() => buildTrendSeries(records, indicator), [records, indicator]);

  return (
    <Card title={t("pages.trend.title")}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="trend-indicator" className="text-sm font-medium">
            {t("pages.trend.indicatorLabel")}
          </label>
          <select
            id="trend-indicator"
            className="min-h-11 w-full max-w-xs rounded-control border border-border bg-surface-raised px-3 text-fg"
            value={indicator}
            onChange={(event) => onIndicatorChange(event.target.value as TrendIndicator)}
          >
            {TREND_INDICATORS.map((item) => (
              <option key={item} value={item}>
                {t(getIndicatorDefinition(item).labelKey)}
              </option>
            ))}
          </select>
        </div>
        {/* T-711: fades in again only when the indicator changes, never on the 2 s data reads. */}
        <Reveal key={indicator} kind="fade">
          {trend.kind === "empty" ? (
            <p className="text-sm text-fg-muted">{t("pages.trend.empty")}</p>
          ) : (
            <TrendChart trend={trend} />
          )}
        </Reveal>
        <p className="text-xs text-fg-muted">{t("pages.trend.footer")}</p>
      </div>
    </Card>
  );
}

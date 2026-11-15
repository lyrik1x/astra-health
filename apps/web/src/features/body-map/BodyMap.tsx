import { Component, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Indicator } from "@astra/contracts";
import { StatusBadge, type DisplayStatus } from "../../components/StatusBadge";
import type { LocalMeasurementRecord, LocalMissionConfig } from "../../db/schema";
import { formatUtcMinute } from "../dashboard/format-value";
import type { MeasurementValue } from "../measurements/build-measurement";
import { getIndicatorDefinition } from "../measurements/indicators";
import { markerColorFor, statusByIndicator, type IndicatorStatus } from "./indicator-status";
import { latestByIndicator } from "./latest-by-indicator";
import {
  BODY_ZONES,
  INDICATOR_PLACEMENTS,
  LABEL_COLUMN_WIDTH,
  LABEL_FONT_SIZE,
  LABEL_LINE_HEIGHT,
  LEFT_LABEL_X,
  MARKER_HIT_RADIUS,
  MARKER_RADIUS,
  NARROW_VIEW,
  RIGHT_LABEL_X,
  VIEW_HEIGHT,
  WIDE_VIEW,
} from "./zones";

export interface BodyMapProps {
  /** Local measurements of ONE astronaut, already loaded by the page. */
  records: readonly LocalMeasurementRecord[];
  /** Value as text, without unit (the Dashboard passes formatMeasurementValue). */
  formatValue: (indicator: Indicator, value: MeasurementValue) => string;
  /** Local config and time of the read, for the transport state (same as the Dashboard list). */
  config: Pick<LocalMissionConfig, "clock"> | null;
  realNow: Date;
  /** T-606b: highlighted indicator, and what to do when one is chosen. */
  selectedIndicator: Indicator | null;
  onSelectIndicator: (indicator: Indicator) => void;
}

/** Everything the figure and the list show for one indicator. Nothing here depends on the value's size. */
interface IndicatorView {
  indicator: Indicator;
  name: string;
  /** "72 bpm", or null when there are no records. */
  valueText: string | null;
  /** "Simulated: 2026-11-14 16:08 UTC", or the empty text. */
  detail: string;
  state: IndicatorStatus | undefined;
  statusText: string | null;
  color: string;
  ariaLabel: string;
}

function useIndicatorViews(props: BodyMapProps): Record<Indicator, IndicatorView> {
  const { t } = useTranslation();
  const latest = latestByIndicator(props.records);
  const states = statusByIndicator(latest, props.config, props.realNow);
  const views = {} as Record<Indicator, IndicatorView>;
  for (const zone of BODY_ZONES) {
    for (const indicator of zone.indicators) {
      const definition = getIndicatorDefinition(indicator);
      const name = t(definition.labelKey);
      const record = latest[indicator];
      const state = states[indicator];
      const valueText = record ? `${props.formatValue(record.indicator, record.value)} ${t(definition.unitLabelKey)}` : null;
      const statusText = state ? t(`status.${state.status}`) : null;
      const detail = record
        ? t("pages.bodyMap.capturedSim", { time: formatUtcMinute(record.capturedAtSim) })
        : t("pages.bodyMap.empty");
      const ariaLabel =
        valueText && statusText
          ? t("pages.bodyMap.selectLabel", { name, value: valueText, status: statusText })
          : t("pages.bodyMap.selectEmptyLabel", { name });
      views[indicator] = { indicator, name, valueText, detail, state, statusText, color: markerColorFor(state?.status), ariaLabel };
    }
  }
  return views;
}

/** Click, touch, Enter and Space all select. */
function selectableProps(view: IndicatorView, selected: boolean, onSelect: (indicator: Indicator) => void) {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": view.ariaLabel,
    "aria-pressed": selected,
    className: "group cursor-pointer outline-none",
    onClick: () => onSelect(view.indicator),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(view.indicator);
      }
    },
  } as const;
}

function Marker({ view, selected, onSelect }: { view: IndicatorView; selected: boolean; onSelect: (indicator: Indicator) => void }) {
  const { x, y } = INDICATOR_PLACEMENTS[view.indicator].marker;
  const status: DisplayStatus | undefined = view.state?.status;
  return (
    <g {...selectableProps(view, selected, onSelect)}>
      {/* Invisible touch area (24 units), larger than the visible dot. */}
      <circle cx={x} cy={y} r={MARKER_HIT_RADIUS} fill="transparent" />
      {status === "IN_TRANSIT" && (
        // Expanding wave only while in transit; without motion preference it is a still dot under the marker.
        <circle
          cx={x}
          cy={y}
          r={MARKER_RADIUS}
          fill={view.color}
          className="origin-center [transform-box:fill-box] motion-safe:animate-ping"
          aria-hidden="true"
        />
      )}
      {status === undefined ? (
        <circle cx={x} cy={y} r={MARKER_RADIUS} fill="var(--color-surface)" stroke={view.color} strokeWidth={1.5} strokeDasharray="2 2" />
      ) : (
        <circle cx={x} cy={y} r={MARKER_RADIUS} fill={view.color} />
      )}
      {selected && <circle cx={x} cy={y} r={MARKER_RADIUS + 4} fill="none" stroke="var(--color-accent)" strokeWidth={2} />}
      <circle
        cx={x}
        cy={y}
        r={MARKER_HIT_RADIUS - 1}
        fill="none"
        stroke="var(--color-focus)"
        strokeWidth={2}
        className="opacity-0 group-focus-visible:opacity-100"
      />
    </g>
  );
}

/** Wide layout only: label block (name, value, state, simulated date) joined to its marker by a line. */
function Label({ view, selected, onSelect }: { view: IndicatorView; selected: boolean; onSelect: (indicator: Indicator) => void }) {
  const placement = INDICATOR_PLACEMENTS[view.indicator];
  const left = placement.side === "left";
  const x = left ? LEFT_LABEL_X : RIGHT_LABEL_X;
  const lines = [view.name, view.valueText, view.statusText, view.detail].filter((line): line is string => line !== null);
  const blockHeight = 4 * LABEL_LINE_HEIGHT;
  const top = placement.labelY - blockHeight / 2;
  const firstBaseline = top + LABEL_FONT_SIZE;
  const lineEndX = left ? x + 6 : x - 6;
  // Highlight box around the label column.
  const boxX = left ? x - LABEL_COLUMN_WIDTH : x - 4;
  return (
    <g>
      <line
        x1={placement.marker.x}
        y1={placement.marker.y}
        x2={lineEndX}
        y2={placement.labelY}
        stroke={view.color}
        strokeWidth={1}
        strokeDasharray={view.state ? undefined : "3 3"}
      />
      <g {...selectableProps(view, selected, onSelect)}>
        <rect
          x={boxX}
          y={top - 4}
          width={LABEL_COLUMN_WIDTH + 4}
          height={blockHeight + 4}
          rx={6}
          fill="transparent"
          stroke={selected ? "var(--color-accent)" : "none"}
          strokeWidth={2}
        />
        <rect
          x={boxX - 3}
          y={top - 7}
          width={LABEL_COLUMN_WIDTH + 10}
          height={blockHeight + 10}
          rx={8}
          fill="none"
          stroke="var(--color-focus)"
          strokeWidth={2}
          className="opacity-0 group-focus-visible:opacity-100"
        />
        <text x={x} y={firstBaseline} textAnchor={left ? "end" : "start"} fill={view.color} fontSize={LABEL_FONT_SIZE}>
          {lines.map((line, index) => (
            <tspan key={index} x={x} dy={index === 0 ? 0 : LABEL_LINE_HEIGHT} fontWeight={index === 0 ? 600 : 400}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    </g>
  );
}

/** Generic front-facing outline made of simple shapes, stroke only, one neutral color (unchanged from T-606). */
function Silhouette() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx={360} cy={50} r={30} />
      <rect x={350} y={80} width={20} height={14} rx={4} />
      <rect x={310} y={94} width={100} height={150} rx={18} />
      <rect x={278} y={100} width={26} height={150} rx={13} />
      <rect x={416} y={100} width={26} height={150} rx={13} />
      <rect x={316} y={250} width={40} height={170} rx={16} />
      <rect x={364} y={250} width={40} height={170} rx={16} />
    </g>
  );
}

type Views = Record<Indicator, IndicatorView>;

/**
 * The figure, in one of two viewBoxes. The SVG holds buttons, so it is a labelled group: an
 * `role="img"` would hide its buttons from screen readers. The hidden copy is `display: none`,
 * so it is out of the tab order and of the accessibility tree.
 */
function Figure({ views, wide, props }: { views: Views; wide: boolean; props: BodyMapProps }) {
  const { t } = useTranslation();
  const view = wide ? WIDE_VIEW : NARROW_VIEW;
  const indicators = BODY_ZONES.flatMap((zone) => zone.indicators);
  return (
    <svg
      role="group"
      aria-label={t("pages.bodyMap.figureLabel")}
      viewBox={`${view.minX} 0 ${view.width} ${VIEW_HEIGHT}`}
      className={
        wide
          ? "hidden h-auto w-full max-w-3xl text-fg-muted @2xl:block"
          : "mx-auto block h-auto w-full max-w-60 text-fg-muted @2xl:hidden"
      }
    >
      <Silhouette />
      {wide &&
        indicators.map((indicator) => (
          <Label key={indicator} view={views[indicator]} selected={props.selectedIndicator === indicator} onSelect={props.onSelectIndicator} />
        ))}
      {indicators.map((indicator) => (
        <Marker key={indicator} view={views[indicator]} selected={props.selectedIndicator === indicator} onSelect={props.onSelectIndicator} />
      ))}
    </svg>
  );
}

function IndicatorButton({ view, selected, onSelect }: { view: IndicatorView; selected: boolean; onSelect: (indicator: Indicator) => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(view.indicator)}
      className={`flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-control border px-3 py-2 text-left ${
        selected ? "border-accent bg-surface-raised" : "border-border"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
        {view.state ? (
          <circle cx="6" cy="6" r="5" fill={view.color} />
        ) : (
          <circle cx="6" cy="6" r="4.5" fill="none" stroke={view.color} strokeWidth={1.5} strokeDasharray="2 2" />
        )}
      </svg>
      <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
        {view.name}
        {view.valueText && (
          <>
            : <span className="font-mono">{view.valueText}</span>
          </>
        )}
      </span>
      {view.state && (
        <span className="flex flex-wrap gap-1">
          {view.state.badges.map((badge) => (
            <StatusBadge key={badge.status} status={badge.status} errorCode={badge.errorCode} />
          ))}
        </span>
      )}
      <span className="min-w-0 basis-full text-fg-muted [overflow-wrap:anywhere]">{view.detail}</span>
    </button>
  );
}

function BodyMapFigure(props: BodyMapProps) {
  const { t } = useTranslation();
  const views = useIndicatorViews(props);
  const showNoTrendHint = props.selectedIndicator === "MOOD";

  return (
    <section className="@container flex min-w-0 flex-col gap-3" aria-labelledby="body-map-title">
      <h3 id="body-map-title" className="text-lg font-semibold">
        {t("pages.bodyMap.title")}
      </h3>
      <p className="text-sm text-fg-muted">{t("pages.bodyMap.selectHint")}</p>
      <Figure views={views} wide props={props} />
      <Figure views={views} wide={false} props={props} />
      {showNoTrendHint && (
        <p className="text-sm text-fg-muted" role="status">
          {t("pages.bodyMap.noTrendForMood")}
        </p>
      )}
      <ul className="flex flex-col gap-3 text-sm" aria-label={t("pages.bodyMap.listLabel")}>
        {BODY_ZONES.map((zone) => (
          <li key={zone.id}>
            <p className="font-medium">{t(zone.labelKey)}</p>
            <ul className="mt-1 flex flex-col gap-2">
              {zone.indicators.map((indicator) => (
                <li key={indicator}>
                  <IndicatorButton
                    view={views[indicator]}
                    selected={props.selectedIndicator === indicator}
                    onSelect={props.onSelectIndicator}
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t("pages.bodyMap.footnote")}</p>
    </section>
  );
}

function BodyMapUnavailable() {
  const { t } = useTranslation();
  return <p className="text-sm text-fg-muted">{t("pages.bodyMap.unavailable")}</p>;
}

/** If the figure fails, only the figure is replaced by a short note; the rest of the page keeps working. */
class BodyMapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Could not render the body map", error);
  }

  render(): ReactNode {
    return this.state.failed ? <BodyMapUnavailable /> : this.props.children;
  }
}

/**
 * Body outline with the latest recorded value of each indicator (T-606, T-606b). Marker colors show the
 * transport state of the latest record, never the value. Reads no Dexie and no API.
 */
export function BodyMap(props: BodyMapProps) {
  return (
    <BodyMapBoundary>
      <BodyMapFigure {...props} />
    </BodyMapBoundary>
  );
}

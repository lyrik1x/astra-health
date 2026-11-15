import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Indicator } from "@astra/contracts";
import type { LocalMeasurementRecord } from "../../db/schema";
import { formatUtcMinute } from "../dashboard/format-value";
import type { MeasurementValue } from "../measurements/build-measurement";
import { getIndicatorDefinition } from "../measurements/indicators";
import { latestByIndicator, type LatestByIndicator } from "./latest-by-indicator";
import { BODY_ZONES, VIEW_HEIGHT, VIEW_WIDTH, type BodyZone } from "./zones";

export interface BodyMapProps {
  /** Local measurements of ONE astronaut, already loaded by the page. */
  records: readonly LocalMeasurementRecord[];
  /** Value as text, without unit (the Dashboard passes formatMeasurementValue). */
  formatValue: (indicator: Indicator, value: MeasurementValue) => string;
}

/** Text of one indicator, shared by the SVG labels and the text list. */
interface IndicatorText {
  indicator: Indicator;
  /** "Heart rate: 72 bpm", or only the name when there are no records. */
  title: string;
  /** "Simulated: 2026-11-14 16:08 UTC", or "No records yet". */
  detail: string;
}

const LINE_HEIGHT = 17;
const INDICATOR_GAP = 8;

function useIndicatorTexts(latest: LatestByIndicator, formatValue: BodyMapProps["formatValue"]) {
  const { t } = useTranslation();
  return (indicator: Indicator): IndicatorText => {
    const definition = getIndicatorDefinition(indicator);
    const name = t(definition.labelKey);
    const record = latest[indicator];
    if (!record) {
      return { indicator, title: name, detail: t("pages.bodyMap.empty") };
    }
    return {
      indicator,
      title: `${name}: ${formatValue(record.indicator, record.value)} ${t(definition.unitLabelKey)}`,
      detail: t("pages.bodyMap.capturedSim", { time: formatUtcMinute(record.capturedAtSim) }),
    };
  };
}

/** Label block of one zone: two lines per indicator, vertically centered on the marker. */
function ZoneLabel({ zone, texts }: { zone: BodyZone; texts: IndicatorText[] }) {
  const blockHeight = texts.length * 2 * LINE_HEIGHT + (texts.length - 1) * INDICATOR_GAP;
  const top = zone.marker.y - blockHeight / 2 + LINE_HEIGHT - 4;
  const anchor = zone.label.side === "left" ? "end" : "start";
  const lineEndX = zone.label.side === "left" ? zone.label.x + 8 : zone.label.x - 8;
  return (
    <g>
      <line x1={zone.marker.x} y1={zone.marker.y} x2={lineEndX} y2={zone.marker.y} stroke="currentColor" strokeWidth={1} />
      <circle cx={zone.marker.x} cy={zone.marker.y} r={4} fill="currentColor" />
      {texts.map((text, index) => {
        const y = top + index * (2 * LINE_HEIGHT + INDICATOR_GAP);
        return (
          <text key={text.indicator} x={zone.label.x} y={y} textAnchor={anchor} fill="currentColor" fontSize={13}>
            <tspan x={zone.label.x} fontWeight={600}>
              {text.title}
            </tspan>
            <tspan x={zone.label.x} dy={LINE_HEIGHT} fontSize={12}>
              {text.detail}
            </tspan>
          </text>
        );
      })}
    </g>
  );
}

/** Generic front-facing outline made of simple shapes, stroke only, one neutral color. */
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

function BodyMapFigure({ records, formatValue }: BodyMapProps) {
  const { t } = useTranslation();
  const latest = latestByIndicator(records);
  const textFor = useIndicatorTexts(latest, formatValue);
  const zones = BODY_ZONES.map((zone) => ({ zone, texts: zone.indicators.map(textFor) }));

  return (
    <section className="flex flex-col gap-3" aria-labelledby="body-map-title">
      <h3 id="body-map-title" className="text-lg font-semibold">
        {t("pages.bodyMap.title")}
      </h3>
      <svg
        role="img"
        aria-label={t("pages.bodyMap.figureLabel")}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-auto w-full max-w-3xl text-fg-muted"
      >
        <Silhouette />
        {zones.map(({ zone, texts }) => (
          <ZoneLabel key={zone.id} zone={zone} texts={texts} />
        ))}
      </svg>
      <ul className="flex flex-col gap-2 text-sm" aria-label={t("pages.bodyMap.listLabel")}>
        {zones.map(({ zone, texts }) => (
          <li key={zone.id}>
            <p className="font-medium">{t(zone.labelKey)}</p>
            <ul className="ml-4 list-disc">
              {texts.map((text) => (
                <li key={text.indicator}>
                  {text.title} — <span className="text-fg-muted">{text.detail}</span>
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

/** Static body outline with the latest recorded value of each indicator (T-606). Reads no Dexie and no API. */
export function BodyMap(props: BodyMapProps) {
  return (
    <BodyMapBoundary>
      <BodyMapFigure {...props} />
    </BodyMapBoundary>
  );
}

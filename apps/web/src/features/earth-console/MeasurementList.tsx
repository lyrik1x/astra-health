import { useTranslation } from "react-i18next";
import type { MeasurementWithTransmission } from "@astra/contracts";
import { StatusBadge } from "../../components/StatusBadge";
import { Card } from "../../components/ui";
import { formatMeasurementValue, formatSimTime, sortMeasurements } from "./console-model";
import { CONTEXT_KEYS, INDICATOR_KEYS, UNIT_KEYS } from "./labels";

/** Delivered measurements, newest capture first, with original capture and delivery times. */
export function MeasurementList({ items }: { items: readonly MeasurementWithTransmission[] }) {
  const { t } = useTranslation();
  const sorted = sortMeasurements(items);

  return (
    <Card title={t("pages.console.measurements.title")}>
      {sorted.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("pages.console.measurements.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map(({ measurement, transmission, transportStatus }) => (
            <li key={measurement.id} className="rounded-control border border-border bg-surface-raised p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  {t(INDICATOR_KEYS[measurement.indicator])}:{" "}
                  <span>
                    {formatMeasurementValue(measurement)} {t(UNIT_KEYS[measurement.unit])}
                  </span>
                </p>
                <StatusBadge status={transportStatus} />
              </div>
              <p className="text-sm text-fg-muted">{t(CONTEXT_KEYS[measurement.context])}</p>
              <dl className="mt-2 grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-fg-muted">{t("pages.console.measurements.capturedAtSim")}</dt>
                  <dd>{formatSimTime(measurement.capturedAtSim)}</dd>
                </div>
                <div>
                  <dt className="text-fg-muted">{t("pages.console.measurements.deliverAt")}</dt>
                  <dd>{formatSimTime(transmission.deliverAt)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

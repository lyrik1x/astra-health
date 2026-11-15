import type { Measurement } from "@astra/contracts";
import { useTranslation } from "react-i18next";
import { evaluateForDisplay } from "./evaluate-for-display";
import { formatComparisonValues, formatSimulatedDate } from "./format-evaluation";

export interface EvaluationPanelProps {
  measurement: Measurement;
  history: Measurement[];
}

const COMPONENT_LABELS = {
  value: "pages.evaluation.componentValue",
  systolic: "pages.evaluation.systolic",
  diastolic: "pages.evaluation.diastolic",
} as const;

export function EvaluationPanel({ measurement, history }: EvaluationPanelProps) {
  const { t } = useTranslation();
  const evaluation = evaluateForDisplay(measurement, history);
  const { personal, clinical, usedMeasurements } = evaluation;
  const unitKey = `pages.recordMeasurement.units.${measurement.unit}`;
  const unit = t(unitKey);
  const dates = usedMeasurements.map((record) => formatSimulatedDate(record.capturedAtSim));

  return (
    <section aria-labelledby="evaluation-panel-title" className="rounded-card border border-border bg-surface p-4 md:p-6">
      <h2 id="evaluation-panel-title" className="mb-3 text-xl font-semibold">
        {t("pages.evaluation.title")}
      </h2>

      {personal.status === "COMPUTED" && (
        <div className="flex flex-col gap-3">
          {personal.components.map((component) => {
            const values = formatComparisonValues(component, measurement.unit);
            const label = t(COMPONENT_LABELS[component.component]);
            return (
              <div key={component.component}>
                <p className="font-medium">{label}</p>
                <p>
                  {values.percentage === null
                    ? t("pages.evaluation.percentageUnavailable", { ...values, unit })
                    : t("pages.evaluation.computed", { ...values, unit })}
                </p>
              </div>
            );
          })}
          <p className="text-sm text-fg-muted">
            {t("pages.evaluation.recordsUsed", { count: personal.usedCount })}
          </p>
          <p className="text-sm text-fg-muted">
            {t("pages.evaluation.simulatedDates", { dates: dates.length > 0 ? dates.join(", ") : t("pages.evaluation.noRecords") })}
          </p>
        </div>
      )}

      {personal.status === "INSUFFICIENT_DATA" && (
        <p>{t("pages.evaluation.insufficientData", { count: personal.usedCount })}</p>
      )}
      {personal.status === "NOT_APPLICABLE" && <p>{t("pages.evaluation.notApplicable")}</p>}

      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
        <p>{t("pages.evaluation.clinical", { rulesVersion: clinical.rulesVersion })}</p>
        <p>{t("pages.evaluation.guidance")}</p>
        <p className="text-xs text-fg-muted">{t("pages.evaluation.criteria")}</p>
        <p className="text-xs text-fg-muted">{t("pages.evaluation.rulesVersion", { version: personal.rulesVersion })}</p>
        <p className="text-xs text-fg-muted">{t("pages.evaluation.engineVersion", { version: personal.engineVersion })}</p>
      </div>
    </section>
  );
}

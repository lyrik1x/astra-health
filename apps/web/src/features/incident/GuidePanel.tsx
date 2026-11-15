import { useTranslation } from "react-i18next";
import { CheckIcon, InfoIcon } from "../../components/icons";
import { Button } from "../../components/ui";
import { EMERGENCY_GUIDE, GUIDE_LABEL_KEY, GUIDE_STEPS, GUIDE_VERSION } from "./guide-content";

export interface GuidePanelProps {
  completed: Set<string>;
  /** Whether "Mark as done" is offered (GUIDED). */
  canMark: boolean;
  busy: boolean;
  onMark: (stepId: string) => void;
}

/** The local guide (T-005 §6.3). Educational prototype; the emergency part is only "design pending". */
export function GuidePanel({ completed, canMark, busy, onMark }: GuidePanelProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="incident-guide-title" className="flex flex-col gap-3 rounded-control border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="incident-guide-title" className="text-lg font-semibold">
          {t("pages.incident.guide.title")}
        </h3>
        <span className="rounded-control border border-border px-2 py-0.5 text-sm font-medium">{t(GUIDE_LABEL_KEY)}</span>
        <span className="text-sm text-fg-muted">{t("pages.incident.guide.version", { version: GUIDE_VERSION })}</span>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t("pages.incident.guide.orientationTitle")}</h4>
        <ol className="flex flex-col gap-2">
          {GUIDE_STEPS.map((step, index) => {
            const done = completed.has(step.stepId);
            return (
              <li key={step.stepId} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-2">
                <span>
                  {index + 1}. {t(step.labelKey)}
                </span>
                {done ? (
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <CheckIcon className="size-4" />
                    {t("pages.incident.guide.stepDone")}
                  </span>
                ) : (
                  canMark && (
                    <Button variant="secondary" disabled={busy} onClick={() => onMark(step.stepId)}>
                      {t("pages.incident.actions.markDone")}
                    </Button>
                  )
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <p className="flex items-start gap-1.5 text-sm text-fg-muted">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <span>{t(EMERGENCY_GUIDE.textKey)}</span>
      </p>
    </section>
  );
}

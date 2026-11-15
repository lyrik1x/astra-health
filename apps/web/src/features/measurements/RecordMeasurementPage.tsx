import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Astronaut, Indicator, Measurement, MeasurementContext } from "@astra/contracts";
import { CrossCircleIcon, InfoIcon } from "../../components/icons";
import { StatusBadge } from "../../components/StatusBadge";
import { Button, Card } from "../../components/ui";
import type { LocalMissionConfig } from "../../db/schema";
import { getLocalCrew } from "../../local/crew-repo";
import {
  LocalRecordExistsError,
  listMeasurementsLocal,
  saveMeasurementLocal,
  toContractMeasurement,
} from "../../local/measurements-repo";
import { EvaluationPanel } from "../evaluation/EvaluationPanel";
import { getLocalMissionConfig } from "../../local/mission-config-repo";
import { loadSelectedAstronaut, resolveAstronautId, saveSelectedAstronaut } from "../../role/selected-astronaut";
import { validateMeasurementForm, type FieldErrors, type FieldName, type MeasurementFormValues } from "./form-validation";
import { CONTEXTS, DEFAULT_CONTEXT, INDICATORS, MOOD_VALUES, getIndicatorDefinition } from "./indicators";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  /** Crew or mission config was never downloaded (no connection yet). */
  | { status: "noMissionData" }
  | { status: "ready"; crew: Astronaut[]; config: LocalMissionConfig };

/**
 * The last measurement saved on this page. `history` stays null while it is read;
 * `historyError` only hides the comparison: the measurement itself is already saved.
 */
interface LastSaved {
  measurement: Measurement;
  history: Measurement[] | null;
  historyError: boolean;
}

/** While there is no local mission data yet, the form checks again with this period. */
const NO_DATA_RETRY_MS = 2_000;

export interface RecordMeasurementPageProps {
  /** Called after a successful local save; App.tsx asks the ship sync runner for a cycle. */
  onSaved?: () => void;
}

const FIELD_IDS: Record<Exclude<FieldName, "form">, string> = {
  astronautId: "measurement-astronaut",
  value: "measurement-value",
  systolic: "measurement-systolic",
  diastolic: "measurement-diastolic",
};

const BLOOD_PRESSURE_LABEL_KEYS = {
  systolic: "pages.recordMeasurement.systolic",
  diastolic: "pages.recordMeasurement.diastolic",
} as const;

const CONTROL_CLASS =
  "min-h-11 w-full rounded-control border bg-surface-raised px-3 text-fg disabled:cursor-not-allowed disabled:opacity-50";

function controlClass(hasError: boolean): string {
  return `${CONTROL_CLASS} ${hasError ? "border-status-error" : "border-border"}`;
}

function errorId(field: FieldName): string {
  return `measurement-${field}-error`;
}

/** Format error under a field: icon + text + color (never color alone). */
function FieldError({ field, errorKey }: { field: FieldName; errorKey: string | undefined }) {
  const { t } = useTranslation();
  if (!errorKey) return null;
  return (
    <p id={errorId(field)} className="mt-1 flex items-center gap-1.5 text-sm text-status-error">
      <CrossCircleIcon className="size-4 shrink-0" />
      <span>{t(errorKey)}</span>
    </p>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function emptyValues(astronautId: string, indicator: Indicator, context: MeasurementContext): MeasurementFormValues {
  return { astronautId, indicator, context, valueText: "", systolicText: "", diastolicText: "", mood: null };
}

export function RecordMeasurementPage({ onSaved }: RecordMeasurementPageProps) {
  const { t } = useTranslation();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [values, setValues] = useState<MeasurementFormValues>(emptyValues("", "HEART_RATE", DEFAULT_CONTEXT));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [lastSaved, setLastSaved] = useState<LastSaved | null>(null);
  const [saving, setSaving] = useState(false);

  // Local data only (downloaded by syncOnce). Without it, check again until the first sync lands.
  useEffect(() => {
    let active = true;
    let retry: number | undefined;
    function loadLocal() {
      Promise.all([getLocalCrew(), getLocalMissionConfig()])
        .then(([crew, config]) => {
          if (!active) return;
          if (crew === null || config === null) {
            setLoad({ status: "noMissionData" });
            retry = window.setTimeout(loadLocal, NO_DATA_RETRY_MS);
            return;
          }
          setLoad({ status: "ready", crew, config });
          setValues((current) => ({ ...current, astronautId: current.astronautId || resolveAstronautId(loadSelectedAstronaut(), crew) }));
        })
        .catch((error: unknown) => {
          console.error("Could not read local mission data", error);
          if (active) setLoad({ status: "error" });
        });
    }
    loadLocal();
    return () => {
      active = false;
      window.clearTimeout(retry);
    };
  }, []);

  const definition = getIndicatorDefinition(values.indicator);
  const unitLabel = t(definition.unitLabelKey);

  function update(patch: Partial<MeasurementFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    // Any new input (astronaut, indicator, context or value) hides the "captured" message and the panel.
    setLastSaved(null);
  }

  function describedBy(field: FieldName, extra?: string): string | undefined {
    const ids = [extra, errors[field] ? errorId(field) : undefined].filter(Boolean);
    return ids.length > 0 ? ids.join(" ") : undefined;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (load.status !== "ready" || saving) return;
    // The same instant is the capture time and the local save time (T-202 S3).
    const realNow = new Date();
    const result = validateMeasurementForm(values, load.config, realNow, () => crypto.randomUUID());
    if (!result.ok) {
      setErrors(result.errors);
      setLastSaved(null);
      const firstField = (Object.keys(FIELD_IDS) as Array<keyof typeof FIELD_IDS>).find((field) => result.errors[field]);
      if (firstField) document.getElementById(FIELD_IDS[firstField])?.focus();
      return;
    }
    setSaving(true);
    try {
      await saveMeasurementLocal(result.measurement, realNow);
      setErrors({});
      setValues(emptyValues(values.astronautId, values.indicator, values.context));
      // result.measurement is already the contract payload validated by Zod.
      const measurement = result.measurement;
      setLastSaved({ measurement, history: null, historyError: false });
      onSaved?.();
      void loadHistory(measurement);
    } catch (error) {
      // What was typed is kept, so the astronaut can try again.
      console.error("Could not save the measurement on the device", error);
      setErrors({
        form:
          error instanceof LocalRecordExistsError
            ? "pages.recordMeasurement.errors.alreadySaved"
            : "pages.recordMeasurement.errors.saveFailed",
      });
    } finally {
      setSaving(false);
    }
  }

  /** Reads the local history for the panel. A failure never touches the saved measurement. */
  async function loadHistory(measurement: Measurement) {
    let next: Pick<LastSaved, "history" | "historyError">;
    try {
      const records = await listMeasurementsLocal(measurement.astronautId);
      // The saved measurement is excluded by id so it is not compared with itself.
      const history = records.map(toContractMeasurement).filter((record) => record.id !== measurement.id);
      next = { history, historyError: false };
    } catch (error) {
      console.error("Could not read the local history for the comparison", error);
      next = { history: null, historyError: true };
    }
    // Only if no other measurement was started in the meantime.
    setLastSaved((current) => (current?.measurement.id === measurement.id ? { ...current, ...next } : current));
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold md:text-3xl">{t("pages.recordMeasurement.title")}</h1>
        <p className="mt-1 text-fg-muted">{t("pages.recordMeasurement.description")}</p>
      </header>

      <Card title={t("pages.recordMeasurement.formTitle")}>
        {load.status === "loading" && <p className="text-sm text-fg-muted">{t("pages.recordMeasurement.loading")}</p>}
        {load.status === "error" && (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-status-error">
            <CrossCircleIcon className="size-4 shrink-0" />
            <span>{t("pages.recordMeasurement.loadError")}</span>
          </p>
        )}
        {load.status === "noMissionData" && (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-1.5 text-sm text-fg-muted">
              <InfoIcon className="size-4 shrink-0" />
              <span>{t("pages.recordMeasurement.noMissionData")}</span>
            </p>
            <div>
              <Button type="button" disabled>
                {t("pages.recordMeasurement.submit")}
              </Button>
            </div>
          </div>
        )}
        {load.status === "ready" && load.crew.length === 0 && (
          <p className="text-sm text-fg-muted">{t("pages.recordMeasurement.noCrew")}</p>
        )}
        {load.status === "ready" && load.crew.length > 0 && (
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("pages.recordMeasurement.astronaut")} htmlFor={FIELD_IDS.astronautId}>
                <select
                  id={FIELD_IDS.astronautId}
                  className={controlClass(Boolean(errors.astronautId))}
                  value={values.astronautId}
                  aria-invalid={Boolean(errors.astronautId)}
                  aria-describedby={describedBy("astronautId")}
                  onChange={(event) => {
                    update({ astronautId: event.target.value });
                    saveSelectedAstronaut(event.target.value);
                  }}
                >
                  {load.crew.map((astronaut) => (
                    <option key={astronaut.id} value={astronaut.id}>
                      {astronaut.displayName}
                    </option>
                  ))}
                </select>
                <FieldError field="astronautId" errorKey={errors.astronautId} />
              </Field>

              <Field label={t("pages.recordMeasurement.context")} htmlFor="measurement-context">
                <select
                  id="measurement-context"
                  className={controlClass(false)}
                  value={values.context}
                  onChange={(event) => update({ context: event.target.value as MeasurementContext })}
                >
                  {CONTEXTS.map((item) => (
                    <option key={item.context} value={item.context}>
                      {t(item.labelKey)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("pages.recordMeasurement.indicator")} htmlFor="measurement-indicator">
                <select
                  id="measurement-indicator"
                  className={controlClass(false)}
                  value={values.indicator}
                  onChange={(event) => {
                    setErrors({});
                    update(emptyValues(values.astronautId, event.target.value as Indicator, values.context));
                  }}
                >
                  {INDICATORS.map((item) => (
                    <option key={item.indicator} value={item.indicator}>
                      {t(item.labelKey)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {(definition.captureKind === "INTEGER" || definition.captureKind === "DECIMAL") && (
              <Field label={t("pages.recordMeasurement.value")} htmlFor={FIELD_IDS.value}>
                <div className="flex items-center gap-2">
                  <input
                    id={FIELD_IDS.value}
                    type="text"
                    inputMode={definition.captureKind === "INTEGER" ? "numeric" : "decimal"}
                    autoComplete="off"
                    className={`${controlClass(Boolean(errors.value))} max-w-48`}
                    value={values.valueText}
                    aria-invalid={Boolean(errors.value)}
                    aria-describedby={describedBy("value", "measurement-unit")}
                    onChange={(event) => update({ valueText: event.target.value })}
                  />
                  <span id="measurement-unit" className="text-sm text-fg-muted">
                    {t("pages.recordMeasurement.unit", { unit: unitLabel })}
                  </span>
                </div>
                <FieldError field="value" errorKey={errors.value} />
              </Field>
            )}

            {definition.captureKind === "BLOOD_PRESSURE" && (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">
                  {t(definition.labelKey)} ·{" "}
                  <span id="measurement-unit" className="font-normal text-fg-muted">
                    {t("pages.recordMeasurement.unit", { unit: unitLabel })}
                  </span>
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(["systolic", "diastolic"] as const).map((component) => (
                    <Field key={component} label={t(BLOOD_PRESSURE_LABEL_KEYS[component])} htmlFor={FIELD_IDS[component]}>
                      <input
                        id={FIELD_IDS[component]}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        className={`${controlClass(Boolean(errors[component]))} max-w-48`}
                        value={component === "systolic" ? values.systolicText : values.diastolicText}
                        aria-invalid={Boolean(errors[component])}
                        aria-describedby={describedBy(component, "measurement-unit")}
                        onChange={(event) =>
                          update(
                            component === "systolic"
                              ? { systolicText: event.target.value }
                              : { diastolicText: event.target.value },
                          )
                        }
                      />
                      <FieldError field={component} errorKey={errors[component]} />
                    </Field>
                  ))}
                </div>
              </fieldset>
            )}

            {definition.captureKind === "MOOD" && (
              <fieldset
                id={FIELD_IDS.value}
                tabIndex={-1}
                className="flex flex-col gap-2"
                aria-invalid={Boolean(errors.value)}
                aria-describedby={describedBy("value", "measurement-mood-note")}
              >
                <legend className="text-sm font-medium">
                  {t("pages.recordMeasurement.mood")} · {unitLabel}
                </legend>
                <p id="measurement-mood-note" className="flex items-center gap-1.5 text-sm text-fg-muted">
                  <InfoIcon className="size-4 shrink-0" />
                  <span>{t("pages.recordMeasurement.moodNote")}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {MOOD_VALUES.map((mood) => (
                    <label
                      key={mood}
                      className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-control border px-3 has-[:checked]:bg-surface-raised has-[:checked]:font-semibold ${errors.value ? "border-status-error" : "border-border"}`}
                    >
                      <input
                        type="radio"
                        name="measurement-mood"
                        value={mood}
                        checked={values.mood === mood}
                        onChange={() => update({ mood })}
                      />
                      <span>{mood}</span>
                    </label>
                  ))}
                </div>
                <FieldError field="value" errorKey={errors.value} />
              </fieldset>
            )}

            <FieldError field="form" errorKey={errors.form} />

            <div>
              <Button type="submit" disabled={saving}>
                {t("pages.recordMeasurement.submit")}
              </Button>
            </div>

            <div role="status" aria-live="polite">
              {lastSaved && (
                <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
                  <StatusBadge status="SAVED_LOCAL" />
                  <span>{t("pages.recordMeasurement.captured")}</span>
                </p>
              )}
              {lastSaved?.historyError && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-fg-muted">
                  <InfoIcon className="size-4 shrink-0" />
                  <span>{t("pages.recordMeasurement.historyError")}</span>
                </p>
              )}
            </div>
          </form>
        )}
      </Card>

      {lastSaved?.history && <EvaluationPanel measurement={lastSaved.measurement} history={lastSaved.history} />}
    </div>
  );
}

// T-403: local guide content (T-005 §6.3, D-28/D-29). No network: everything lives in this file.
// Agents do not add, detail or reorder steps (AGENTS.md §8).

/** Version saved in GUIDE_STARTED. */
export const GUIDE_VERSION = "astra-guide-1";

/** Visible label of the guide. */
export const GUIDE_LABEL_KEY = "pages.incident.guide.educationalPrototype";

export interface GuideStep {
  stepId: string;
  labelKey: string;
}

/** Non-clinical orientation (D-29): exactly these three steps, in this order. */
export const GUIDE_STEPS: readonly GuideStep[] = [
  { stepId: "repeat-measurement", labelKey: "pages.incident.guide.steps.repeatMeasurement" },
  { stepId: "rest", labelKey: "pages.incident.guide.steps.rest" },
  { stepId: "notify-flight-surgeon", labelKey: "pages.incident.guide.steps.notifyFlightSurgeon" },
];

/**
 * Emergency guide (D-28, no competent reviewer; V-9): ONLY the "design pending" text.
 * No steps, no diagnosis and no medications.
 */
export const EMERGENCY_GUIDE: { textKey: string; steps: readonly GuideStep[] } = {
  textKey: "pages.incident.guide.emergencyPending",
  steps: [],
};

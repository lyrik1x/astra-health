import type { Measurement } from "@astra/contracts";

/** Version of the evaluation rules used for personal comparisons. */
export const PERSONAL_RULES_VERSION = "personal-1";

export type PersonalStatus = "COMPUTED" | "INSUFFICIENT_DATA" | "NOT_APPLICABLE";

export interface ComponentResult {
  component: "value" | "systolic" | "diastolic";
  value: number;
  median: number;
  absoluteDifference: number;
  percentDifference: number | null;
  percentNullReason?: "MEDIAN_IS_ZERO";
}

export interface PersonalEvaluation {
  status: PersonalStatus;
  components: ComponentResult[];
  usedRecordIds: string[];
  usedCount: number;
  criteria: {
    sameAstronaut: true;
    sameIndicator: true;
    sameUnit: true;
    sameContext: true;
    strictlyBeforeCapturedAtSim: true;
    maxRecords: 7;
    minRecords: 3;
    tieBreak: ["capturedAtSim", "capturedAtReal", "id"];
  };
  rulesVersion: "personal-1";
  engineVersion: string;
}

export interface ClinicalEvaluation {
  status: "CLINICAL_RULES_NOT_AVAILABLE";
  rulesVersion: "none";
}

export function evaluatePersonal(
  _target: Measurement,
  _history: readonly Measurement[],
): PersonalEvaluation {
  throw new Error("not implemented");
}

export function evaluateClinical(_target: Measurement): ClinicalEvaluation {
  throw new Error("not implemented");
}

/** T-101 engine version identifier. */
export const ENGINE_VERSION = "0.1.0";

export function engineVersion(): string {
  return ENGINE_VERSION;
}

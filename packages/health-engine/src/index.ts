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
  target: Measurement,
  history: readonly Measurement[],
): PersonalEvaluation {
  const comparable = history
    .filter((record) =>
      record.id !== target.id &&
      record.astronautId === target.astronautId &&
      record.indicator === target.indicator &&
      record.unit === target.unit &&
      record.context === target.context &&
      record.capturedAtSim < target.capturedAtSim,
    )
    .slice()
    .sort((left, right) =>
      left.capturedAtSim.localeCompare(right.capturedAtSim) ||
      left.capturedAtReal.localeCompare(right.capturedAtReal) ||
      left.id.localeCompare(right.id),
    )
    .slice(-7);

  const base = {
    usedRecordIds: comparable.map(({ id }) => id),
    usedCount: comparable.length,
    criteria: {
      sameAstronaut: true as const,
      sameIndicator: true as const,
      sameUnit: true as const,
      sameContext: true as const,
      strictlyBeforeCapturedAtSim: true as const,
      maxRecords: 7 as const,
      minRecords: 3 as const,
      tieBreak: ["capturedAtSim", "capturedAtReal", "id"] as ["capturedAtSim", "capturedAtReal", "id"],
    },
    rulesVersion: PERSONAL_RULES_VERSION as "personal-1",
    engineVersion: ENGINE_VERSION,
  };

  if (target.indicator === "MOOD") {
    return { ...base, status: "NOT_APPLICABLE", components: [] };
  }

  if (comparable.length < 3) {
    return { ...base, status: "INSUFFICIENT_DATA", components: [] };
  }

  const median = (values: number[]): number => {
    const sorted = values.slice().sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };

  const component = (
    name: ComponentResult["component"],
    value: number,
    historicalValues: number[],
  ): ComponentResult => {
    const componentMedian = median(historicalValues);
    const absoluteDifference = value - componentMedian;
    if (componentMedian === 0) {
      return {
        component: name,
        value,
        median: componentMedian,
        absoluteDifference,
        percentDifference: null,
        percentNullReason: "MEDIAN_IS_ZERO",
      };
    }
    return {
      component: name,
      value,
      median: componentMedian,
      absoluteDifference,
      percentDifference: (absoluteDifference / componentMedian) * 100,
    };
  };

  let components: ComponentResult[];
  if (target.indicator === "BLOOD_PRESSURE") {
    const targetValue = target.value;
    const historicalValues = (comparable as Extract<Measurement, { indicator: "BLOOD_PRESSURE" }>[])
      .map((record) => record.value);
    components = [
      component("systolic", targetValue.systolic, historicalValues.map(({ systolic }) => systolic)),
      component("diastolic", targetValue.diastolic, historicalValues.map(({ diastolic }) => diastolic)),
    ];
  } else {
    components = [
      component("value", target.value, comparable.map((record) => record.value as number)),
    ];
  }

  return { ...base, status: "COMPUTED", components };
}

export function evaluateClinical(_target: Measurement): ClinicalEvaluation {
  return { status: "CLINICAL_RULES_NOT_AVAILABLE", rulesVersion: "none" };
}

/** T-101 engine version identifier. */
export const ENGINE_VERSION = "0.1.0";

export function engineVersion(): string {
  return ENGINE_VERSION;
}

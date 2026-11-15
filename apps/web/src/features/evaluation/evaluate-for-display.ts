import type { Measurement } from "@astra/contracts";
import { evaluateClinical, evaluatePersonal, type ClinicalEvaluation, type PersonalEvaluation } from "@astra/health-engine";

export interface DisplayEvaluation {
  personal: PersonalEvaluation;
  clinical: ClinicalEvaluation;
  usedMeasurements: Measurement[];
}

/** Evaluate a captured measurement against the already-loaded local history. */
export function evaluateForDisplay(target: Measurement, history: readonly Measurement[]): DisplayEvaluation {
  const personal = evaluatePersonal(target, history);
  const clinical = evaluateClinical(target);
  const usedIds = new Set(personal.usedRecordIds);

  return {
    personal,
    clinical,
    usedMeasurements: history.filter((measurement) => usedIds.has(measurement.id)),
  };
}

import {
  computeSimNow,
  type BloodPressureValue,
  type Indicator,
  type MeasurementContext,
  type MissionConfigResponse,
  type Unit,
} from "@astra/contracts";
import { getIndicatorDefinition } from "./indicators";

export type MeasurementValue = number | BloodPressureValue;

/** What the astronaut entered, already converted to numbers. */
export interface MeasurementInput {
  astronautId: string;
  indicator: Indicator;
  context: MeasurementContext;
  value: MeasurementValue;
}

/**
 * Complete measurement object, not yet validated. It must pass MeasurementSchema
 * (see form-validation.ts) before it is saved.
 */
export interface MeasurementCandidate {
  id: string;
  astronautId: string;
  indicator: Indicator;
  value: MeasurementValue;
  unit: Unit;
  context: MeasurementContext;
  origin: "MANUAL";
  capturedAtReal: string;
  capturedAtSim: string;
  clockVersion: number;
  envProfile: MissionConfigResponse["profile"]["profile"];
  envVersion: number;
}

/**
 * Pure function: builds the measurement from the input, the mission config and the injected
 * time and id. In the app, `realNow` is `new Date()` and `newId` is `crypto.randomUUID`.
 * The simulated time comes only from computeSimNow (single implementation, D-23).
 */
export function buildMeasurement(
  input: MeasurementInput,
  config: Pick<MissionConfigResponse, "clock" | "profile">,
  realNow: Date,
  newId: () => string,
): MeasurementCandidate {
  return {
    id: newId(),
    astronautId: input.astronautId,
    indicator: input.indicator,
    value: input.value,
    unit: getIndicatorDefinition(input.indicator).unit,
    context: input.context,
    origin: "MANUAL",
    capturedAtReal: realNow.toISOString(),
    capturedAtSim: computeSimNow(config.clock, realNow),
    clockVersion: config.clock.clockVersion,
    envProfile: config.profile.profile,
    envVersion: config.profile.version,
  };
}

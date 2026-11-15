import { beforeEach, describe, expect, it } from "vitest";
import { MeasurementSchema } from "@astra/contracts";
import { buildMeasurement } from "./build-measurement";
import { devMissionConfig } from "./dev-fixtures";
import { clearCapturedMeasurements, listCapturedMeasurements, saveMeasurement } from "./measurement-store";

const REAL_NOW = new Date("2026-11-14T10:30:00.000Z");
const ID = "11111111-1111-4111-8111-111111111111";

function measurement(value: number) {
  return MeasurementSchema.parse(
    buildMeasurement({ astronautId: "sam", indicator: "HEART_RATE", context: "AT_REST", value }, devMissionConfig, REAL_NOW, () => ID),
  );
}

describe("in-memory measurement store (temporary until T-202)", () => {
  beforeEach(() => clearCapturedMeasurements());

  it("keeps a saved measurement", async () => {
    await saveMeasurement(measurement(72));
    expect(listCapturedMeasurements()).toEqual([measurement(72)]);
  });

  it("never overwrites a measurement with the same id", async () => {
    await saveMeasurement(measurement(72));
    await saveMeasurement(measurement(90));
    expect(listCapturedMeasurements()).toEqual([measurement(72)]);
  });
});

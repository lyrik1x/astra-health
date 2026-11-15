import { describe, expect, it } from "vitest";
import { MeasurementSchema, type Measurement } from "@astra/contracts";
import { evaluateClinical, evaluatePersonal } from "./index.js";

const date = (day: number) => `2026-10-${String(day).padStart(2, "0")}T08:00:00.000Z`;
const make = (suffix: string, value: number, day: number): Measurement => MeasurementSchema.parse({
  id: `c0000000-0000-4000-8000-0000000000${suffix}`, astronautId: "sam", indicator: "HEART_RATE",
  value, unit: "bpm", context: "AT_REST", origin: "MANUAL", capturedAtReal: date(day), capturedAtSim: date(day),
  clockVersion: 1, envProfile: "MARS_TRANSIT", envVersion: 1,
});

describe("evaluateClinical", () => {
  it("C1 (QA-207): reports that clinical rules are unavailable", () => {
    expect(evaluateClinical(make("ff", 80, 20))).toEqual({ status: "CLINICAL_RULES_NOT_AVAILABLE", rulesVersion: "none" });
  });

  it("C2 (QA-201): keeps clinical evaluation independent of personal history", () => {
    const target = make("ff", 80, 20);
    const personal = evaluatePersonal(target, [make("01", 70, 1), make("02", 72, 2), make("03", 68, 3)]);
    expect(personal).not.toHaveProperty("clinical");
    expect(personal).not.toHaveProperty("clinicalRules");
    expect(() => evaluateClinical(target)).not.toThrow();
  });
});

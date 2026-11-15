import { describe, expect, it } from "vitest";
import { MeasurementSchema, type Measurement } from "@astra/contracts";
import { ENGINE_VERSION, evaluatePersonal } from "./index.js";

const day = (number: number): string => `2026-10-${String(number).padStart(2, "0")}T08:00:00.000Z`;
const id = (suffix: string): string => `c0000000-0000-4000-8000-0000000000${suffix}`;

function m(number: number | "ff", overrides: Record<string, unknown> = {}): Measurement {
  const capturedAtSim = day(number === "ff" ? 20 : number);
  return MeasurementSchema.parse({
    id: id(String(number).padStart(2, "0")), astronautId: "sam", indicator: "HEART_RATE",
    value: 70, unit: "bpm", context: "AT_REST", origin: "MANUAL",
    capturedAtReal: capturedAtSim, capturedAtSim, clockVersion: 1,
    envProfile: "MARS_TRANSIT", envVersion: 1, ...overrides,
  });
}

const hr = (number: number | "ff", value: number, overrides: Record<string, unknown> = {}) =>
  m(number, { value, ...overrides });
const values = (list: number[], start = 1) => list.map((value, index) => hr(start + index, value));
const target = (value: number, overrides: Record<string, unknown> = {}) => hr("ff", value, overrides);
const ids = (numbers: Array<number | "ff">) => numbers.map((number) => id(String(number).padStart(2, "0")));

describe("evaluatePersonal", () => {
  it("E1 (QA-202): returns insufficient data with no history", () => {
    const result = evaluatePersonal(target(80), []);
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.components).toEqual([]);
    expect(result.usedRecordIds).toEqual([]);
    expect(result.usedCount).toBe(0);
  });

  it("E2 (QA-202): returns the two comparable IDs when data is insufficient", () => {
    const result = evaluatePersonal(target(80), values([68, 72]));
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.usedRecordIds).toEqual(ids([1, 2]));
  });

  it("E3 (QA-203): computes an odd three-record median", () => {
    const result = evaluatePersonal(target(80), values([70, 72, 68]));
    expect(result.status).toBe("COMPUTED");
    expect(result.components[0]).toMatchObject({ component: "value", value: 80, median: 70, absoluteDifference: 10 });
    expect(result.components[0].percentDifference).toBeCloseTo(14.285714285714285, 10);
    expect(result.usedCount).toBe(3);
  });

  it("E4 (QA-203): computes the even median for the demo data", () => {
    const result = evaluatePersonal(target(80), values([68, 72, 70, 75, 66, 71]));
    expect(result.components[0].median).toBe(70.5);
    expect(result.components[0].absoluteDifference).toBe(9.5);
    expect(result.components[0].percentDifference).toBeCloseTo(13.47517730496454, 10);
  });

  it("E5: uses only the seven most recent comparable records", () => {
    const result = evaluatePersonal(target(80), values([60, 61, 62, 63, 64, 65, 66, 67, 68]));
    expect(result.usedRecordIds).toEqual(ids([3, 4, 5, 6, 7, 8, 9]));
    expect(result.components[0].median).toBe(65);
    expect(result.components[0].absoluteDifference).toBe(15);
    expect(result.components[0].percentDifference).toBeCloseTo(23.076923076923077, 10);
  });

  it("E6: preserves a negative signed difference and percentage", () => {
    const result = evaluatePersonal(target(63), values([70, 72, 68]));
    expect(result.components[0].median).toBe(70);
    expect(result.components[0].absoluteDifference).toBe(-7);
    expect(result.components[0].percentDifference).toBe(-10);
  });

  it("E7 (QA-205): excludes future and simultaneous records", () => {
    const history = [...values([70, 70, 70]), hr(4, 200, { capturedAtSim: day(21) }),
      hr(5, 150, { capturedAtSim: day(20) })];
    const result = evaluatePersonal(target(80), history);
    expect(result.usedRecordIds).toEqual(ids([1, 2, 3]));
    expect(result.components[0].median).toBe(70);
    expect(result.components[0].absoluteDifference).toBe(10);
  });

  it("E8: never uses the target even when it is in history", () => {
    const ownTarget = target(80);
    const result = evaluatePersonal(ownTarget, [...values([70, 70, 70]), ownTarget]);
    expect(result.usedRecordIds).not.toContain(id("ff"));
    expect(result.usedCount).toBe(3);
  });

  it("E9 (QA-204): does not mix astronaut, indicator, or context", () => {
    const history = [...values([70, 72, 68]), hr(4, 120, { context: "AFTER_EXERCISE" }),
      hr(5, 50, { astronautId: "alex" }),
      m(6, { indicator: "BODY_TEMPERATURE", unit: "degC", value: 36.6 })];
    const result = evaluatePersonal(target(80), history);
    expect(result.usedRecordIds).toEqual(ids([1, 2, 3]));
    expect(result.components[0].median).toBe(70);
  });

  it("E10 (QA-204): leaves only two matching records after context filtering", () => {
    const history = [...values([70, 72]), ...values([70, 72, 68], 3).map((record) => ({ ...record, context: "AFTER_EXERCISE" as const }))];
    const result = evaluatePersonal(target(80), history);
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.usedRecordIds).toEqual(ids([1, 2]));
  });

  it("E11: breaks equal simulation times by capturedAtReal", () => {
    const history = [hr(1, 1000, { capturedAtSim: day(1), capturedAtReal: day(1) }),
      hr(2, 20, { capturedAtSim: day(1), capturedAtReal: "2026-10-01T09:00:00.000Z" }),
      ...values([40, 50, 60, 70, 80, 90], 3)];
    const result = evaluatePersonal(target(100), history);
    expect(result.usedRecordIds).toEqual(ids([2, 3, 4, 5, 6, 7, 8]));
    expect(result.components[0].median).toBe(60);
    expect(result.components[0].absoluteDifference).toBe(40);
    expect(result.components[0].percentDifference).toBeCloseTo(66.66666666666666, 10);
  });

  it("E12: breaks equal simulation and real times by ID", () => {
    const history = [hr(1, 1000, { capturedAtSim: day(1), capturedAtReal: day(1) }),
      hr(2, 20, { capturedAtSim: day(1), capturedAtReal: day(1) }), ...values([40, 50, 60, 70, 80, 90], 3)];
    const result = evaluatePersonal(target(100), history);
    expect(result.usedRecordIds).toEqual(ids([2, 3, 4, 5, 6, 7, 8]));
    expect(result.components[0].median).toBe(60);
  });

  it("E13: reports a null percentage when the median is zero", () => {
    const history = [1, 2, 3].map((number) => m(number, { indicator: "SLEEP", unit: "h", value: 0 }));
    const result = evaluatePersonal(m("ff", { indicator: "SLEEP", unit: "h", value: 7.5 }), history);
    expect(result.status).toBe("COMPUTED");
    expect(result.components[0]).toMatchObject({ median: 0, absoluteDifference: 7.5, percentDifference: null, percentNullReason: "MEDIAN_IS_ZERO" });
  });

  it("E14: does not round differences or percentages", () => {
    const history = [36.6, 36.7, 36.8].map((value, index) => m(index + 1, { indicator: "BODY_TEMPERATURE", unit: "degC", value }));
    const result = evaluatePersonal(m("ff", { indicator: "BODY_TEMPERATURE", unit: "degC", value: 37.0 }), history);
    expect(result.components[0].median).toBe(36.7);
    expect(result.components[0].absoluteDifference).toBe(37.0 - 36.7);
    expect(result.components[0].percentDifference).toBe((37.0 - 36.7) / 36.7 * 100);
  });

  it("E15 (QA-203): evaluates blood pressure components in order", () => {
    const history = [[120, 80], [118, 76], [122, 84]].map(([systolic, diastolic], index) =>
      m(index + 1, { indicator: "BLOOD_PRESSURE", unit: "mmHg", value: { systolic, diastolic } }));
    const result = evaluatePersonal(m("ff", { indicator: "BLOOD_PRESSURE", unit: "mmHg", value: { systolic: 130, diastolic: 90 } }), history);
    expect(result.components.map(({ component }) => component)).toEqual(["systolic", "diastolic"]);
    expect(result.components[0]).toMatchObject({ median: 120, absoluteDifference: 10 });
    expect(result.components[0].percentDifference).toBeCloseTo(8.333333333333332, 10);
    expect(result.components[1]).toMatchObject({ median: 80, absoluteDifference: 10, percentDifference: 12.5 });
  });

  it("E16 (QA-208): does not calculate a median for mood with history", () => {
    const history = [3, 4, 2, 5].map((value, index) => m(index + 1, { indicator: "MOOD", unit: "scale_1_5", value }));
    const result = evaluatePersonal(m("ff", { indicator: "MOOD", unit: "scale_1_5", value: 3 }), history);
    expect(result.status).toBe("NOT_APPLICABLE");
    expect(result.components).toEqual([]);
    expect(result.usedRecordIds).toEqual(ids([1, 2, 3, 4]));
  });

  it("E17 (QA-208): mood without history is not applicable", () => {
    const result = evaluatePersonal(m("ff", { indicator: "MOOD", unit: "scale_1_5", value: 3 }), []);
    expect(result.status).toBe("NOT_APPLICABLE");
  });

  it("E18 (QA-206): includes rules, engine version, and exact criteria", () => {
    const result = evaluatePersonal(target(80), values([68, 72, 70, 75, 66, 71]));
    expect(result.rulesVersion).toBe("personal-1");
    expect(result.engineVersion).toBe(ENGINE_VERSION);
    expect(result.criteria).toEqual({ sameAstronaut: true, sameIndicator: true, sameUnit: true, sameContext: true,
      strictlyBeforeCapturedAtSim: true, maxRecords: 7, minRecords: 3,
      tieBreak: ["capturedAtSim", "capturedAtReal", "id"] });
  });

  it("E19 (QA-206): keeps personal evaluation language neutral", () => {
    const results = [evaluatePersonal(target(80), values([70, 72, 68])),
      evaluatePersonal(m("ff", { indicator: "SLEEP", unit: "h", value: 7.5 }), [1, 2, 3].map((n) => m(n, { indicator: "SLEEP", unit: "h", value: 0 }))),
      evaluatePersonal(m("ff", { indicator: "MOOD", unit: "scale_1_5", value: 3 }), [3, 4, 2, 5].map((value, index) => m(index + 1, { indicator: "MOOD", unit: "scale_1_5", value })))];
    for (const result of results) {
      expect(JSON.stringify(result)).not.toMatch(/abnormal|normal|risk|alert|danger|warning|high|low/i);
    }
  });

  it("E20: is deterministic and does not mutate frozen, reordered input", () => {
    const history = values([60, 61, 62, 63, 64, 65, 66, 67, 68]);
    const expected = evaluatePersonal(target(80), history);
    const frozen = Object.freeze([...history].reverse().map((record) => Object.freeze(record)));
    expect(() => evaluatePersonal(target(80), frozen)).not.toThrow();
    expect(evaluatePersonal(target(80), frozen)).toEqual(expected);
  });

  it("E21 (T-709): with equal capturedAtSim, capturedAtReal decides before id", () => {
    const history = [hr(1, 20, { capturedAtSim: day(1), capturedAtReal: "2026-10-01T09:00:00.000Z" }),
      hr(2, 1000, { capturedAtSim: day(1), capturedAtReal: day(1) }),
      ...values([40, 50, 60, 70, 80, 90], 3)];
    const result = evaluatePersonal(target(100), history);
    expect(result.usedRecordIds).toEqual(ids([1, 3, 4, 5, 6, 7, 8]));
    expect(result.components[0].median).toBe(60);
  });

  it("E22 (T-709): with both times equal, id decides regardless of input order", () => {
    const history = [...values([40, 50, 60, 70, 80, 90], 3),
      hr(2, 20, { capturedAtSim: day(1), capturedAtReal: day(1) }),
      hr(1, 1000, { capturedAtSim: day(1), capturedAtReal: day(1) })].reverse();
    const result = evaluatePersonal(target(100), history);
    expect(result.usedRecordIds).toEqual(ids([2, 3, 4, 5, 6, 7, 8]));
    expect(result.components[0].median).toBe(60);
  });

  it("E23 (T-709): orders ids by character code, so \"B\" < \"a\"", () => {
    const upper = id("0B");
    const lower = id("0a");
    const history = [hr(1, 20, { id: lower, capturedAtSim: day(1), capturedAtReal: day(1) }),
      hr(2, 1000, { id: upper, capturedAtSim: day(1), capturedAtReal: day(1) }),
      ...values([40, 50, 60, 70, 80, 90], 3)];
    const result = evaluatePersonal(target(100), history);
    expect(result.usedRecordIds).toEqual([lower, ...ids([3, 4, 5, 6, 7, 8])]);
    expect(result.components[0].median).toBe(60);
  });
});

import { describe, expect, it } from "vitest";
import type { Measurement } from "@astra/contracts";
import { en } from "../../i18n/en";
import { evaluateForDisplay } from "./evaluate-for-display";
import { formatComparisonValues, formatMedian, formatPercentage, formatSignedDifference } from "./format-evaluation";

const prohibitedWords = /\b(normal|abnormal|high|low|risk|alert|danger|warning)\b/i;

function measurement(id: number, value: number, overrides: Partial<Measurement> = {}): Measurement {
  const base: Measurement = {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    astronautId: "sam",
    indicator: "HEART_RATE",
    value,
    unit: "bpm",
    context: "AT_REST",
    origin: "MANUAL",
    capturedAtReal: `2026-10-${String(id).padStart(2, "0")}T00:00:00.000Z`,
    capturedAtSim: `2026-10-${String(id).padStart(2, "0")}T00:00:00.000Z`,
    clockVersion: 1,
    envProfile: "MARS_TRANSIT",
    envVersion: 1,
  };
  return { ...base, ...overrides } as Measurement;
}

describe("evaluateForDisplay", () => {
  it("evaluates Sam's demo history against the new measurement", () => {
    const history = [68, 72, 70, 75, 66, 71].map((value, index) => measurement(index + 1, value));
    const target = measurement(7, 80);
    const result = evaluateForDisplay(target, history);
    const component = result.personal.components[0];

    expect(result.personal.status).toBe("COMPUTED");
    expect(component).toMatchObject({ median: 70.5, absoluteDifference: 9.5, percentDifference: expect.closeTo(13.4751773, 5) });
    expect(formatComparisonValues(component, "bpm")).toEqual({ difference: "+9.5", median: "71", percentage: "+13.5%" });
    expect(result.usedMeasurements.map(({ id }) => id)).toEqual(history.map(({ id }) => id));
  });

  it("returns the engine's statuses for insufficient history and mood", () => {
    const insufficient = evaluateForDisplay(measurement(4, 80), [measurement(1, 68), measurement(2, 72)]);
    expect(insufficient.personal).toMatchObject({ status: "INSUFFICIENT_DATA", usedCount: 2 });

    const mood: Measurement = measurement(3, 3, { indicator: "MOOD", unit: "scale_1_5", value: 3 });
    expect(evaluateForDisplay(mood, []).personal.status).toBe("NOT_APPLICABLE");
  });

  it("calculates blood pressure components independently", () => {
    const history = [120, 122, 126].map((systolic, index) => measurement(index + 1, 0, {
      indicator: "BLOOD_PRESSURE",
      unit: "mmHg",
      value: { systolic, diastolic: [80, 82, 84][index] },
    }));
    const target = measurement(4, 0, { indicator: "BLOOD_PRESSURE", unit: "mmHg", value: { systolic: 130, diastolic: 90 } });
    const result = evaluateForDisplay(target, history);

    expect(result.personal.components.map(({ component, median, absoluteDifference }) => ({ component, median, absoluteDifference }))).toEqual([
      { component: "systolic", median: 122, absoluteDifference: 8 },
      { component: "diastolic", median: 82, absoluteDifference: 8 },
    ]);
  });

  it("does not mutate or include unrelated history", () => {
    const target = measurement(7, 80);
    const history = [measurement(1, 68), measurement(2, 72), measurement(3, 70), measurement(4, 75, { astronautId: "alex" })];
    const original = [...history];
    expect(evaluateForDisplay(target, history).usedMeasurements).toEqual(history.slice(0, 3));
    expect(history).toEqual(original);
  });
});

describe("evaluation formatting", () => {
  it("rounds medians according to T-005 §3.1 and differences to one signed decimal", () => {
    expect(formatMedian(70.5, "bpm")).toBe("71");
    expect(formatMedian(36.65, "degC")).toBe("36.6");
    expect(formatMedian(99.5, "mg_dL")).toBe("100");
    expect(formatMedian(120.5, "mmHg")).toBe("121");
    expect(formatMedian(7.25, "h")).toBe("7.3");
    expect(formatSignedDifference(9.49)).toBe("+9.5");
    expect(formatSignedDifference(-9.49)).toBe("-9.5");
    expect(formatPercentage(13.475)).toBe("+13.5%");
  });

  it("formats percentage null for a zero median without inventing a percentage", () => {
    expect(formatComparisonValues({
      component: "value",
      value: 2,
      median: 0,
      absoluteDifference: 2,
      percentDifference: null,
      percentNullReason: "MEDIAN_IS_ZERO",
    }, "bpm")).toEqual({ difference: "+2.0", median: "0", percentage: null });
  });

  it("keeps all evaluation UI copy free of prohibited labels", () => {
    const copy = Object.values(en.pages.evaluation).filter((value): value is string => typeof value === "string");
    const generated = [
      ...copy,
      "+9.5 bpm (+13.5%) compared with your personal median of 71 bpm",
      "+2.0 bpm compared with your personal median of 0 bpm; percentage not available (median is 0)",
      "Not enough comparable history (2 of 3 records needed)",
      "Mood is shown as history only; no comparison is made",
    ];
    expect(generated.filter((text) => prohibitedWords.test(text))).toEqual([]);
  });
});

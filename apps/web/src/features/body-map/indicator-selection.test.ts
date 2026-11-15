import { describe, expect, it } from "vitest";
import { TREND_INDICATORS } from "../trend/build-trend-series";
import { INITIAL_SELECTION, selectIndicator, trendIndicatorFor } from "./indicator-selection";

describe("indicator selection", () => {
  it("starts with nothing highlighted and the Heart rate trend", () => {
    expect(INITIAL_SELECTION).toEqual({ selected: null, trend: "HEART_RATE" });
  });

  it.each(TREND_INDICATORS)("selecting %s highlights it and changes the trend", (indicator) => {
    expect(selectIndicator(INITIAL_SELECTION, indicator)).toEqual({ selected: indicator, trend: indicator });
  });

  it("Mood is highlighted but never becomes the trend indicator", () => {
    const before = { selected: "SLEEP" as const, trend: "SLEEP" as const };
    expect(selectIndicator(before, "MOOD")).toEqual({ selected: "MOOD", trend: "SLEEP" });
    expect(trendIndicatorFor("MOOD")).toBeNull();
  });

  it("does not change the input state", () => {
    const before = { selected: null, trend: "HEART_RATE" as const };
    selectIndicator(before, "BLOOD_GLUCOSE");
    expect(before).toEqual({ selected: null, trend: "HEART_RATE" });
  });
});

import { describe, expect, it } from "vitest";
import { SECTIONS_BY_ROLE } from "./sections";

describe("sections by role", () => {
  it("gives the ship its four sections", () => {
    expect(SECTIONS_BY_ROLE.SHIP).toEqual(["dashboard", "recordMeasurement", "incident", "messages"]);
  });

  it("gives Earth only the console", () => {
    expect(SECTIONS_BY_ROLE.EARTH).toEqual(["console"]);
  });
});

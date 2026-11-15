import { describe, expect, it } from "vitest";
import { SECTIONS_BY_ROLE } from "./sections";

describe("sections by role", () => {
  it("gives the ship its three sections, without messages (T-605)", () => {
    expect(SECTIONS_BY_ROLE.SHIP).toEqual(["dashboard", "recordMeasurement", "incident"]);
    expect(SECTIONS_BY_ROLE.SHIP).not.toContain("messages");
  });

  it("gives Earth only the console", () => {
    expect(SECTIONS_BY_ROLE.EARTH).toEqual(["console"]);
  });
});

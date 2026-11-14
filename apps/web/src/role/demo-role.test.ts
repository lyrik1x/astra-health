import { describe, expect, it } from "vitest";
import { DEFAULT_DEMO_ROLE, buildRoleSearch, resolveDemoRole } from "./demo-role";

describe("resolveDemoRole", () => {
  it("reads ?role=ship as SHIP", () => {
    expect(resolveDemoRole("?role=ship")).toEqual({ role: "SHIP" });
  });

  it("reads ?role=earth as EARTH", () => {
    expect(resolveDemoRole("?role=earth")).toEqual({ role: "EARTH" });
  });

  it("falls back to the declared default when the role is absent", () => {
    expect(DEFAULT_DEMO_ROLE).toBe("SHIP");
    expect(resolveDemoRole("")).toEqual({ role: "SHIP" });
    expect(resolveDemoRole("?other=1")).toEqual({ role: "SHIP" });
  });

  it("falls back to the default and reports an invalid value", () => {
    expect(resolveDemoRole("?role=admin")).toEqual({ role: "SHIP", invalidValue: "admin" });
  });
});

describe("buildRoleSearch", () => {
  it("writes the role in lowercase and keeps other parameters", () => {
    expect(buildRoleSearch("?debug=1&role=ship", "EARTH")).toBe("?debug=1&role=earth");
    expect(buildRoleSearch("", "SHIP")).toBe("?role=ship");
  });
});

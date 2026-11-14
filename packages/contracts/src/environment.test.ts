import { describe, expect, it } from "vitest";
import { EnvironmentProfileSchema } from "./index.js";
import { parses, profile } from "./test-fixtures.js";

describe("EnvironmentProfileSchema", () => {
  it("accepts MARS_TRANSIT with a SIMULATED delay", () => {
    expect(parses(EnvironmentProfileSchema, profile)).toBe(true);
    expect(parses(EnvironmentProfileSchema, { ...profile, oneWayDelayMinutesSim: 0 })).toBe(true);
  });

  it("rejects other profiles, delay sources and invalid numbers", () => {
    expect(parses(EnvironmentProfileSchema, { ...profile, profile: "LUNAR_SURFACE" })).toBe(false);
    expect(parses(EnvironmentProfileSchema, { ...profile, delaySource: "MEASURED" })).toBe(false);
    expect(parses(EnvironmentProfileSchema, { ...profile, version: 0 })).toBe(false);
    expect(parses(EnvironmentProfileSchema, { ...profile, oneWayDelayMinutesSim: -1 })).toBe(false);
    expect(parses(EnvironmentProfileSchema, { ...profile, oneWayDelayMinutesSim: 1.5 })).toBe(false);
  });

  it("rejects a blank or too long description and unknown keys", () => {
    expect(parses(EnvironmentProfileSchema, { ...profile, description: " " })).toBe(false);
    expect(parses(EnvironmentProfileSchema, { ...profile, description: "a".repeat(201) })).toBe(false);
    expect(parses(EnvironmentProfileSchema, { ...profile, source: "NASA" })).toBe(false);
  });
});

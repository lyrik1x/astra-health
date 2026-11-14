import { describe, expect, it } from "vitest";
import { engineVersion } from "./index.js";

describe("engineVersion", () => {
  it("returns the engine version string", () => {
    expect(engineVersion()).toBe("0.1.0");
  });
});

import { loadConfig } from "../src/config.js";
import { TEST_ENV } from "./create-test-app.js";

describe("loadConfig BODY_LIMIT", () => {
  it("reads BODY_LIMIT", () => {
    expect(loadConfig(TEST_ENV).bodyLimit).toBe("1mb");
    expect(loadConfig({ ...TEST_ENV, BODY_LIMIT: "512kb" }).bodyLimit).toBe("512kb");
  });

  it("fails fast when BODY_LIMIT is missing", () => {
    const { BODY_LIMIT: _omitted, ...env } = TEST_ENV;
    expect(() => loadConfig(env)).toThrow("BODY_LIMIT");
  });

  it.each(["1 mb", "mb", "1gb", "-1mb", "1.5mb"])("rejects BODY_LIMIT %s", (value) => {
    expect(() => loadConfig({ ...TEST_ENV, BODY_LIMIT: value })).toThrow("Invalid BODY_LIMIT");
  });
});

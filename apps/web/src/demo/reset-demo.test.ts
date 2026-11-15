import { describe, expect, it, vi } from "vitest";
import type { ApiFetch } from "../api/client";
import { resetShipDemo } from "./reset-demo";

const { roleState } = vi.hoisted(() => ({ roleState: { current: "SHIP" as "SHIP" | "EARTH" } }));
vi.mock("../role/demo-role", () => ({ getCurrentDemoRole: () => roleState.current }));

describe("resetShipDemo", () => {
  it("calls the API, deletes local data, then reloads for ship role", async () => {
    roleState.current = "SHIP";
    const calls: string[] = [];
    const api: ApiFetch = async (path, init) => {
      calls.push(`api:${path}:${init?.method}`);
      return new Response("{}", { status: 200 });
    };
    await resetShipDemo({
      api,
      deleteDatabase: async () => { calls.push("delete"); },
      reload: () => { calls.push("reload"); },
    });
    expect(calls).toEqual(["api:/api/demo/reset:POST", "delete", "reload"]);
  });

  it("does not delete ship data or reload when the API fails", async () => {
    roleState.current = "SHIP";
    const deleteDatabase = vi.fn(async () => undefined);
    const reload = vi.fn();
    const api: ApiFetch = async () => new Response("{}", { status: 404 });
    await expect(resetShipDemo({ api, deleteDatabase, reload })).rejects.toThrow("HTTP 404");
    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("skips local database deletion in earth role", async () => {
    roleState.current = "EARTH";
    const calls: string[] = [];
    const api: ApiFetch = async () => new Response("{}", { status: 200 });
    await resetShipDemo({
      api,
      deleteDatabase: async () => { calls.push("delete"); },
      reload: () => { calls.push("reload"); },
    });
    expect(calls).toEqual(["reload"]);
  });
});

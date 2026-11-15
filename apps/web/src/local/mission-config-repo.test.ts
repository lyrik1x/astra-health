import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FetchLike } from "../api/client";
import { DEMO_ROLE_HEADER } from "../api/client";
import type { ShipDb } from "../db/ship-db";
import { getLocalCrew, refreshCrew } from "./crew-repo";
import { getLocalMissionConfig, refreshMissionConfig } from "./mission-config-repo";
import { crewBody, fakeApi, jsonResponse, missionConfigBody, newTestDb } from "./test-fixtures";

let db: ShipDb;
beforeEach(() => {
  db = newTestDb();
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});

const networkDown: FetchLike = async () => {
  throw new TypeError("Failed to fetch");
};
const serverError: FetchLike = async () => jsonResponse({ statusCode: 500 }, 500);

describe("mission config copy", () => {
  const expected = { clock: missionConfigBody.clock, profile: missionConfigBody.profile };

  it("returns null when it was never downloaded", async () => {
    expect(await getLocalMissionConfig(db)).toBeNull();
  });

  it("downloads GET /api/mission/config with the role header and saves clock and profile", async () => {
    const calls: { input: string; init?: RequestInit }[] = [];
    const api = fakeApi(async (input, init) => {
      calls.push({ input, init });
      return jsonResponse(missionConfigBody);
    });

    expect(await refreshMissionConfig({ api, db })).toEqual(expected);
    expect(calls[0]?.input).toBe("http://api.test/api/mission/config");
    expect(new Headers(calls[0]?.init?.headers).get(DEMO_ROLE_HEADER)).toBe("SHIP");
    expect(await getLocalMissionConfig(db)).toEqual(expected);
  });

  it.each<[string, FetchLike]>([
    ["network down", networkDown],
    ["HTTP 500", serverError],
    ["invalid body", async () => jsonResponse({ ...missionConfigBody, clock: { factor: 0 } })],
  ])("keeps the previous copy when the API fails (%s)", async (_label, failing) => {
    await refreshMissionConfig({ api: fakeApi(async () => jsonResponse(missionConfigBody)), db });

    await expect(refreshMissionConfig({ api: fakeApi(failing), db })).rejects.toThrow();
    expect(await getLocalMissionConfig(db)).toEqual(expected);
  });
});

describe("crew copy", () => {
  it("returns null when it was never downloaded", async () => {
    expect(await getLocalCrew(db)).toBeNull();
  });

  it("downloads GET /api/crew and saves the crew", async () => {
    const calls: string[] = [];
    const api = fakeApi(async (input) => {
      calls.push(input);
      return jsonResponse(crewBody);
    });

    expect(await refreshCrew({ api, db })).toEqual(crewBody.crew);
    expect(calls).toEqual(["http://api.test/api/crew"]);
    expect(await getLocalCrew(db)).toEqual(crewBody.crew);
  });

  it.each<[string, FetchLike]>([
    ["network down", networkDown],
    ["HTTP 500", serverError],
    ["invalid body", async () => jsonResponse({ crew: [{ id: "Not Valid" }] })],
  ])("keeps the previous copy when the API fails (%s)", async (_label, failing) => {
    await refreshCrew({ api: fakeApi(async () => jsonResponse(crewBody)), db });

    await expect(refreshCrew({ api: fakeApi(failing), db })).rejects.toThrow();
    expect(await getLocalCrew(db)).toEqual(crewBody.crew);
  });

  it("does not touch the mission config copy", async () => {
    await refreshMissionConfig({ api: fakeApi(async () => jsonResponse(missionConfigBody)), db });
    await refreshCrew({ api: fakeApi(async () => jsonResponse(crewBody)), db });
    expect(await getLocalMissionConfig(db)).not.toBeNull();
  });
});

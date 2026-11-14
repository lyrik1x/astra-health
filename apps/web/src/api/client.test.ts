import { describe, expect, it } from "vitest";
import type { DemoRole } from "@astra/contracts";
import { ApiNotConfiguredError, DEMO_ROLE_HEADER, createApiFetch, type FetchLike } from "./client";

interface Call {
  input: string;
  init: RequestInit | undefined;
}

function fakeFetch(calls: Call[]): FetchLike {
  return async (input, init) => {
    calls.push({ input, init });
    return new Response("{}", { status: 200 });
  };
}

describe("createApiFetch", () => {
  it.each<DemoRole>(["SHIP", "EARTH"])("adds X-Demo-Role: %s", async (role) => {
    const calls: Call[] = [];
    const apiFetch = createApiFetch({ baseUrl: "http://localhost:3000", getRole: () => role, fetchImpl: fakeFetch(calls) });

    await apiFetch("/api/health");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("http://localhost:3000/api/health");
    expect(new Headers(calls[0]?.init?.headers).get(DEMO_ROLE_HEADER)).toBe(role);
  });

  it("keeps caller headers and overrides any caller-provided role", async () => {
    const calls: Call[] = [];
    const apiFetch = createApiFetch({ baseUrl: "http://localhost:3000/", getRole: () => "EARTH", fetchImpl: fakeFetch(calls) });

    await apiFetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json", [DEMO_ROLE_HEADER]: "SHIP" } });

    const headers = new Headers(calls[0]?.init?.headers);
    expect(calls[0]?.input).toBe("http://localhost:3000/api/messages");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get(DEMO_ROLE_HEADER)).toBe("EARTH");
  });

  it("rejects without calling fetch when the base URL is missing", async () => {
    const calls: Call[] = [];
    const apiFetch = createApiFetch({ baseUrl: undefined, getRole: () => "SHIP", fetchImpl: fakeFetch(calls) });

    await expect(apiFetch("/api/health")).rejects.toBeInstanceOf(ApiNotConfiguredError);
    expect(calls).toHaveLength(0);
  });
});

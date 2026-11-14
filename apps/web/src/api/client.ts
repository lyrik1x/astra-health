import type { DemoRole } from "@astra/contracts";
import { getCurrentDemoRole } from "../role/demo-role";

/** Demo-mode role header (T-005). It is not authentication. */
export const DEMO_ROLE_HEADER = "X-Demo-Role";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export interface ApiFetchOptions {
  baseUrl: string | undefined;
  getRole: () => DemoRole;
  fetchImpl?: FetchLike;
}

/** The API base URL (VITE_API_URL) is missing. */
export class ApiNotConfiguredError extends Error {
  constructor() {
    super("VITE_API_URL is not set (see apps/web/.env.example)");
    this.name = "ApiNotConfiguredError";
  }
}

/** Builds the single function that talks to the API. Exported for tests. */
export function createApiFetch({ baseUrl, getRole, fetchImpl }: ApiFetchOptions): ApiFetch {
  return async (path, init = {}) => {
    if (!baseUrl) {
      throw new ApiNotConfiguredError();
    }
    const headers = new Headers(init.headers);
    headers.set(DEMO_ROLE_HEADER, getRole());
    const doFetch: FetchLike = fetchImpl ?? ((input, requestInit) => globalThis.fetch(input, requestInit));
    return doFetch(`${baseUrl.replace(/\/+$/, "")}${path}`, { ...init, headers });
  };
}

/**
 * Every request from the web app goes through here, so every request carries X-Demo-Role.
 * Do not call fetch directly anywhere else (checked by no-direct-fetch.test.ts).
 */
export const apiFetch: ApiFetch = createApiFetch({
  baseUrl: import.meta.env.VITE_API_URL,
  getRole: getCurrentDemoRole,
});

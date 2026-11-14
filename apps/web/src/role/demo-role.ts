import { DemoRoleSchema, type DemoRole } from "@astra/contracts";

/** S3 (T-103): Ship is the role when the URL does not name a valid one. */
export const DEFAULT_DEMO_ROLE: DemoRole = "SHIP";

/** Query parameter that selects the demo role: `?role=ship` or `?role=earth`. */
export const ROLE_QUERY_PARAM = "role";

export interface RoleResolution {
  role: DemoRole;
  /** Raw URL value when it was present but not a valid role. */
  invalidValue?: string;
}

/** Reads the demo role from a URL query string. Demo mode only, not authentication. */
export function resolveDemoRole(search: string): RoleResolution {
  const raw = new URLSearchParams(search).get(ROLE_QUERY_PARAM);
  if (raw === null || raw.trim() === "") {
    return { role: DEFAULT_DEMO_ROLE };
  }
  const parsed = DemoRoleSchema.safeParse(raw.trim().toUpperCase());
  if (parsed.success) {
    return { role: parsed.data };
  }
  return { role: DEFAULT_DEMO_ROLE, invalidValue: raw };
}

/** Builds the query string for a role, keeping any other parameters. */
export function buildRoleSearch(currentSearch: string, role: DemoRole): string {
  const params = new URLSearchParams(currentSearch);
  params.set(ROLE_QUERY_PARAM, role.toLowerCase());
  return `?${params.toString()}`;
}

let currentResolution: RoleResolution | undefined;

/**
 * Role of this page load. It is read once from the URL: switching roles reloads the page,
 * so each role starts clean (Dexie will open only in the Ship role, T-202).
 */
export function getCurrentRoleResolution(): RoleResolution {
  currentResolution ??= resolveDemoRole(window.location.search);
  return currentResolution;
}

export function getCurrentDemoRole(): DemoRole {
  return getCurrentRoleResolution().role;
}

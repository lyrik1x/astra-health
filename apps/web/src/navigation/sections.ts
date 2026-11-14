import type { DemoRole } from "@astra/contracts";

/** App sections. Navigation uses React state, without a router (T-103 §4). */
export type SectionId = "dashboard" | "recordMeasurement" | "incident" | "messages" | "console";

export const SECTIONS_BY_ROLE: Record<DemoRole, readonly SectionId[]> = {
  SHIP: ["dashboard", "recordMeasurement", "incident", "messages"],
  EARTH: ["console"],
};

/** Translation key of each section's navigation label. */
export const SECTION_LABEL_KEYS: Record<SectionId, string> = {
  dashboard: "nav.dashboard",
  recordMeasurement: "nav.recordMeasurement",
  incident: "nav.incident",
  messages: "nav.messages",
  console: "nav.console",
};

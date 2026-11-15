import type { Indicator } from "@astra/contracts";
import type { DisplayStatus } from "../../components/StatusBadge";
import type { LocalMissionConfig } from "../../db/schema";
import { displayStatusFor, type DisplayBadge } from "../dashboard/display-status";
import type { LatestByIndicator } from "./latest-by-indicator";

/**
 * T-606b: the marker color of each transport state. Same tokens as StatusBadge (--color-status-*),
 * so the figure and the badges always match. Colors describe data transport, never health.
 */
export const STATUS_COLOR_TOKEN: Record<DisplayStatus, string> = {
  SAVED_LOCAL: "var(--color-status-saved)",
  PENDING_SYNC: "var(--color-status-queued)",
  CONFIRMED: "var(--color-status-confirmed)",
  IN_TRANSIT: "var(--color-status-transit)",
  DELIVERED: "var(--color-status-delivered)",
  SYNC_ERROR: "var(--color-status-error)",
  OFFLINE: "var(--color-status-offline)",
};

/** Neutral color of an indicator without records. */
export const NO_RECORDS_COLOR = "var(--color-fg-muted)";

export interface IndicatorStatus {
  /** All badges of the latest record, exactly as the Dashboard list shows them. */
  badges: DisplayBadge[];
  /** The state the marker shows: the last badge (IN_TRANSIT / DELIVERED win over CONFIRMED). */
  status: DisplayStatus;
}

export type StatusByIndicator = Partial<Record<Indicator, IndicatorStatus>>;

/**
 * Pure: the transport state of the latest record of each indicator. It only reads sync fields;
 * the measured value is never used. An indicator without records has no entry.
 */
export function statusByIndicator(
  latest: LatestByIndicator,
  config: Pick<LocalMissionConfig, "clock"> | null,
  realNow: Date,
): StatusByIndicator {
  const result: StatusByIndicator = {};
  for (const indicator of Object.keys(latest) as Indicator[]) {
    const record = latest[indicator];
    if (!record) continue;
    const badges = displayStatusFor(record, config, realNow);
    const last = badges[badges.length - 1];
    if (last) result[indicator] = { badges, status: last.status };
  }
  return result;
}

/** Pure: marker and label color. Depends only on the state (or on having no records). */
export function markerColorFor(status: DisplayStatus | undefined): string {
  return status === undefined ? NO_RECORDS_COLOR : STATUS_COLOR_TOKEN[status];
}

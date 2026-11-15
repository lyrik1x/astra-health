import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { RejectionCode, TransportStatus } from "@astra/contracts";
import {
  CheckIcon,
  ClockIcon,
  CrossCircleIcon,
  DeviceIcon,
  DoubleCheckIcon,
  NoSignalIcon,
  TransitIcon,
  type IconProps,
} from "./icons";

/** Client-only sync states (T-005 §6.1). They are not part of the contracts. */
export type SyncState = "SAVED_LOCAL" | "PENDING_SYNC" | "CONFIRMED" | "SYNC_ERROR";

/** The seven states shown by the app: sync, transport (from contracts) and connectivity. */
export type DisplayStatus = SyncState | TransportStatus | "OFFLINE";

export const DISPLAY_STATUSES: readonly DisplayStatus[] = [
  "SAVED_LOCAL",
  "PENDING_SYNC",
  "CONFIRMED",
  "IN_TRANSIT",
  "DELIVERED",
  "SYNC_ERROR",
  "OFFLINE",
];

interface StatusStyle {
  labelKey: string;
  Icon: ComponentType<IconProps>;
  className: string;
}

// Colors describe data transport, never health. Icon and text always go with the color.
const STATUS_STYLES: Record<DisplayStatus, StatusStyle> = {
  SAVED_LOCAL: { labelKey: "status.SAVED_LOCAL", Icon: DeviceIcon, className: "text-status-saved border-status-saved" },
  PENDING_SYNC: { labelKey: "status.PENDING_SYNC", Icon: ClockIcon, className: "text-status-queued border-status-queued" },
  CONFIRMED: { labelKey: "status.CONFIRMED", Icon: CheckIcon, className: "text-status-confirmed border-status-confirmed" },
  IN_TRANSIT: { labelKey: "status.IN_TRANSIT", Icon: TransitIcon, className: "text-status-transit border-status-transit" },
  DELIVERED: { labelKey: "status.DELIVERED", Icon: DoubleCheckIcon, className: "text-status-delivered border-status-delivered" },
  SYNC_ERROR: { labelKey: "status.SYNC_ERROR", Icon: CrossCircleIcon, className: "text-status-error border-status-error" },
  OFFLINE: { labelKey: "status.OFFLINE", Icon: NoSignalIcon, className: "text-status-offline border-status-offline" },
};

export interface StatusBadgeProps {
  status: DisplayStatus;
  /** Only for SYNC_ERROR: the permanent rejection code to show. */
  errorCode?: RejectionCode;
  /** Marks the error code as a sample (status legend), so it is not read as a real error. */
  isExample?: boolean;
}

export function StatusBadge({ status, errorCode, isExample = false }: StatusBadgeProps) {
  const { t } = useTranslation();
  const { labelKey, Icon, className } = STATUS_STYLES[status];
  let label = t(labelKey);
  if (status === "SYNC_ERROR" && errorCode) {
    label = isExample
      ? t("status.SYNC_ERROR_example", { code: errorCode })
      : t("status.SYNC_ERROR_withCode", { code: errorCode });
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-control border bg-surface px-2 py-0.5 text-sm font-medium ${className}`}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </span>
  );
}

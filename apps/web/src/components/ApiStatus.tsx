import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiNotConfiguredError } from "../api/client";
import { fetchHealth } from "../api/health";
import { CheckIcon, ClockIcon, CrossCircleIcon } from "./icons";

type ApiState = "checking" | "online" | "unreachable" | "notConfigured";

const STATE_VIEW = {
  checking: { labelKey: "api.checking", Icon: ClockIcon },
  online: { labelKey: "api.online", Icon: CheckIcon },
  unreachable: { labelKey: "api.unreachable", Icon: CrossCircleIcon },
  notConfigured: { labelKey: "api.notConfigured", Icon: CrossCircleIcon },
} as const;

/** Small API connection indicator (GET /api/health), with icon and text. */
export function ApiStatus() {
  const { t } = useTranslation();
  const [state, setState] = useState<ApiState>("checking");

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then(() => {
        if (!cancelled) setState("online");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState(error instanceof ApiNotConfiguredError ? "notConfigured" : "unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { labelKey, Icon } = STATE_VIEW[state];
  return (
    <p className="flex items-center gap-1.5 text-sm text-fg-muted" aria-live="polite">
      <span className="font-semibold">{t("api.label")}:</span>
      <Icon className="size-4" />
      <span>{t(labelKey)}</span>
    </p>
  );
}

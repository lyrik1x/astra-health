import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SignalIcon } from "./icons";
import { StatusBadge } from "./StatusBadge";

function readOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/**
 * Ship link indicator (SHIP role only): navigator.onLine plus the `online` / `offline` events.
 * A lost link is shown as OFFLINE, never as "in transit" (QA-406).
 */
export function LinkStatus() {
  const { t } = useTranslation();
  const [online, setOnline] = useState<boolean>(readOnline);

  useEffect(() => {
    const update = () => setOnline(readOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <p className="flex items-center gap-1.5 text-sm text-fg-muted" aria-live="polite">
      <span className="font-semibold">{t("app.link.label")}:</span>
      {online ? (
        <>
          {/* T-711: signal arcs (CSS pulse, off with reduced motion). Same online state as before. */}
          <SignalIcon className="size-4 text-accent" />
          <span>{t("app.link.online")}</span>
        </>
      ) : (
        <StatusBadge status="OFFLINE" />
      )}
    </p>
  );
}

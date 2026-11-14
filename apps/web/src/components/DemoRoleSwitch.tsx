import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { DemoRole } from "@astra/contracts";
import { buildRoleSearch } from "../role/demo-role";
import { EarthIcon, ShipIcon } from "./icons";

const ROLE_OPTIONS = [
  { role: "SHIP", labelKey: "demoRole.SHIP", Icon: ShipIcon, activeClass: "bg-role-ship" },
  { role: "EARTH", labelKey: "demoRole.EARTH", Icon: EarthIcon, activeClass: "bg-role-earth" },
] as const;

interface DemoRoleSwitchProps {
  role: DemoRole;
}

/**
 * Demo-mode role selector. It is not a login: plain links that rewrite ?role= and reload,
 * so each role starts from a clean page load.
 */
export function DemoRoleSwitch({ role }: DemoRoleSwitchProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const hintId = useId();
  const search = typeof window === "undefined" ? "" : window.location.search;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span id={labelId} className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t("demoRole.label")}
        </span>
        <div
          role="group"
          aria-labelledby={labelId}
          aria-describedby={hintId}
          className="inline-flex rounded-control border border-border bg-surface p-0.5"
        >
          {ROLE_OPTIONS.map(({ role: optionRole, labelKey, Icon, activeClass }) => {
            const active = optionRole === role;
            return (
              <a
                key={optionRole}
                href={buildRoleSearch(search, optionRole)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-medium ${
                  active ? `${activeClass} text-on-accent` : "text-fg hover:bg-surface-raised"
                }`}
              >
                <Icon className="size-4" />
                {t(labelKey)}
              </a>
            );
          })}
        </div>
      </div>
      <p id={hintId} className="text-xs text-fg-muted">
        {t("demoRole.hint")}
      </p>
    </div>
  );
}

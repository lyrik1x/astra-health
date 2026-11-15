import type { ComponentType, ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { DemoRole } from "@astra/contracts";
import { SECTION_LABEL_KEYS, type SectionId } from "../navigation/sections";
import { ApiStatus } from "./ApiStatus";
import { DemoRoleSwitch } from "./DemoRoleSwitch";
import { ChatIcon, ClipboardIcon, ConsoleIcon, EarthIcon, GridIcon, PencilIcon, ShipIcon, type IconProps } from "./icons";
import { SafetyBanner } from "./SafetyBanner";

const SECTION_ICONS: Record<SectionId, ComponentType<IconProps>> = {
  dashboard: GridIcon,
  recordMeasurement: PencilIcon,
  incident: ClipboardIcon,
  messages: ChatIcon,
  console: ConsoleIcon,
};

interface NavListProps {
  sections: readonly SectionId[];
  active: SectionId;
  onSelect: (section: SectionId) => void;
  layout: "sidebar" | "tabs";
}

function NavList({ sections, active, onSelect, layout }: NavListProps) {
  const { t } = useTranslation();
  const isTabs = layout === "tabs";
  return (
    <ul className={isTabs ? "flex" : "flex flex-col gap-1"}>
      {sections.map((section) => {
        const Icon = SECTION_ICONS[section];
        const current = section === active;
        return (
          <li key={section} className={isTabs ? "flex-1" : undefined}>
            <button
              type="button"
              onClick={() => onSelect(section)}
              aria-current={current ? "page" : undefined}
              className={`flex w-full min-h-11 items-center rounded-control text-sm font-medium ${
                isTabs ? "flex-col justify-center gap-0.5 px-1 py-1.5 text-xs" : "gap-3 px-3"
              } ${current ? "bg-surface-raised text-accent" : "text-fg hover:bg-surface-raised"}`}
            >
              <Icon className="size-5" />
              <span className={current ? "underline decoration-2 underline-offset-4" : undefined}>
                {t(SECTION_LABEL_KEYS[section])}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface AppShellProps {
  role: DemoRole;
  invalidRoleValue?: string;
  sections: readonly SectionId[];
  activeSection: SectionId;
  onSelectSection: (section: SectionId) => void;
  mainRef: RefObject<HTMLElement | null>;
  /** Optional link indicator next to the API status. App.tsx passes it only in the SHIP role. */
  linkStatus?: ReactNode;
  children: ReactNode;
}

/** Responsive layout: sidebar on desktop, bottom tabs on mobile, permanent notices on top. */
export function AppShell(props: AppShellProps) {
  const { role, invalidRoleValue, sections, activeSection, onSelectSection, mainRef, linkStatus, children } = props;
  const { t } = useTranslation();
  const roleName = t(`demoRole.${role}`);
  const RoleIcon = role === "SHIP" ? ShipIcon : EarthIcon;
  const roleTagClass = role === "SHIP" ? "text-role-ship border-role-ship" : "text-role-earth border-role-earth";

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent"
      >
        {t("app.skipToContent")}
      </a>

      <div className="sticky top-0 z-20">
        <SafetyBanner />
      </div>

      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-lg font-bold tracking-widest">{t("app.name")}</span>
            <span className={`inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5 text-sm ${roleTagClass}`}>
              <RoleIcon className="size-4" />
              {t("demoRole.viewTag", { role: roleName })}
            </span>
            <ApiStatus />
            {linkStatus}
          </div>
          <DemoRoleSwitch role={role} />
        </div>
        {invalidRoleValue !== undefined && (
          <p role="note" className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-3 text-sm text-status-queued">
            {t("demoRole.invalid", { value: invalidRoleValue.slice(0, 32), role: roleName })}
          </p>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1">
        <nav aria-label={t("nav.label")} className="hidden w-60 shrink-0 border-r border-border p-3 md:block">
          <NavList sections={sections} active={activeSection} onSelect={onSelectSection} layout="sidebar" />
        </nav>
        <main id="main" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 p-4 pb-28 focus:outline-none md:p-6">
          {children}
        </main>
      </div>

      <nav
        aria-label={t("nav.label")}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-1 md:hidden"
      >
        <NavList sections={sections} active={activeSection} onSelect={onSelectSection} layout="tabs" />
      </nav>
    </div>
  );
}

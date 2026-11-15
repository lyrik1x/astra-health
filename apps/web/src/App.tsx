import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import { LinkStatus } from "./components/LinkStatus";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ConsolePage } from "./features/earth-console/ConsolePage";
import { IncidentPage } from "./features/incident/IncidentPage";
import { RecordMeasurementPage } from "./features/measurements/RecordMeasurementPage";
import { MessagesPage } from "./features/messages/MessagesPage";
import { SECTIONS_BY_ROLE, type SectionId } from "./navigation/sections";
import { getCurrentRoleResolution } from "./role/demo-role";
import { createShipSyncRunner, type ShipSyncRunner } from "./sync/ship-sync-runner";
import { syncOnce } from "./sync/sync-once";

/** Browser wiring of the ship sync runner. Created only in the SHIP role. */
function createBrowserShipSyncRunner(): ShipSyncRunner {
  return createShipSyncRunner({
    syncOnce: () => syncOnce(),
    isOnline: () => navigator.onLine,
    setInterval: (callback, ms) => window.setInterval(callback, ms),
    clearInterval: (handle) => window.clearInterval(handle as number),
    addOnlineListener: (callback) => {
      window.addEventListener("online", callback);
      return () => window.removeEventListener("online", callback);
    },
  });
}

export function App() {
  const { role, invalidValue } = getCurrentRoleResolution();
  const sections = SECTIONS_BY_ROLE[role];
  const [activeSection, setActiveSection] = useState<SectionId>(sections[0] ?? "dashboard");
  const mainRef = useRef<HTMLElement | null>(null);
  const isFirstRender = useRef(true);
  const syncRunner = useRef<ShipSyncRunner | null>(null);

  // Automatic sync only in the SHIP role. EARTH never creates the runner, so Dexie is never opened.
  useEffect(() => {
    if (role !== "SHIP") return;
    const runner = createBrowserShipSyncRunner();
    syncRunner.current = runner;
    runner.start();
    return () => {
      runner.stop();
      if (syncRunner.current === runner) syncRunner.current = null;
    };
  }, [role]);

  const requestSync = useCallback(() => syncRunner.current?.requestSync(), []);

  // Move focus to the content after a section change, so keyboard users land on it.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [activeSection]);

  const pages: Record<SectionId, ReactNode> = {
    dashboard: <DashboardPage onNavigate={setActiveSection} />,
    recordMeasurement: <RecordMeasurementPage onSaved={requestSync} />,
    incident: <IncidentPage onChanged={requestSync} />,
    messages: <MessagesPage />,
    console: <ConsolePage />,
  };

  return (
    <AppShell
      role={role}
      invalidRoleValue={invalidValue}
      sections={sections}
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      mainRef={mainRef}
      linkStatus={role === "SHIP" ? <LinkStatus /> : undefined}
    >
      {pages[activeSection]}
    </AppShell>
  );
}

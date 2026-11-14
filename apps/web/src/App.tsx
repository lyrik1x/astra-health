import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ConsolePage } from "./features/earth-console/ConsolePage";
import { IncidentPage } from "./features/incident/IncidentPage";
import { RecordMeasurementPage } from "./features/measurements/RecordMeasurementPage";
import { MessagesPage } from "./features/messages/MessagesPage";
import { SECTIONS_BY_ROLE, type SectionId } from "./navigation/sections";
import { getCurrentRoleResolution } from "./role/demo-role";

export function App() {
  const { role, invalidValue } = getCurrentRoleResolution();
  const sections = SECTIONS_BY_ROLE[role];
  const [activeSection, setActiveSection] = useState<SectionId>(sections[0] ?? "dashboard");
  const mainRef = useRef<HTMLElement | null>(null);
  const isFirstRender = useRef(true);

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
    recordMeasurement: <RecordMeasurementPage />,
    incident: <IncidentPage />,
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
    >
      {pages[activeSection]}
    </AppShell>
  );
}

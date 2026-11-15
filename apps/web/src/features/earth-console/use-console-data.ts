import { useCallback, useEffect, useState } from "react";
import type {
  Astronaut,
  AstronautId,
  MeasurementWithTransmission,
  MissionConfigResponse,
  ProjectedIncident,
} from "@astra/contracts";
import { fetchCrew } from "../../api/crew";
import { fetchIncidents } from "../../api/incidents";
import { fetchMeasurements } from "../../api/measurements";
import { fetchMissionConfig } from "../../api/mission-config";

/** The console asks the API again every 3 s while it is open (T-503 §3.2). */
export const POLL_INTERVAL_MS = 3000;

/** Last data received from the API for one astronaut. Only the API is a source (QA-412). */
export interface ConsoleSnapshot {
  astronautId: AstronautId;
  config: MissionConfigResponse;
  measurements: MeasurementWithTransmission[];
  incidents: ProjectedIncident[];
}

export interface ConsoleData {
  crew: Astronaut[] | null;
  selectedId: AstronautId | null;
  selectAstronaut: (id: AstronautId) => void;
  /** Only the snapshot of the selected astronaut; `null` until its first answer. */
  snapshot: ConsoleSnapshot | null;
  /** The last query failed; the last data is kept. */
  apiError: boolean;
  /** Asks again right away (for example after sending a review). */
  refresh: () => void;
}

export function useConsoleData(): ConsoleData {
  const [crew, setCrew] = useState<Astronaut[] | null>(null);
  const [selectedId, setSelectedId] = useState<AstronautId | null>(null);
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null);
  const [apiError, setApiError] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  // Crew: asked until it arrives once. The first crew member is the default (§3.3).
  useEffect(() => {
    if (crew !== null) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      fetchCrew()
        .then((response) => {
          if (!active) return;
          setCrew(response.crew);
          setSelectedId((current) => current ?? response.crew[0]?.id ?? null);
          setApiError(false);
        })
        .catch(() => {
          if (!active) return;
          setApiError(true);
          timer = setTimeout(load, POLL_INTERVAL_MS);
        });
    };
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [crew]);

  // Mission data of the selected astronaut, every 3 s. The next query starts only after the
  // previous one ends, so two queries never overlap.
  useEffect(() => {
    if (selectedId === null) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const [config, measurements, incidents] = await Promise.all([
          fetchMissionConfig(),
          fetchMeasurements(selectedId),
          fetchIncidents(selectedId),
        ]);
        if (!active) return;
        setSnapshot({ astronautId: selectedId, config, measurements: measurements.items, incidents: incidents.incidents });
        setApiError(false);
      } catch {
        if (active) setApiError(true);
      }
      if (active) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedId, refreshToken]);

  const selectAstronaut = useCallback((id: AstronautId) => setSelectedId(id), []);
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  return {
    crew,
    selectedId,
    selectAstronaut,
    snapshot: snapshot !== null && snapshot.astronautId === selectedId ? snapshot : null,
    apiError,
    refresh,
  };
}

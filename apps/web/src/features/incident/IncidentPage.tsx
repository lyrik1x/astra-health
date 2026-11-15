import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Astronaut } from "@astra/contracts";
import { CrossCircleIcon, InfoIcon } from "../../components/icons";
import { Button, Card } from "../../components/ui";
import type { LocalMissionConfig } from "../../db/schema";
import { getLocalCrew } from "../../local/crew-repo";
import {
  cancelIncident,
  closeIncident,
  completeGuideStep,
  getOpenIncident,
  openIncident,
  startGuide,
  submitReport,
  type LocalIncident,
} from "../../local/incidents-repo";
import { getLocalMissionConfig } from "../../local/mission-config-repo";
import { loadSelectedAstronaut, resolveAstronautId, saveSelectedAstronaut } from "../../role/selected-astronaut";
import { availableActions, completedStepIds, latestReviewId } from "./available-actions";
import { GUIDE_VERSION } from "./guide-content";
import { GuidePanel } from "./GuidePanel";
import { IncidentHistory } from "./IncidentHistory";
import { incidentErrorKey } from "./incident-errors";
import { NOTE_MAX, REASON_MAX, checkCancelReason, checkReportNote } from "./incident-form";

/** The open incident is read again with this period, so Earth reviews show without a reload. */
const REFRESH_MS = 2_000;

const CONTROL_CLASS = "w-full rounded-control border bg-surface-raised px-3 py-2 text-fg";

interface Snapshot {
  crew: Astronaut[] | null;
  config: LocalMissionConfig | null;
  incident: LocalIncident | null;
  realNow: Date;
}

export interface IncidentPageProps {
  /** Called after every saved action; App.tsx asks the ship sync runner for a cycle. */
  onChanged?: () => void;
}

export function IncidentPage({ onChanged }: IncidentPageProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // What the astronaut types lives here; the periodic read never touches it.
  const [noteDraft, setNoteDraft] = useState("");
  const [reasonDraft, setReasonDraft] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [noteErrorKey, setNoteErrorKey] = useState<string | null>(null);
  const [reasonErrorKey, setReasonErrorKey] = useState<string | null>(null);
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);

  // While an action is busy the periodic read does not write its result; afterwards it reads once.
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  /** Changes on every action, so a read started before or during it is discarded. */
  const generation = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (busyRef.current) return;
      const started = generation.current;
      try {
        const [crew, config] = await Promise.all([getLocalCrew(), getLocalMissionConfig()]);
        const astronautId = selectedId || resolveAstronautId(loadSelectedAstronaut(), crew);
        const incident = astronautId ? await getOpenIncident(astronautId) : null;
        if (!active || busyRef.current || generation.current !== started) return;
        setSnapshot({ crew, config, incident, realNow: new Date() });
        setLoadFailed(false);
        if (!selectedId && astronautId) setSelectedId(astronautId);
      } catch (error) {
        console.error("Could not read the local incident", error);
        if (active) setLoadFailed(true);
      }
    }
    refreshRef.current = refresh;
    void refresh();
    const handle = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(handle);
    };
  }, [selectedId]);

  /** Runs one action, then calls onChanged (requestSync) and reads the incident once. */
  async function run(action: () => Promise<unknown>, onSuccess?: () => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    generation.current += 1;
    setBusy(true);
    setActionErrorKey(null);
    try {
      await action();
      onSuccess?.();
      onChanged?.();
    } catch (error) {
      // What was typed is kept, so the astronaut can try again. No automatic retry.
      console.error("Could not save the incident action on the device", error);
      setActionErrorKey(incidentErrorKey(error));
    } finally {
      busyRef.current = false;
      generation.current += 1;
      setBusy(false);
      await refreshRef.current();
    }
  }

  function selectAstronaut(astronautId: string) {
    setSelectedId(astronautId);
    saveSelectedAstronaut(astronautId);
    setSnapshot((current) => (current === null ? null : { ...current, incident: null }));
    // The drafts belong to the previous crew member's incident.
    setNoteDraft("");
    setReasonDraft("");
    setCancelOpen(false);
    setNoteErrorKey(null);
    setReasonErrorKey(null);
    setActionErrorKey(null);
  }

  function handleSendReport(incident: LocalIncident) {
    const check = checkReportNote(noteDraft);
    if (!check.ok) {
      setNoteErrorKey(check.errorKey);
      document.getElementById("incident-note")?.focus();
      return;
    }
    setNoteErrorKey(null);
    void run(
      () => submitReport(incident.incidentId, check.value, new Date()),
      () => setNoteDraft(""),
    );
  }

  function handleConfirmCancel(incident: LocalIncident) {
    const check = checkCancelReason(reasonDraft);
    if (!check.ok) {
      setReasonErrorKey(check.errorKey);
      document.getElementById("incident-cancel-reason")?.focus();
      return;
    }
    setReasonErrorKey(null);
    void run(
      () => cancelIncident(incident.incidentId, check.value, new Date()),
      () => {
        setReasonDraft("");
        setCancelOpen(false);
      },
    );
  }

  const crew = snapshot?.crew ?? null;
  const hasMissionData = snapshot !== null && crew !== null && snapshot.config !== null;
  const incident = snapshot?.incident ?? null;
  const actions = availableActions(incident);
  const completed = incident === null ? new Set<string>() : completedStepIds(incident.events);
  const reviewId = incident === null ? undefined : latestReviewId(incident);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold md:text-3xl">{t("pages.incident.title")}</h1>
        <p className="mt-1 text-fg-muted">{t("pages.incident.description")}</p>
      </header>

      <Card title={t("pages.incident.currentTitle")}>
        {loadFailed && <p className="text-sm text-fg-muted">{t("pages.incident.loadError")}</p>}
        {!loadFailed && snapshot === null && <p className="text-sm text-fg-muted">{t("pages.incident.loading")}</p>}
        {!loadFailed && snapshot !== null && !hasMissionData && (
          <p className="flex items-center gap-1.5 text-sm text-fg-muted">
            <InfoIcon className="size-4 shrink-0" />
            <span>{t("pages.incident.noMissionData")}</span>
          </p>
        )}
        {!loadFailed && hasMissionData && crew.length === 0 && (
          <p className="text-sm text-fg-muted">{t("pages.incident.noCrew")}</p>
        )}
        {!loadFailed && hasMissionData && crew.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="incident-astronaut" className="text-sm font-medium">
                {t("pages.incident.astronaut")}
              </label>
              <select
                id="incident-astronaut"
                className="min-h-11 w-full max-w-xs rounded-control border border-border bg-surface-raised px-3 text-fg"
                value={selectedId}
                disabled={busy}
                onChange={(event) => selectAstronaut(event.target.value)}
              >
                {crew.map((astronaut) => (
                  <option key={astronaut.id} value={astronaut.id}>
                    {astronaut.displayName}
                  </option>
                ))}
              </select>
            </div>

            {incident === null ? (
              <p className="text-sm text-fg-muted">{t("pages.incident.noIncident")}</p>
            ) : (
              <p className="text-sm">
                <span className="font-medium">{t("pages.incident.stateLabel")}:</span>{" "}
                {t(`pages.incident.states.${incident.state}`)}
              </p>
            )}

            {actions.includes("waitingNotice") && (
              <p className="flex items-center gap-1.5 text-sm" role="status">
                <InfoIcon className="size-4 shrink-0" />
                <span>{t("pages.incident.waitingReview")}</span>
              </p>
            )}

            {incident !== null && incident.events.some((event) => event.type === "GUIDE_STARTED") && (
              <GuidePanel
                completed={completed}
                canMark={actions.includes("markStep")}
                busy={busy}
                onMark={(stepId) => void run(() => completeGuideStep(incident.incidentId, stepId, new Date()))}
              />
            )}

            {incident !== null && actions.includes("sendReport") && (
              <div className="flex flex-col gap-1">
                <label htmlFor="incident-note" className="text-sm font-medium">
                  {t("pages.incident.report.noteLabel")}
                </label>
                <textarea
                  id="incident-note"
                  rows={3}
                  maxLength={NOTE_MAX}
                  className={`${CONTROL_CLASS} ${noteErrorKey ? "border-status-error" : "border-border"}`}
                  value={noteDraft}
                  aria-invalid={Boolean(noteErrorKey)}
                  aria-describedby={noteErrorKey ? "incident-note-counter incident-note-error" : "incident-note-counter"}
                  onChange={(event) => setNoteDraft(event.target.value)}
                />
                <p id="incident-note-counter" className="text-xs text-fg-muted">
                  {t("pages.incident.report.counter", { length: noteDraft.length, max: NOTE_MAX })}
                </p>
                {noteErrorKey && (
                  <p id="incident-note-error" className="flex items-center gap-1.5 text-sm text-status-error">
                    <CrossCircleIcon className="size-4 shrink-0" />
                    <span>{t(noteErrorKey)}</span>
                  </p>
                )}
              </div>
            )}

            {cancelOpen && incident !== null && actions.includes("cancel") && (
              <div className="flex flex-col gap-1">
                <label htmlFor="incident-cancel-reason" className="text-sm font-medium">
                  {t("pages.incident.cancelForm.reasonLabel")}
                </label>
                <input
                  id="incident-cancel-reason"
                  type="text"
                  autoComplete="off"
                  maxLength={REASON_MAX}
                  className={`${CONTROL_CLASS} min-h-11 ${reasonErrorKey ? "border-status-error" : "border-border"}`}
                  value={reasonDraft}
                  aria-invalid={Boolean(reasonErrorKey)}
                  aria-describedby={reasonErrorKey ? "incident-cancel-counter incident-cancel-error" : "incident-cancel-counter"}
                  onChange={(event) => setReasonDraft(event.target.value)}
                />
                <p id="incident-cancel-counter" className="text-xs text-fg-muted">
                  {t("pages.incident.report.counter", { length: reasonDraft.length, max: REASON_MAX })}
                </p>
                {reasonErrorKey && (
                  <p id="incident-cancel-error" className="flex items-center gap-1.5 text-sm text-status-error">
                    <CrossCircleIcon className="size-4 shrink-0" />
                    <span>{t(reasonErrorKey)}</span>
                  </p>
                )}
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={busy} onClick={() => handleConfirmCancel(incident)}>
                    {t("pages.incident.actions.confirmCancel")}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setCancelOpen(false)}>
                    {t("pages.incident.actions.keepIncident")}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {actions.includes("start") && (
                <Button disabled={busy} onClick={() => void run(() => openIncident(selectedId, new Date()))}>
                  {t("pages.incident.actions.start")}
                </Button>
              )}
              {incident !== null && actions.includes("openGuide") && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(() => startGuide(incident.incidentId, GUIDE_VERSION, new Date()))}
                >
                  {t("pages.incident.actions.openGuide")}
                </Button>
              )}
              {incident !== null && actions.includes("sendReport") && (
                <Button disabled={busy} onClick={() => handleSendReport(incident)}>
                  {t("pages.incident.actions.sendReport")}
                </Button>
              )}
              {incident !== null && actions.includes("closeReviewed") && (
                <Button
                  disabled={busy}
                  onClick={() => void run(() => closeIncident(incident.incidentId, "REVIEWED", reviewId, new Date()))}
                >
                  {t("pages.incident.actions.closeReviewed")}
                </Button>
              )}
              {incident !== null && actions.includes("closeWithoutReview") && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(() => closeIncident(incident.incidentId, "CLOSED_WITHOUT_REVIEW", undefined, new Date()))
                  }
                >
                  {t("pages.incident.actions.closeWithoutReview")}
                </Button>
              )}
              {actions.includes("cancel") && !cancelOpen && (
                <Button variant="ghost" disabled={busy} onClick={() => setCancelOpen(true)}>
                  {t("pages.incident.actions.cancel")}
                </Button>
              )}
            </div>

            <div role="status" aria-live="polite">
              {busy && <p className="text-sm text-fg-muted">{t("pages.incident.working")}</p>}
            </div>
            <div role="alert">
              {actionErrorKey && (
                <p className="flex items-center gap-1.5 text-sm text-status-error">
                  <CrossCircleIcon className="size-4 shrink-0" />
                  <span>{t(actionErrorKey)}</span>
                </p>
              )}
            </div>

            {incident !== null && (
              <IncidentHistory
                events={incident.events}
                reviews={incident.reviews}
                config={snapshot.config}
                realNow={snapshot.realNow}
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

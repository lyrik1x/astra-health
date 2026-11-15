import { useTranslation } from "react-i18next";
import type { ProjectedIncident } from "@astra/contracts";
import { ClipboardIcon } from "../../components/icons";
import { StatusBadge } from "../../components/StatusBadge";
import { deliveredReport, formatSimTime, ownReviews, shipEvents } from "./console-model";
import { canReview } from "./earth-review";
import { EVENT_TYPE_KEYS, STATE_KEYS, UNKNOWN_STATE_KEY } from "./labels";
import { ReviewForm } from "./ReviewForm";

interface IncidentCardProps {
  incident: ProjectedIncident;
  onReviewSent: () => void;
}

/** One incident as Earth sees it: state from the server, delivered events, alert and reviews. */
export function IncidentCard({ incident, onReviewSent }: IncidentCardProps) {
  const { t } = useTranslation();
  const report = deliveredReport(incident);
  const reviews = ownReviews(incident);
  const events = shipEvents(incident);
  const stateKey = incident.state === null ? UNKNOWN_STATE_KEY : STATE_KEYS[incident.state];

  return (
    <article className="rounded-control border border-border bg-surface-raised p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{t("pages.console.incidents.incident")}</h3>
        <p className="text-sm">
          <span className="text-fg-muted">{t("pages.console.incidents.state")}: </span>
          <span className="font-medium">{t(stateKey)}</span>
        </p>
      </header>

      {report && (
        // Neutral highlight (accent, icon and text), never a medical alarm color.
        <div role="status" className="mt-3 flex items-start gap-2 rounded-control border-2 border-accent bg-surface p-3">
          <ClipboardIcon className="mt-0.5 size-5 shrink-0 text-accent" />
          <div>
            <p className="font-semibold">{t("pages.console.incidents.alertTitle")}</p>
            <p className="text-sm text-fg-muted">
              {t("pages.console.incidents.alertDelivered", { time: formatSimTime(report.transmission.deliverAt) })}
            </p>
          </div>
        </div>
      )}

      <h4 className="mt-3 text-sm font-semibold">{t("pages.console.incidents.events")}</h4>
      <ol className="mt-1 flex flex-col gap-1 text-sm">
        {events.map(({ event }) => (
          <li key={event.id} className="flex flex-wrap justify-between gap-2">
            <span>{t(EVENT_TYPE_KEYS[event.type])}</span>
            <span className="text-fg-muted">{formatSimTime(event.createdAtSim)}</span>
          </li>
        ))}
      </ol>

      {reviews.length > 0 && (
        <>
          <h4 className="mt-3 text-sm font-semibold">{t("pages.console.incidents.reviews")}</h4>
          <ul className="mt-1 flex flex-col gap-2 text-sm">
            {reviews.map(({ event, transportStatus }) => (
              <li key={event.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-fg-muted">{formatSimTime(event.createdAtSim)}</span>
                  <StatusBadge status={transportStatus} />
                </div>
                <p className="break-words">{event.data.text}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {canReview(incident) && <ReviewForm incident={incident} onSent={onReviewSent} />}
    </article>
  );
}

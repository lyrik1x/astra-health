import { useTranslation } from "react-i18next";
import { StatusBadge } from "../../components/StatusBadge";
import type { LocalIncidentEventRecord, LocalMissionConfig } from "../../db/schema";
import { displayStatusFor } from "../dashboard/display-status";
import { formatUtcMinute } from "../dashboard/format-value";

interface RowProps {
  record: LocalIncidentEventRecord;
  config: LocalMissionConfig | null;
  realNow: Date;
}

function EventRow({ record, config, realNow }: RowProps) {
  const { t } = useTranslation();
  const badges = displayStatusFor(record, config, realNow);
  return (
    <li className="flex flex-col gap-2 rounded-control border border-border p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">{t(`pages.incident.eventTypes.${record.type}`)}</p>
        {record.type === "EARTH_REVIEW" && <p className="whitespace-pre-wrap">{record.data.text}</p>}
        {record.type === "REPORT_SUBMITTED" && record.data.note !== undefined && (
          <p className="whitespace-pre-wrap text-sm">{record.data.note}</p>
        )}
        {record.type === "INCIDENT_CANCELLED" && <p className="whitespace-pre-wrap text-sm">{record.data.reason}</p>}
        <p className="text-sm text-fg-muted">
          {t("pages.incident.history.createdSim", { time: formatUtcMinute(record.createdAtSim) })}
        </p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label={t("pages.incident.history.statusLabel")}>
        {badges.map((badge) => (
          <li key={badge.status}>
            <StatusBadge status={badge.status} errorCode={badge.errorCode} />
          </li>
        ))}
      </ul>
    </li>
  );
}

export interface IncidentHistoryProps {
  events: LocalIncidentEventRecord[];
  reviews: LocalIncidentEventRecord[];
  config: LocalMissionConfig | null;
  realNow: Date;
}

/** Ship events (by sequence) and Earth reviews received, each with its status badges. */
export function IncidentHistory({ events, reviews, config, realNow }: IncidentHistoryProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="incident-reviews-title" className="flex flex-col gap-2">
        <h3 id="incident-reviews-title" className="text-lg font-semibold">
          {t("pages.incident.reviews.title")}
        </h3>
        {reviews.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("pages.incident.reviews.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reviews.map((record) => (
              <EventRow key={record.id} record={record} config={config} realNow={realNow} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="incident-history-title" className="flex flex-col gap-2">
        <h3 id="incident-history-title" className="text-lg font-semibold">
          {t("pages.incident.history.title")}
        </h3>
        {events.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("pages.incident.history.empty")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {events.map((record) => (
              <EventRow key={record.id} record={record} config={config} realNow={realNow} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

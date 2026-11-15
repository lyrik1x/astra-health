import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { EarthReviewEvent, ProjectedIncident, SyncItemResult } from "@astra/contracts";
import { fetchMissionConfig } from "../../api/mission-config";
import { postSyncBatch } from "../../api/sync-batch";
import { CheckIcon, InfoIcon } from "../../components/icons";
import { Button } from "../../components/ui";
import { buildEarthReview } from "./earth-review";
import { interpretReviewResult, type ReviewOutcome } from "./review-result";

/** Format limit of EARTH_REVIEW text (T-005 §2.5), not clinical. */
export const REVIEW_MAX_LENGTH = 500;

type Feedback = ReviewOutcome | { kind: "TEXT_LENGTH" } | null;

interface ReviewFormProps {
  incident: ProjectedIncident;
  /** Called after ACCEPTED or DUPLICATE, so the console asks the API again right away. */
  onSent: () => void;
}

/** Text field and button for the Earth review. Shown only when `canReview(incident)`. */
export function ReviewForm({ incident, onSent }: ReviewFormProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  // The event of the last attempt. After a network error the SAME event (same UUID) is resent.
  const [pending, setPending] = useState<EarthReviewEvent | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [sending, setSending] = useState(false);

  const fieldId = `review-text-${incident.incidentId}`;
  const feedbackId = `review-feedback-${incident.incidentId}`;

  async function prepareEvent(): Promise<EarthReviewEvent | null> {
    if (pending !== null && pending.data.text === text) return pending;
    // Fresh clock right before building, in case the factor changed (clockVersion).
    const config = await fetchMissionConfig();
    const built = buildEarthReview(incident, text, config, new Date(), () => crypto.randomUUID());
    if (!built.ok) return null;
    setPending(built.event);
    return built.event;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const review = await prepareEvent();
      if (review === null) {
        setFeedback({ kind: "TEXT_LENGTH" });
        return;
      }
      let result: SyncItemResult | undefined;
      try {
        const response = await postSyncBatch({ items: [{ kind: "INCIDENT_EVENT", payload: review }] });
        result = response.results[0];
      } catch {
        result = undefined;
      }
      const outcome = interpretReviewResult(result);
      setFeedback(outcome);
      if (outcome.kind === "SENT") {
        setText("");
        setPending(null);
        onSent();
      } else if (outcome.kind === "REJECTED" || outcome.rebuild) {
        // The text is kept; the next attempt builds a new event.
        setPending(null);
      }
    } catch {
      // The mission config could not be read: nothing was sent.
      setFeedback({ kind: "RETRY", rebuild: false });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2" noValidate>
      <label htmlFor={fieldId} className="text-sm font-medium">
        {t("pages.console.review.label")}
      </label>
      <textarea
        id={fieldId}
        value={text}
        maxLength={REVIEW_MAX_LENGTH}
        rows={3}
        aria-describedby={feedback ? feedbackId : undefined}
        onChange={(change) => {
          setText(change.target.value);
          if (feedback?.kind === "SENT") setFeedback(null);
        }}
        className="w-full rounded-control border border-border bg-surface-raised px-3 py-2 text-fg"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-fg-muted">
          {t("pages.console.review.counter", { length: text.length, max: REVIEW_MAX_LENGTH })}
        </span>
        <Button type="submit" disabled={sending}>
          {sending ? t("pages.console.review.sending") : t("pages.console.review.submit")}
        </Button>
      </div>
      <ReviewFeedback id={feedbackId} feedback={feedback} />
    </form>
  );
}

/** Neutral text: the server's code is shown as information, never as a health message. */
function ReviewFeedback({ id, feedback }: { id: string; feedback: Feedback }) {
  const { t } = useTranslation();
  if (feedback === null) return null;

  if (feedback.kind === "SENT") {
    return (
      <p id={id} role="status" className="flex items-center gap-1.5 text-sm">
        <CheckIcon className="size-4 shrink-0" />
        <span>{t("pages.console.review.sent")}</span>
      </p>
    );
  }

  let message: string;
  if (feedback.kind === "TEXT_LENGTH") {
    message = t("pages.console.review.textLength", { max: REVIEW_MAX_LENGTH });
  } else if (feedback.kind === "RETRY") {
    message = feedback.code ? t("pages.console.review.tryAgainWithCode", { code: feedback.code }) : t("pages.console.review.tryAgain");
  } else if (feedback.code === "REPORT_NOT_DELIVERED") {
    message = t("pages.console.review.reportNotDelivered", { code: feedback.code });
  } else {
    message = t("pages.console.review.rejected", { code: feedback.code });
  }

  return (
    <p id={id} role="status" className="flex items-center gap-1.5 text-sm">
      <InfoIcon className="size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

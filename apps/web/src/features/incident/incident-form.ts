// T-403: format limits of the contract (T-005 §2.5). They are format limits, not clinical ones.

export const NOTE_MAX = 500;
export const REASON_MAX = 200;

export type TextCheck<T> = { ok: true; value: T } | { ok: false; errorKey: string };

/** Pure: the optional report note. Empty (or only spaces) means no note. */
export function checkReportNote(text: string): TextCheck<string | undefined> {
  const value = text.trim();
  if (value.length > NOTE_MAX) return { ok: false, errorKey: "pages.incident.report.noteTooLong" };
  return { ok: true, value: value === "" ? undefined : value };
}

/** Pure: the cancellation reason, required, 1-200 characters. */
export function checkCancelReason(text: string): TextCheck<string> {
  const value = text.trim();
  if (value.length < 1 || value.length > REASON_MAX) {
    return { ok: false, errorKey: "pages.incident.cancelForm.reasonLength" };
  }
  return { ok: true, value };
}

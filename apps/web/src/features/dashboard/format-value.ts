import type { Indicator } from "@astra/contracts";
import type { MeasurementValue } from "../measurements/build-measurement";

/** Decimals shown on screen per indicator (T-005 §3.1). Rounding happens only in the UI. */
export const DISPLAY_DECIMALS: Record<Indicator, number> = {
  HEART_RATE: 0,
  BODY_TEMPERATURE: 1,
  BLOOD_GLUCOSE: 0,
  BLOOD_PRESSURE: 0,
  MOOD: 0,
  SLEEP: 1,
};

/** Pure: an ISO date as "YYYY-MM-DD HH:mm UTC", the same on every device and locale. */
export function formatUtcMinute(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Pure: the value as text, without unit. Blood pressure as "120/80". */
export function formatMeasurementValue(indicator: Indicator, value: MeasurementValue): string {
  const decimals = DISPLAY_DECIMALS[indicator];
  if (typeof value === "number") {
    return value.toFixed(decimals);
  }
  return `${value.systolic.toFixed(decimals)}/${value.diastolic.toFixed(decimals)}`;
}

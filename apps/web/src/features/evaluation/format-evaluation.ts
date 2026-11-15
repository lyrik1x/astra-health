import type { Unit } from "@astra/contracts";
import type { ComponentResult } from "@astra/health-engine";

export function formatMedian(value: number, unit: Unit): string {
  const decimals = unit === "degC" || unit === "h" ? 1 : 0;
  return value.toFixed(decimals);
}

export function formatSignedDifference(value: number): string {
  const rounded = Number(value.toFixed(1));
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return `${normalized >= 0 ? "+" : ""}${normalized.toFixed(1)}`;
}

export function formatPercentage(value: number): string {
  return `${formatSignedDifference(value)}%`;
}

export function formatSimulatedDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatComparisonValues(component: ComponentResult, unit: Unit) {
  return {
    difference: formatSignedDifference(component.absoluteDifference),
    median: formatMedian(component.median, unit),
    percentage: component.percentDifference === null ? null : formatPercentage(component.percentDifference),
  };
}

// Formatting for the /eval dashboard.
//
// Separated from the components and unit tested, because this is the layer where
// a dashboard lies. score.ts is careful to return NaN for a metric it can't
// define; if the formatter renders NaN as "0.0%" that care is thrown away at the
// last possible moment, and the page states something false with total
// confidence. Every function here maps "undefined" to an em dash, never a digit.

import type { MetricDelta } from "@/lib/eval/diff";

/** An undefined metric renders as a dash — never as 0. */
export const NONE = "—";

export function pct(value: number, digits = 1): string {
  return Number.isNaN(value) ? NONE : `${(value * 100).toFixed(digits)}%`;
}

export function ms(value: number): string {
  if (Number.isNaN(value)) return NONE;
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

export function count(value: number): string {
  return Number.isNaN(value) ? NONE : String(value);
}

/** Direction of a change, already interpreted as good or bad. */
export type Trend = "better" | "worse" | "flat" | "none";

/**
 * Turns a raw delta into a judgement.
 *
 * `higherIsBetter` is required rather than defaulted: +40ms of latency and +4%
 * of recall are the same sign and opposite news, and a default would silently
 * paint one of them the wrong colour.
 */
export function trend(d: MetricDelta, higherIsBetter: boolean): Trend {
  if (d.delta === null) return "none";
  if (d.delta === 0) return "flat";
  const up = d.delta > 0;
  return up === higherIsBetter ? "better" : "worse";
}

/**
 * True when the metric has no baseline at all — this run measured it and the
 * previous one did not.
 *
 * `trend()` collapses this into "none" together with the NaN case, but the two
 * are different claims: a NaN delta means "measured twice, not comparable",
 * while this means "measured once". A first measurement must never be painted
 * as an improvement, and it should not be silently indistinguishable from an
 * unchanged one either — 99.7% faithfulness on its first run is a starting
 * point, not a rise.
 */
export function isFirstMeasurement(d: MetricDelta): boolean {
  return d.previous === null;
}

/**
 * The delta as a label: "+4.1", "−2.8", "0.0", or a dash when there is nothing
 * to compare. Uses a real minus sign (U+2212) rather than a hyphen so a negative
 * number lines up with a positive one in a tabular-nums column.
 */
export function deltaLabel(d: MetricDelta, scale: (n: number) => string): string {
  if (d.delta === null) return NONE;
  if (d.delta === 0) return scale(0);
  const sign = d.delta > 0 ? "+" : "−";
  return `${sign}${scale(Math.abs(d.delta))}`;
}

/** Percentage-point delta. Points, not percent — a recall move from 50% to 75% is +25pp. */
export function deltaPp(d: MetricDelta): string {
  return deltaLabel(d, (n) => `${(n * 100).toFixed(1)}pp`);
}

export function deltaMs(d: MetricDelta): string {
  return deltaLabel(d, (n) => ms(n));
}

export function deltaCount(d: MetricDelta): string {
  return deltaLabel(d, (n) => String(n));
}

/**
 * "13 Aug 2026, 23:29 UTC". Always UTC and always explicit about it: runs are
 * compared across machines, and a local-time label makes two runs look
 * out of order when they aren't.
 */
export function runDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${date}, ${time} UTC`;
}

/** Short form for dense tables: "13 Aug". */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// Counters, and nothing else.
//
// There is no event log, no session id, no IP, no user agent, no timestamp per
// hit — a metric is a name and an integer. That is a deliberate ceiling, not a
// first step: it answers "how many" without ever holding anything about anyone,
// so there is no data to leak, expire, or have to explain in a privacy policy.
//
// The cost is that you can never slice it later — no "visits this week", no
// funnel by day. If that becomes necessary it is a different design with real
// privacy consequences, and should be a deliberate decision rather than a
// widening of this one.

/**
 * Every metric the API will accept. The route rejects anything not on this
 * list, so a bored visitor with curl can't invent names and fill the table.
 */
export const METRIC_NAMES = [
  "home_view",
  "assessment_view",
  "rules_view",
  "how_it_works_view",
  "score_calculated",
  "question_asked",
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

export function isMetricName(value: unknown): value is MetricName {
  return (
    typeof value === "string" &&
    (METRIC_NAMES as readonly string[]).includes(value)
  );
}

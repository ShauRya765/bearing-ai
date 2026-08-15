import test from "node:test";
import assert from "node:assert/strict";
import {
  NONE,
  count,
  deltaCount,
  deltaMs,
  deltaPp,
  ms,
  pct,
  runDate,
  trend,
} from "@/lib/eval/format";
import type { MetricDelta } from "@/lib/eval/diff";

const d = (current: number, previous: number | null): MetricDelta => ({
  current,
  previous,
  delta:
    previous === null || Number.isNaN(current) || Number.isNaN(previous)
      ? null
      : current - previous,
});

test("an undefined metric renders as a dash, never as a number", () => {
  // The whole point of score.ts returning NaN is lost if the formatter turns it
  // into a confident 0.0%.
  assert.equal(pct(NaN), NONE);
  assert.equal(ms(NaN), NONE);
  assert.equal(count(NaN), NONE);
  assert.equal(deltaPp(d(NaN, 0.5)), NONE);
  assert.equal(deltaPp(d(0.5, null)), NONE);
});

test("recall is shown in percent and its delta in percentage points", () => {
  assert.equal(pct(0.882), "88.2%");
  assert.equal(deltaPp(d(0.882, 0.841)), "+4.1pp");
  assert.equal(deltaPp(d(0.714, 0.742)), "−2.8pp");
  // A zero delta is a measured result, not a missing one — it keeps its digits.
  assert.equal(deltaPp(d(0.5, 0.5)), "0.0pp");
  // And it is unsigned. The obvious `delta > 0 ? "+" : "−"` renders an unchanged
  // metric as "−0.0pp", which reads as a regression; a hand-rolled copy of this
  // formatter in RecallBar shipped exactly that bug.
  assert.ok(!deltaPp(d(1, 1)).includes("−"));
  assert.ok(!deltaPp(d(1, 1)).includes("+"));
  assert.equal(deltaMs(d(180, 180)), "0ms");
});

test("the same sign is good news for recall and bad news for latency", () => {
  const slower = d(240, 180);
  const higherRecall = d(0.9, 0.8);
  assert.equal(trend(higherRecall, true), "better");
  assert.equal(trend(slower, false), "worse");
  // Same raw sign, opposite verdicts — which is why higherIsBetter has no default.
  assert.ok(slower.delta! > 0 && higherRecall.delta! > 0);
});

test("no previous run means no trend, distinct from an unchanged one", () => {
  assert.equal(trend(d(0.9, null), true), "none");
  assert.equal(trend(d(0.9, 0.9), true), "flat");
});

test("latency and counts get their own scales", () => {
  assert.equal(ms(182), "182ms");
  assert.equal(ms(2140), "2.14s");
  assert.equal(deltaMs(d(240, 180)), "+60ms");
  assert.equal(deltaMs(d(1200, 3400)), "−2.20s");
  assert.equal(deltaCount(d(68, 71)), "−3");
});

test("run timestamps are labelled UTC so runs from two machines stay ordered", () => {
  const label = runDate("2026-08-13T23:29:45Z");
  assert.match(label, /13 Aug 2026/);
  assert.match(label, /23:29 UTC/);
  // A bad timestamp is echoed rather than rendered as "Invalid Date".
  assert.equal(runDate("not a date"), "not a date");
});

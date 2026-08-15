import test from "node:test";
import assert from "node:assert/strict";
import { runGate } from "@/lib/crs/engine/gate";
import { ruleset_2026_08 as rs08 } from "@/lib/crs/ruleset/ruleset-2026-08";
import { deriveDrawStatus, featuredBenchmark } from "@/components/score-summary";
import type { CrsProfile } from "@/lib/crs/engine/crs-core";

const NOW = new Date("2026-08-15T00:00:00Z");

const techProfile: CrsProfile = {
  age: 29,
  education: "masters",
  firstLanguage: { test: "IELTS", reading: 8, writing: 7, listening: 8, speaking: 7 },
  canadianWorkYears: 2,
};

test("the featured cutoff is the lowest LIVE one, not the lowest overall", () => {
  // Education's 462 undercuts CEC's 516, but it last drew 2025-09-17. Pointing
  // the meter at it would aim the candidate at a draw that isn't running.
  const gate = runGate(techProfile, 484, rs08, ["education"], NOW);
  const featured = featuredBenchmark(gate);
  assert.ok(featured);
  assert.equal(featured.category, "cec");
});

test("clearing only a quiet category is not reported as competitive", () => {
  const noCanadianWork: CrsProfile = { ...techProfile, canadianWorkYears: 0 };
  const gate = runGate(noCanadianWork, 484, rs08, ["education"], NOW);

  // The candidate IS above education's 462 — the old code would have said
  // "You'd be competitive in 1 eligible draw".
  assert.equal(gate.benchmarks[0].standing, "above");

  const status = deriveDrawStatus(gate);
  assert.equal(status.tone, "refuse");
  assert.equal(status.label, "No live draw");
  assert.match(status.heading, /gone quiet/);
  assert.equal(featuredBenchmark(gate), null);
});

test("no eligible category at all still reads as 'Not benchmarked'", () => {
  const noCanadianWork: CrsProfile = { ...techProfile, canadianWorkYears: 0 };
  const gate = runGate(noCanadianWork, 484, rs08, [], NOW);

  assert.equal(gate.benchmarks.length, 0);
  const status = deriveDrawStatus(gate);
  assert.equal(status.tone, "refuse");
  assert.equal(status.label, "Not benchmarked");
});

test("a live clear is still reported as competitive", () => {
  const gate = runGate(techProfile, 600, rs08, [], NOW);
  const status = deriveDrawStatus(gate);
  assert.equal(status.tone, "clear");
  assert.match(status.body, /CEC/);
});

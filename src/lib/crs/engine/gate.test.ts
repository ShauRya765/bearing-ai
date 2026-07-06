import test from "node:test";
import assert from "node:assert/strict";
import { runGate } from "@/lib/crs/engine/gate";
import { ruleset_2026_06 as rs } from "@/lib/crs/ruleset/ruleset-2026-06";
import type { CrsProfile } from "@/lib/crs/engine/crs-core";

const techProfile: CrsProfile = {
  age: 29,
  education: "masters",
  firstLanguage: { test: "IELTS", reading: 8, writing: 7, listening: 8, speaking: 7 },
  canadianWorkYears: 2,
};

test("a non-healthcare candidate is NOT benchmarked against the healthcare draw", () => {
  // Score 484, healthcare cutoff 475. ImmiPilot would say "you're above!"
  const result = runGate(techProfile, 484, rs, []); // no occupation categories
  const healthcare = result.benchmarks.find((b) => b.category === "healthcare");
  assert.equal(healthcare, undefined); // the gate excludes it entirely
});

test("the same candidate IS benchmarked against CEC, which they qualify for", () => {
  const result = runGate(techProfile, 484, rs, []);
  const cec = result.benchmarks.find((b) => b.category === "cec");
  assert.ok(cec);
  assert.equal(cec.cutoff, 518);
  assert.equal(cec.standing, "below"); // 484 < 518 — the HONEST answer
});

test("no eligible category yields an honest 'no comparison' summary, not a fake cutoff", () => {
  const noCanadianWork: CrsProfile = { ...techProfile, canadianWorkYears: 0 };
  const result = runGate(noCanadianWork, 450, rs, []);
  assert.equal(result.benchmarks.length, 0);
  assert.match(result.honestSummary, /isn't eligible/);
});
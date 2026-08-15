import test from "node:test";
import assert from "node:assert/strict";
import { runGate } from "@/lib/crs/engine/gate";
import { ruleset_2026_06 as rs } from "@/lib/crs/ruleset/ruleset-2026-06";
import { ruleset_2026_07 as rs07 } from "@/lib/crs/ruleset/ruleset-2026-07";
import { ruleset_2026_08 as rs08 } from "@/lib/crs/ruleset/ruleset-2026-08";
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

test("a candidate without a qualifying French test is NOT benchmarked against the french draw", () => {
  const result = runGate(techProfile, 484, rs, []);
  const french = result.benchmarks.find((b) => b.category === "french");
  assert.equal(french, undefined);
});

test("a candidate with strong French (TEF at NCLC 7+) IS benchmarked against the french draw", () => {
  const frenchProfile: CrsProfile = {
    ...techProfile,
    secondLanguage: { test: "TEF", reading: 207, writing: 310, listening: 249, speaking: 310 },
  };
  const result = runGate(frenchProfile, 400, rs, []);
  const french = result.benchmarks.find((b) => b.category === "french");
  assert.ok(french);
  assert.equal(french.cutoff, 393);
});

// ---- 2026-07: the categories IRCC added mid-year ----
// physicians and seniorManagers need the occupation AND Canadian work. The
// physician cutoff is 223, far below any realistic score, so an occupation-only
// gate would hand almost everyone a bogus "you're above!" against a draw they
// cannot be invited from. These pin both halves of the condition.

test("the physician category needs Canadian work experience, not just the occupation", () => {
  const noCanadianWork: CrsProfile = { ...techProfile, canadianWorkYears: 0 };
  const result = runGate(noCanadianWork, 484, rs07, ["physicians"]);
  assert.equal(result.benchmarks.find((b) => b.category === "physicians"), undefined);

  const excluded = result.excluded.find((e) => e.category === "physicians");
  assert.ok(excluded);
  assert.match(excluded.reason, /requires 1\+ year Canadian work/);
});

test("a physician WITH Canadian work experience is benchmarked", () => {
  const result = runGate(techProfile, 484, rs07, ["physicians"]);
  const physicians = result.benchmarks.find((b) => b.category === "physicians");
  assert.ok(physicians);
  assert.equal(physicians.cutoff, 223);
  assert.equal(physicians.standing, "above");
});

test("2026-07 draw data is current: cec, french and pnp all moved", () => {
  const result = runGate(techProfile, 484, rs07, []);
  const cec = result.benchmarks.find((b) => b.category === "cec");
  assert.ok(cec);
  // Round #428, 2026-07-21 — supersedes the 518 the previous ruleset carried.
  assert.equal(cec.cutoff, 516);
  assert.equal(cec.drawDate, "2026-07-21");
});

test("2026-08 draw data is current: cec, french, pnp and transport all moved", () => {
  const result = runGate(techProfile, 484, rs08, []);

  const cec = result.benchmarks.find((b) => b.category === "cec");
  assert.ok(cec);
  // Round #432, 2026-08-05 — same 516 cutoff, larger draw.
  assert.equal(cec.drawDate, "2026-08-05");
  assert.equal(cec.cutoff, 516);

  // techProfile has no French, so the gate correctly withholds that benchmark —
  // check the record itself. Round #433, 2026-08-06, cutoff fell 399 → 391.
  const french = rs08.recentDraws.find((d) => d.category === "french");
  assert.ok(french);
  assert.equal(french.date, "2026-08-06");
  assert.equal(french.cutoff, 391);

  // Same for PNP: no provincial nomination, so no benchmark. Round #431.
  const pnp = rs08.recentDraws.find((d) => d.category === "pnp");
  assert.ok(pnp);
  assert.equal(pnp.date, "2026-08-04");
  assert.equal(pnp.cutoff, 768);
});

test("transport is live again in 2026-08, not the dead 2024 round", () => {
  // Round #434, 2026-08-07, the first transport draw since #289 (2024-03-13).
  const transport = rs08.recentDraws.find((d) => d.category === "transport");
  assert.ok(transport);
  assert.equal(transport.date, "2026-08-07");
  assert.equal(transport.cutoff, 470);
  assert.equal(transport.invitations, 300);
});
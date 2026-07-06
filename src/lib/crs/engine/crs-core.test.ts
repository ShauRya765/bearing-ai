import test from "node:test";
import assert from "node:assert/strict";
import { scoreCore } from "@/lib/crs/engine/crs-core";
import { ruleset_2026_06 as rs } from "@/lib/crs/ruleset/ruleset-2026-06";

test("scores a strong single-applicant profile", () => {
  const score = scoreCore(
    {
      age: 29,
      education: "masters",
      firstLanguage: { test: "IELTS", reading: 8.0, writing: 7.5, listening: 8.5, speaking: 7.5 },
      canadianWorkYears: 3,
    },
    rs,
  );
  // age 110 + masters 135 + CLB10 x4 (34x4=136) + 3yr Cdn (64) = 445

  // core 445 + transferability 50 (Master's x CLB9+ = 25, Master's x 2yr+ Cdn = 25) = 495
  assert.equal(score.total, 495);
});

test("age outside the table yields 0, not a crash", () => {
  const score = scoreCore(
    {
      age: 99,
      education: "bachelors",
      firstLanguage: { test: "IELTS", reading: 6.0, writing: 6.0, listening: 6.0, speaking: 6.0 },
      canadianWorkYears: 0,
    },
    rs,
  );
  const age = score.factors.find((f) => f.factor === "Age")!;
  assert.equal(age.points, 0);
});
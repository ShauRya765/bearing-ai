import test from "node:test";
import assert from "node:assert/strict";
import { scoreCore } from "@/lib/crs/engine/crs-core";
import { toCLB } from "@/lib/crs/engine/clb";
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

  // core 445 + transferability: Master's is the "two or more / advanced"
  // tier (50 x CLB9+, 50 x 2yr+ Cdn = 100, capped at 50) = 495
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

test("CELPIP maps 1:1 to CLB, and 10-12 all collapse to the CLB 10 ceiling", () => {
  const clb = toCLB(
    { test: "CELPIP", reading: 7, writing: 11, listening: 12, speaking: 4 },
    rs,
  );
  assert.equal(clb.reading, 7);
  assert.equal(clb.writing, 10);
  assert.equal(clb.listening, 10);
  assert.equal(clb.speaking, 4);
});

test("TEF at NCLC 7 as second language: 12 points plus the strong-French bonus", () => {
  const score = scoreCore(
    {
      age: 29,
      education: "bachelors",
      firstLanguage: { test: "IELTS", reading: 6.0, writing: 6.0, listening: 6.0, speaking: 6.0 }, // CLB6+ -> English floor >= 5
      canadianWorkYears: 0,
      secondLanguage: { test: "TEF", reading: 207, writing: 310, listening: 249, speaking: 310 }, // NCLC 7 across the board
    },
    rs,
  );

  const secondLanguage = score.factors.find((f) => f.factor === "Second official language")!;
  assert.equal(secondLanguage.points, 12); // 3 pts x 4 abilities at CLB 7

  const additional = score.factors.find((f) => f.factor === "Additional points")!;
  assert.equal(additional.points, 50); // frenchStrong.withEnglish, since English floor >= 5
});

test("second official language points are capped at 24", () => {
  const score = scoreCore(
    {
      age: 29,
      education: "bachelors",
      firstLanguage: { test: "IELTS", reading: 8.0, writing: 7.5, listening: 8.5, speaking: 7.5 },
      canadianWorkYears: 0,
      secondLanguage: { test: "CELPIP", reading: 10, writing: 10, listening: 10, speaking: 10 }, // 6 x 4 = 24
    },
    rs,
  );
  const secondLanguage = score.factors.find((f) => f.factor === "Second official language")!;
  assert.equal(secondLanguage.points, 24);
});

test("matches IRCC's published worked example exactly (age 25, single, Master's, CELPIP, 1yr Cdn + 1yr foreign work, Cdn credential 3yr+/advanced)", () => {
  // Sourced from canada.ca's "Express Entry: Check your score" calculator,
  // accessed 2026-07-16. Its own breakdown: Age 110, Education 135, First
  // Official Language 130, Canadian work experience 40 (core 415) + Skill
  // transferability 88 + Additional points 30 (study in Canada) = 533.
  const score = scoreCore(
    {
      age: 25,
      education: "masters",
      firstLanguage: { test: "CELPIP", speaking: 9, listening: 10, reading: 9, writing: 10 },
      canadianWorkYears: 1,
      foreignWorkYears: 1,
      canadianCredential: "threeYearsPlus",
    },
    rs,
  );

  assert.equal(score.factors.find((f) => f.factor === "Age")!.points, 110);
  assert.equal(score.factors.find((f) => f.factor === "Education")!.points, 135);
  assert.equal(score.factors.find((f) => f.factor === "First official language")!.points, 130);
  assert.equal(score.factors.find((f) => f.factor === "Canadian work experience")!.points, 40);
  assert.equal(score.factors.find((f) => f.factor === "Skill transferability")!.points, 88);
  assert.equal(score.factors.find((f) => f.factor === "Additional points")!.points, 30);
  assert.equal(score.total, 533);
});

test("Canadian credential bonus: no credential = 0, 1-2yr = 15, 3yr+/advanced = 30", () => {
  const base = {
    age: 29,
    education: "bachelors" as const,
    firstLanguage: { test: "IELTS" as const, reading: 6.0, writing: 6.0, listening: 6.0, speaking: 6.0 },
    canadianWorkYears: 0,
  };

  const none = scoreCore(base, rs);
  assert.equal(none.factors.find((f) => f.factor === "Additional points")!.points, 0);

  const oneOrTwo = scoreCore({ ...base, canadianCredential: "oneOrTwoYears" }, rs);
  assert.equal(oneOrTwo.factors.find((f) => f.factor === "Additional points")!.points, 15);

  const threePlus = scoreCore({ ...base, canadianCredential: "threeYearsPlus" }, rs);
  assert.equal(threePlus.factors.find((f) => f.factor === "Additional points")!.points, 30);
});

test("education-transferability pays the two-or-more/advanced tier for a Master's, not the one-credential tier", () => {
  const score = scoreCore(
    {
      age: 29,
      education: "masters",
      firstLanguage: { test: "IELTS", reading: 8.0, writing: 7.5, listening: 8.5, speaking: 7.5 }, // CLB9+ all
      canadianWorkYears: 0, // no Canadian-work component, isolates the language component
    },
    rs,
  );
  const transferability = score.factors.find((f) => f.factor === "Skill transferability")!;
  assert.equal(transferability.points, 50); // advanced tier's clb9 payout, not the one-credential tier's 25
});

test("certificate of qualification: 50 at CLB 7+ on all four, 25 at CLB 5+ with one under 7, 0 below that", () => {
  // Isolates the trade-certificate row of skill transferability: secondary
  // education contributes nothing, and there is no Canadian or foreign work.
  const base = {
    age: 29,
    education: "secondary" as const,
    canadianWorkYears: 0,
    hasTradeCertificate: true,
  };
  const transferability = (p: Parameters<typeof scoreCore>[0]) =>
    scoreCore(p, rs).factors.find((f) => f.factor === "Skill transferability")!.points;

  // CLB 7 across the board -> the top tier.
  assert.equal(
    transferability({ ...base, firstLanguage: { test: "IELTS", reading: 6.0, writing: 6.0, listening: 6.0, speaking: 6.0 } }),
    50,
  );

  // CLB 6 across the board: at or above 5, but not 7 on all four.
  assert.equal(
    transferability({ ...base, firstLanguage: { test: "IELTS", reading: 5.0, writing: 5.5, listening: 5.5, speaking: 5.5 } }),
    25,
  );

  // IRCC's wording is "CLB 5 or more on all ... abilities, one or more under
  // 7" — a single weak ability drops the whole factor to the lower tier, it
  // does not average out.
  assert.equal(
    transferability({ ...base, firstLanguage: { test: "IELTS", reading: 4.0, writing: 7.0, listening: 8.0, speaking: 7.0 } }),
    25,
  );

  // One ability under CLB 5 pays nothing at all.
  assert.equal(
    transferability({ ...base, firstLanguage: { test: "IELTS", reading: 3.5, writing: 7.0, listening: 8.0, speaking: 7.0 } }),
    0,
  );

  // No certificate, same language: nothing.
  assert.equal(
    transferability({ ...base, hasTradeCertificate: false, firstLanguage: { test: "IELTS", reading: 6.0, writing: 6.0, listening: 6.0, speaking: 6.0 } }),
    0,
  );
});

test("accompanying spouse switches the core tables and adds a Spouse factors line", () => {
  const withoutSpouse = scoreCore(
    {
      age: 29,
      education: "masters",
      firstLanguage: { test: "IELTS", reading: 8.0, writing: 7.5, listening: 8.5, speaking: 7.5 },
      canadianWorkYears: 3,
    },
    rs,
  );

  const withSpouse = scoreCore(
    {
      age: 29,
      education: "masters",
      firstLanguage: { test: "IELTS", reading: 8.0, writing: 7.5, listening: 8.5, speaking: 7.5 },
      canadianWorkYears: 3,
      spouseAccompanying: true,
      spouseEducation: "bachelors",
      spouseLanguage: { test: "IELTS", reading: 6.0, writing: 6.0, listening: 6.0, speaking: 6.0 }, // CLB7 all
      spouseCanadianWorkYears: 2,
    },
    rs,
  );

  assert.equal(withoutSpouse.factors.find((f) => f.factor === "Age")!.points, 110);
  assert.equal(withSpouse.factors.find((f) => f.factor === "Age")!.points, 100); // with-spouse table, not 110
  assert.equal(withSpouse.factors.find((f) => f.factor === "Education")!.points, 126); // with-spouse table, not 135
  assert.equal(withSpouse.factors.find((f) => f.factor === "First official language")!.points, 128); // with-spouse table, not 136
  assert.equal(withSpouse.factors.find((f) => f.factor === "Canadian work experience")!.points, 56); // with-spouse table, not 64

  const spouseFactors = withSpouse.factors.find((f) => f.factor === "Spouse factors")!;
  assert.equal(spouseFactors.max, 40);
  assert.equal(spouseFactors.points, 27); // bachelors 8 + CLB7x4 (3x4=12) + 2yr Cdn work 7 = 27

  // Without an accompanying spouse the row is present but scores 0.
  assert.equal(withoutSpouse.factors.find((f) => f.factor === "Spouse factors")!.points, 0);
});
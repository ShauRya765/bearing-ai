import { test } from "node:test";
import assert from "node:assert/strict";
import { gapLevers } from "@/lib/crs/engine/levers";
import { scoreCore, type CrsProfile } from "@/lib/crs/engine/crs-core";
import { ruleset_2026_06 as ruleset } from "@/lib/crs/ruleset/ruleset-2026-06";

// A middling English-only single applicant with room to grow.
const base: CrsProfile = {
    age: 29,
    education: "bachelors",
    firstLanguage: { test: "IELTS", reading: 6, writing: 6, listening: 6, speaking: 6 },
    canadianWorkYears: 1,
};

test("surfaces a strong-French lever when no French test is present", () => {
    const levers = gapLevers(base, ruleset);
    const french = levers.find((l) => l.id === "french");
    assert.ok(french, "expected a French lever");
    // Second-language points + the French bonus — well over the bonus alone.
    assert.ok(french!.delta >= 25, `French delta too small: ${french!.delta}`);
});

test("surfaces the certificate-of-qualification lever worth exactly its transferability points", () => {
    const levers = gapLevers(base, ruleset);
    const trade = levers.find((l) => l.id === "trade");
    assert.ok(trade, "expected a trade-certificate lever");
    // CLB 6 floor here → the clb5 tier (25). Prove it's the engine's number.
    const withCert = scoreCore({ ...base, hasTradeCertificate: true }, ruleset).total;
    assert.equal(trade!.delta, withCert - scoreCore(base, ruleset).total);
});

test("every delta equals a real counterfactual re-run and is positive", () => {
    const levers = gapLevers(base, ruleset);
    assert.ok(levers.length >= 3);
    for (const l of levers) assert.ok(l.delta > 0, `${l.id} not positive`);
    // Sorted by impact, descending.
    for (let i = 1; i < levers.length; i++) {
        assert.ok(levers[i - 1].delta >= levers[i].delta);
    }
});

test("drops levers already satisfied by the profile", () => {
    const maxed: CrsProfile = {
        ...base,
        provincialNomination: true,
        hasTradeCertificate: true,
        siblingInCanada: true,
        canadianCredential: "threeYearsPlus",
        secondLanguage: { test: "TEF", reading: 207, writing: 310, listening: 249, speaking: 310 },
    };
    const ids = gapLevers(maxed, ruleset).map((l) => l.id);
    assert.ok(!ids.includes("pnp"));
    assert.ok(!ids.includes("trade"));
    assert.ok(!ids.includes("french"));
});

test("a lever whose points don't fit under a cap says so", () => {
  // This profile already holds 88 of 100 skill-transferability points, so a
  // certificate of qualification — worth 50 on its own — can only add 12.
  // Reported without explanation, the correct +12 reads as a broken number.
  const profile = {
    age: 25,
    education: "masters" as const,
    firstLanguage: { test: "CELPIP" as const, speaking: 9, listening: 10, reading: 9, writing: 10 },
    canadianWorkYears: 1,
    foreignWorkYears: 1,
    canadianCredential: "threeYearsPlus" as const,
  };

  const trade = gapLevers(profile, ruleset).find((l) => l.id === "trade")!;
  assert.equal(trade.delta, 12);
  assert.match(trade.cappedBy ?? "", /88\/100/);
  assert.match(trade.cappedBy ?? "", /only 12/);

  // A profile with room to spare gets the full 50 and no cap note.
  const roomy = {
    age: 25,
    education: "secondary" as const,
    firstLanguage: { test: "CELPIP" as const, speaking: 9, listening: 9, reading: 9, writing: 9 },
    canadianWorkYears: 0,
  };
  const uncapped = gapLevers(roomy, ruleset).find((l) => l.id === "trade")!;
  assert.equal(uncapped.delta, 50);
  assert.equal(uncapped.cappedBy, undefined);
});

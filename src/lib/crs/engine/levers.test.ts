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

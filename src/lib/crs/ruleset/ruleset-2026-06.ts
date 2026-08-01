import type { Ruleset } from "@/lib/crs/ruleset/types";

// VERIFY BEFORE PRODUCTION. Values must match IRCC's published charts:
// https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html
// `verified` stays false until a human checks every cell. Check the
// LISTENING column first — sources disagree on whether 7.0 is CLB 7 or 8.

export const ruleset_2026_06: Ruleset = {
    version: "2026-06",
    source:
        "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html",
    verified: false,
    language: {
        IELTS: [
            { clb: 10, reading: 8.0, writing: 7.5, listening: 8.5, speaking: 7.5 },
            { clb: 9, reading: 7.0, writing: 7.0, listening: 8.0, speaking: 7.0 },
            { clb: 8, reading: 6.5, writing: 6.5, listening: 7.5, speaking: 6.5 },
            { clb: 7, reading: 6.0, writing: 6.0, listening: 6.0, speaking: 6.0 },
            { clb: 6, reading: 5.0, writing: 5.5, listening: 5.5, speaking: 5.5 },
            { clb: 5, reading: 4.0, writing: 5.0, listening: 5.0, speaking: 5.0 },
            { clb: 4, reading: 3.5, writing: 4.0, listening: 4.5, speaking: 4.0 },
        ],
        // CELPIP-G maps 1:1 to CLB per skill; scores of 10-12 all collapse to
        // CLB 10 (the CRS ceiling), which the >= comparison in clb.ts already
        // gives us for free from a single clb:10 -> raw:10 row.
        CELPIP: [
            { clb: 10, reading: 10, writing: 10, listening: 10, speaking: 10 },
            { clb: 9, reading: 9, writing: 9, listening: 9, speaking: 9 },
            { clb: 8, reading: 8, writing: 8, listening: 8, speaking: 8 },
            { clb: 7, reading: 7, writing: 7, listening: 7, speaking: 7 },
            { clb: 6, reading: 6, writing: 6, listening: 6, speaking: 6 },
            { clb: 5, reading: 5, writing: 5, listening: 5, speaking: 5 },
            { clb: 4, reading: 4, writing: 4, listening: 4, speaking: 4 },
        ],
        // VERIFY: PTE Core -> CLB conversion. Lower bound of each IRCC band,
        // matching the IELTS table's no-interpolation convention. Cross-check
        // every cell against canada.ca before flipping `verified: true`.
        PTE: [
            { clb: 10, reading: 88, writing: 90, listening: 89, speaking: 89 },
            { clb: 9, reading: 78, writing: 88, listening: 82, speaking: 84 },
            { clb: 8, reading: 69, writing: 79, listening: 71, speaking: 76 },
            { clb: 7, reading: 60, writing: 69, listening: 60, speaking: 68 },
            { clb: 6, reading: 50, writing: 60, listening: 50, speaking: 59 },
            { clb: 5, reading: 42, writing: 51, listening: 39, speaking: 51 },
            { clb: 4, reading: 33, writing: 41, listening: 28, speaking: 42 },
        ],
        // VERIFY: TEF Canada -> NCLC (French CLB) conversion. Reading /300,
        // listening /360, writing & speaking /450. Lower bound per band.
        TEF: [
            { clb: 10, reading: 263, writing: 393, listening: 316, speaking: 393 },
            { clb: 9, reading: 248, writing: 371, listening: 298, speaking: 371 },
            { clb: 8, reading: 233, writing: 349, listening: 280, speaking: 349 },
            { clb: 7, reading: 207, writing: 310, listening: 249, speaking: 310 },
            { clb: 6, reading: 181, writing: 271, listening: 217, speaking: 271 },
            { clb: 5, reading: 151, writing: 226, listening: 181, speaking: 226 },
            { clb: 4, reading: 121, writing: 181, listening: 145, speaking: 181 },
        ],
        // VERIFY: TCF Canada -> NCLC (French CLB) conversion. Reading &
        // listening /699, writing & speaking /20. Lower bound per band.
        TCF: [
            { clb: 10, reading: 549, writing: 16, listening: 549, speaking: 16 },
            { clb: 9, reading: 524, writing: 14, listening: 523, speaking: 14 },
            { clb: 8, reading: 499, writing: 12, listening: 503, speaking: 12 },
            { clb: 7, reading: 453, writing: 10, listening: 458, speaking: 10 },
            { clb: 6, reading: 406, writing: 7, listening: 398, speaking: 7 },
            { clb: 5, reading: 375, writing: 6, listening: 369, speaking: 6 },
            { clb: 4, reading: 342, writing: 4, listening: 331, speaking: 4 },
        ],
    },
    crs: {
        // Confirmed 2026-07-16 against IRCC's "Check your score" worked
        // example (age 25, single, Master's, CELPIP 9/10-12/9/10-12): Age
        // 110, Education 135, First Official Language 130. See
        // crs-core.test.ts "matches IRCC's published worked example".
        ageSingle: {
            18: 99, 19: 105,
            20: 110, 21: 110, 22: 110, 23: 110, 24: 110, 25: 110, 26: 110, 27: 110, 28: 110, 29: 110,
            30: 105, 31: 99, 32: 94, 33: 88, 34: 83, 35: 77, 36: 72, 37: 66, 38: 61, 39: 55,
            40: 50, 41: 39, 42: 28, 43: 17, 44: 6,
        },
        // Verified 2026-07-31 against IRCC's published age table (both
        // columns). Max 100 (vs. 110 single) at 20-29, 0 past 44.
        ageWithSpouse: {
            18: 90, 19: 95,
            20: 100, 21: 100, 22: 100, 23: 100, 24: 100, 25: 100, 26: 100, 27: 100, 28: 100, 29: 100,
            30: 95, 31: 90, 32: 85, 33: 80, 34: 75, 35: 70, 36: 65, 37: 60, 38: 55, 39: 50,
            40: 45, 41: 35, 42: 25, 43: 15, 44: 5,
        },
        education: {
            none: 0,
            secondary: 30,
            oneYearPostSecondary: 90,
            twoYearPostSecondary: 98,
            bachelors: 120,
            twoOrMoreCredentials: 128,
            masters: 135,
            doctoral: 150,
        },
        // VERIFY: "with a spouse or common-law partner" education table.
        educationWithSpouse: {
            none: 0,
            secondary: 28,
            oneYearPostSecondary: 84,
            twoYearPostSecondary: 91,
            bachelors: 112,
            twoOrMoreCredentials: 119,
            masters: 126,
            doctoral: 140,
        },
        firstLanguagePerAbility: { 4: 6, 5: 6, 6: 9, 7: 17, 8: 23, 9: 31, 10: 34 },
        // VERIFY: "with a spouse or common-law partner" first-language table.
        firstLanguagePerAbilityWithSpouse: { 4: 6, 5: 6, 6: 8, 7: 16, 8: 22, 9: 29, 10: 32 },
        secondLanguagePerAbility: { 5: 1, 6: 1, 7: 3, 8: 3, 9: 6, 10: 6 },
        // Per-ability values are the same either way (max 6), but IRCC caps
        // the combined second-language total lower when a spouse or
        // common-law partner is accompanying: 22 instead of 24. Without this
        // the with-spouse ceiling comes to 502, not the published 500.
        secondLanguageCap: 24,
        secondLanguageCapWithSpouse: 22,
        // Confirmed 2026-07-16 against IRCC's worked example: 1 year -> 40.
        canadianExperienceSingle: { 0: 0, 1: 40, 2: 53, 3: 64, 4: 72, 5: 80 },
        // VERIFY: "with a spouse or common-law partner" Canadian work table.
        canadianExperienceWithSpouse: { 0: 0, 1: 35, 2: 46, 3: 56, 4: 63, 5: 70 },
    },
    // VERIFY: points for an accompanying spouse/common-law partner's own
    // education, first-language CLB (per skill, max 5 each), and Canadian
    // work experience. Only scored when CrsProfile.spouseAccompanying is
    // true; capped as one group per IRCC's "Spouse factors" subtotal.
    spouseFactors: {
        education: {
            none: 0,
            secondary: 2,
            oneYearPostSecondary: 6,
            twoYearPostSecondary: 7,
            bachelors: 8,
            twoOrMoreCredentials: 9,
            masters: 10,
            doctoral: 10,
        },
        languagePerAbility: { 4: 0, 5: 1, 6: 1, 7: 3, 8: 3, 9: 5, 10: 5 },
        canadianExperience: { 0: 0, 1: 5, 2: 7, 3: 8, 4: 9, 5: 10 },
        cap: 40,
    },
    transferability: {
        // Confirmed 2026-07-16 against IRCC's worked example: Master's (the
        // "two or more credentials ... OR Master's/professional/doctoral"
        // tier) + CLB 9+ all abilities = 50, not the one-credential tier's 25.
        educationWithLanguage: {
            oneCredential: { clb9: 25, clb7: 13 },
            twoOrMoreOrAdvanced: { clb9: 50, clb7: 25 },
        },
        // Confirmed 2026-07-16 against the same worked example: Master's + 1
        // year Canadian work = 25, not the one-credential tier's 13.
        educationWithCanadianWork: {
            oneCredential: { years2plus: 25, years1: 13 },
            twoOrMoreOrAdvanced: { years2plus: 50, years1: 25 },
        },
        // Confirmed 2026-07-16 against IRCC's worked example: 1 year foreign
        // work + CLB9+ = 25 (A), + 1 year Canadian work = 13 (B), sum 38.
        foreignWithLanguage: {
            years3plus: { clb9: 50, clb7: 25 },
            years1to2: { clb9: 25, clb7: 13 },
        },
        foreignWithCanadianWork: {
            years3plus: { cdn2plus: 50, cdn1: 25 },
            years1to2: { cdn2plus: 25, cdn1: 13 },
        },
        tradeCertificate: { clb7: 50, clb5: 25 },
        categoryCap: 50,
        totalCap: 100,
    },
    additional: {
        provincialNomination: 600,
        siblingInCanada: 15,
        // Confirmed 2026-07-16 against IRCC's worked example: a Canadian
        // credential of three years or longer (or Master's/professional/
        // doctoral) = 30.
        canadianStudy: { oneOrTwoYears: 15, threeYearsPlus: 30 },
        frenchStrong: { withEnglish: 50, withoutEnglish: 25 },
        // "Additional points: maximum 600 points". A provincial nomination
        // alone exhausts it, so a nominee's sibling/study/French points are
        // absorbed rather than added.
        cap: 600,
    },
    // VERIFY against IRCC Express Entry rounds. Most recent per category.
    recentDraws: [
        { category: "healthcare", date: "2026-06-25", cutoff: 475, invitations: 4000 },
        { category: "cec", date: "2026-06-23", cutoff: 518, invitations: 3000 },
        { category: "french", date: "2026-06-10", cutoff: 393, invitations: 2500 },
        { category: "trades", date: "2026-04-02", cutoff: 477, invitations: 1500 },
        { category: "education", date: "2026-05-15", cutoff: 462, invitations: 2500 },
        { category: "pnp", date: "2026-06-18", cutoff: 752, invitations: 1000 },
        // No general draw since 2024-04-23 (cutoff 529). No STEM draw since 2024-04.
    ],
};
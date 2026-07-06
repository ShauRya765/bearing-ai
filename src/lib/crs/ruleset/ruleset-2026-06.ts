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
    },
    crs: {
        ageSingle: {
            18: 90, 19: 95,
            20: 110, 21: 110, 22: 110, 23: 110, 24: 110, 25: 110, 26: 110, 27: 110, 28: 110, 29: 110,
            30: 105, 31: 99, 32: 94, 33: 88, 34: 83, 35: 77, 36: 72, 37: 66, 38: 61, 39: 55,
            40: 50, 41: 39, 42: 28, 43: 17, 44: 6,
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
        firstLanguagePerAbility: { 4: 6, 5: 6, 6: 9, 7: 17, 8: 23, 9: 31, 10: 34 },
        canadianExperienceSingle: { 0: 0, 1: 40, 2: 53, 3: 64, 4: 72, 5: 80 },
    },
    transferability: {
        educationWithLanguage: { clb9: 25, clb7: 13 },
        educationWithCanadianWork: { years2plus: 25, years1: 13 },
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
        canadianStudy: { oneOrTwoYears: 15, threeYearsPlus: 30 },
        frenchStrong: { withEnglish: 50, withoutEnglish: 25 },
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
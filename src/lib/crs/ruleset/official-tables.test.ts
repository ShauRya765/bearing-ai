import test from "node:test";
import assert from "node:assert/strict";
import { ruleset_2026_06 as rs } from "@/lib/crs/ruleset/ruleset-2026-06";
import { scoreCore } from "@/lib/crs/engine/crs-core";
import type { EducationLevel } from "@/lib/crs/ruleset/types";

// Every number below is transcribed from IRCC's published CRS criteria page:
// https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score/crs-criteria.html
// (saved copy accessed 2026-07-31). Each table is written as
// [with spouse or common-law partner, without] so the two columns are checked
// together and can't drift apart the way they did for ages 18-19.
//
// This file exists to answer one question: is every factor IRCC scores present
// in the ruleset, with the published value in every cell? It asserts data, not
// behaviour — engine logic is covered by crs-core.test.ts.

test("A. core/human capital — section maxima", () => {
    // "Points with a spouse or common-law partner" / "without"
    const maxima = {
        age: [100, 110],
        education: [140, 150],
        officialLanguages: [150, 160], // first + second combined
        canadianWork: [70, 80],
    };

    const maxOf = (table: Partial<Record<number | string, number>>) =>
        Math.max(...Object.values(table).map((v) => v ?? 0));

    assert.equal(maxOf(rs.crs.ageWithSpouse), maxima.age[0]);
    assert.equal(maxOf(rs.crs.ageSingle), maxima.age[1]);
    assert.equal(maxOf(rs.crs.educationWithSpouse), maxima.education[0]);
    assert.equal(maxOf(rs.crs.education), maxima.education[1]);
    assert.equal(maxOf(rs.crs.canadianExperienceWithSpouse), maxima.canadianWork[0]);
    assert.equal(maxOf(rs.crs.canadianExperienceSingle), maxima.canadianWork[1]);

    // Official languages = 4 abilities of first language + the second-language cap.
    assert.equal(
        maxOf(rs.crs.firstLanguagePerAbilityWithSpouse) * 4 + rs.crs.secondLanguageCapWithSpouse,
        maxima.officialLanguages[0],
    );
    assert.equal(
        maxOf(rs.crs.firstLanguagePerAbility) * 4 + rs.crs.secondLanguageCap,
        maxima.officialLanguages[1],
    );
});

test("A1. age", () => {
    // age -> [with spouse, without]
    const official: Record<number, [number, number]> = {
        17: [0, 0],
        18: [90, 99],
        19: [95, 105],
        20: [100, 110], 21: [100, 110], 22: [100, 110], 23: [100, 110], 24: [100, 110],
        25: [100, 110], 26: [100, 110], 27: [100, 110], 28: [100, 110], 29: [100, 110],
        30: [95, 105],
        31: [90, 99],
        32: [85, 94],
        33: [80, 88],
        34: [75, 83],
        35: [70, 77],
        36: [65, 72],
        37: [60, 66],
        38: [55, 61],
        39: [50, 55],
        40: [45, 50],
        41: [35, 39],
        42: [25, 28],
        43: [15, 17],
        44: [5, 6],
        45: [0, 0], // "45 years of age or more"
    };

    for (const [age, [withSpouse, single]] of Object.entries(official)) {
        assert.equal(rs.crs.ageWithSpouse[Number(age)] ?? 0, withSpouse, `age ${age} with spouse`);
        assert.equal(rs.crs.ageSingle[Number(age)] ?? 0, single, `age ${age} without spouse`);
    }
});

test("A2. level of education", () => {
    const official: Record<EducationLevel, [number, number]> = {
        none: [0, 0],                    // less than secondary school
        secondary: [28, 30],
        oneYearPostSecondary: [84, 90],
        twoYearPostSecondary: [91, 98],
        bachelors: [112, 120],           // bachelor's OR 3+ year program
        twoOrMoreCredentials: [119, 128],
        masters: [126, 135],             // master's OR entry-to-practice professional degree
        doctoral: [140, 150],
    };

    for (const [level, [withSpouse, single]] of Object.entries(official) as [EducationLevel, [number, number]][]) {
        assert.equal(rs.crs.educationWithSpouse[level], withSpouse, `${level} with spouse`);
        assert.equal(rs.crs.education[level], single, `${level} without spouse`);
    }
});

test("A3. first official language — points per ability", () => {
    // Max per ability: 32 with a spouse, 34 without.
    const official: Record<number, [number, number]> = {
        3: [0, 0],   // less than CLB 4
        4: [6, 6],
        5: [6, 6],
        6: [8, 9],
        7: [16, 17],
        8: [22, 23],
        9: [29, 31],
        10: [32, 34], // CLB 10 or more
    };

    for (const [clb, [withSpouse, single]] of Object.entries(official)) {
        const c = Number(clb) as 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
        assert.equal(rs.crs.firstLanguagePerAbilityWithSpouse[c] ?? 0, withSpouse, `CLB ${clb} with spouse`);
        assert.equal(rs.crs.firstLanguagePerAbility[c] ?? 0, single, `CLB ${clb} without spouse`);
    }
});

test("A4. second official language — points per ability and combined cap", () => {
    // Same per-ability values with or without a spouse (max 6 each), but the
    // combined maximum differs: 22 with a spouse, 24 without.
    const official: Record<number, number> = {
        4: 0, // CLB 4 or less
        5: 1, 6: 1,
        7: 3, 8: 3,
        9: 6, 10: 6, // CLB 9 or more
    };

    for (const [clb, points] of Object.entries(official)) {
        const c = Number(clb) as 4 | 5 | 6 | 7 | 8 | 9 | 10;
        assert.equal(rs.crs.secondLanguagePerAbility[c] ?? 0, points, `CLB ${clb}`);
    }

    assert.equal(rs.crs.secondLanguageCapWithSpouse, 22);
    assert.equal(rs.crs.secondLanguageCap, 24);
});

test("A5. Canadian work experience", () => {
    const official: Record<number, [number, number]> = {
        0: [0, 0], // none or less than a year
        1: [35, 40],
        2: [46, 53],
        3: [56, 64],
        4: [63, 72],
        5: [70, 80], // 5 years or more
    };

    for (const [years, [withSpouse, single]] of Object.entries(official)) {
        assert.equal(rs.crs.canadianExperienceWithSpouse[Number(years)], withSpouse, `${years}y with spouse`);
        assert.equal(rs.crs.canadianExperienceSingle[Number(years)], single, `${years}y without spouse`);
    }
});

test("B. spouse or common-law partner factors", () => {
    // Section maxima: education 10, official language proficiency 20,
    // Canadian work experience 10 — 40 in total.
    const education: Record<EducationLevel, number> = {
        none: 0,
        secondary: 2,
        oneYearPostSecondary: 6,
        twoYearPostSecondary: 7,
        bachelors: 8,
        twoOrMoreCredentials: 9,
        masters: 10,
        doctoral: 10,
    };
    for (const [level, points] of Object.entries(education) as [EducationLevel, number][]) {
        assert.equal(rs.spouseFactors.education[level], points, level);
    }
    assert.equal(Math.max(...Object.values(rs.spouseFactors.education)), 10);

    // Max 5 points per ability, 20 for the section.
    const language: Record<number, number> = { 4: 0, 5: 1, 6: 1, 7: 3, 8: 3, 9: 5, 10: 5 };
    for (const [clb, points] of Object.entries(language)) {
        const c = Number(clb) as 4 | 5 | 6 | 7 | 8 | 9 | 10;
        assert.equal(rs.spouseFactors.languagePerAbility[c] ?? 0, points, `CLB ${clb}`);
    }
    assert.equal(Math.max(...Object.values(rs.spouseFactors.languagePerAbility)) * 4, 20);

    const work: Record<number, number> = { 0: 0, 1: 5, 2: 7, 3: 8, 4: 9, 5: 10 };
    for (const [years, points] of Object.entries(work)) {
        assert.equal(rs.spouseFactors.canadianExperience[Number(years)], points, `${years}y`);
    }

    assert.equal(rs.spouseFactors.cap, 40);
});

test("C. skill transferability — all five combinations, each capped at 50, 100 total", () => {
    const tr = rs.transferability;

    // Education + language. Columns: CLB 7+ on all with one or more under 9,
    // then CLB 9+ on all four.
    assert.deepEqual(tr.educationWithLanguage.oneCredential, { clb7: 13, clb9: 25 });
    assert.deepEqual(tr.educationWithLanguage.twoOrMoreOrAdvanced, { clb7: 25, clb9: 50 });

    // Education + Canadian work experience. Columns: 1 year, then 2 years or more.
    assert.deepEqual(tr.educationWithCanadianWork.oneCredential, { years1: 13, years2plus: 25 });
    assert.deepEqual(tr.educationWithCanadianWork.twoOrMoreOrAdvanced, { years1: 25, years2plus: 50 });

    // Foreign work experience + language.
    assert.deepEqual(tr.foreignWithLanguage.years1to2, { clb7: 13, clb9: 25 });
    assert.deepEqual(tr.foreignWithLanguage.years3plus, { clb7: 25, clb9: 50 });

    // Foreign work experience + Canadian work experience.
    assert.deepEqual(tr.foreignWithCanadianWork.years1to2, { cdn1: 13, cdn2plus: 25 });
    assert.deepEqual(tr.foreignWithCanadianWork.years3plus, { cdn1: 25, cdn2plus: 50 });

    // Certificate of qualification (trade occupations) + language.
    // CLB 5+ on all with one or more under 7 -> 25; CLB 7+ on all four -> 50.
    assert.deepEqual(tr.tradeCertificate, { clb5: 25, clb7: 50 });

    assert.equal(tr.categoryCap, 50);
    assert.equal(tr.totalCap, 100);
});

test("D. additional points — maximum 600", () => {
    const a = rs.additional;
    assert.equal(a.siblingInCanada, 15);
    assert.equal(a.frenchStrong.withoutEnglish, 25); // NCLC 7+ French, CLB 4 or lower English / no test
    assert.equal(a.frenchStrong.withEnglish, 50);    // NCLC 7+ French, CLB 5+ on all four English
    assert.equal(a.canadianStudy.oneOrTwoYears, 15);
    assert.equal(a.canadianStudy.threeYearsPlus, 30);
    assert.equal(a.provincialNomination, 600);
});

test("D1. job offer / arranged employment scores nothing (removed 2025-03-25)", () => {
    // IRCC removed the 200-point (NOC Major Group 00) and 50-point (any other
    // skilled occupation) arranged-employment awards. Nothing in the ruleset
    // may reintroduce them.
    const keys = Object.keys(rs.additional).join(" ").toLowerCase();
    assert.ok(!keys.includes("job"), "no job-offer key in additional points");
    assert.ok(!keys.includes("employment"), "no arranged-employment key in additional points");
    assert.ok(!keys.includes("arranged"), "no arranged-employment key in additional points");
    assert.ok(!Object.values(rs.additional).includes(200 as never));
});

test("E. a maximal profile hits exactly 500 core points, with or without a spouse", () => {
    // IRCC: "With a spouse or common-law partner: maximum 460 points total"
    // plus 40 spouse-factor points; "Without: maximum 500 points total".
    const maxLanguage = { test: "CELPIP" as const, reading: 10, writing: 10, listening: 10, speaking: 10 };

    const single = scoreCore(
        {
            age: 25,
            education: "doctoral",
            firstLanguage: maxLanguage,
            secondLanguage: { test: "TEF", reading: 263, writing: 393, listening: 316, speaking: 393 },
            canadianWorkYears: 5,
        },
        rs,
    );
    const coreOf = (s: typeof single) =>
        s.factors
            .filter((f) => f.factor !== "Skill transferability" && f.factor !== "Additional points")
            .reduce((sum, f) => sum + f.points, 0);

    assert.equal(coreOf(single), 500);

    const withSpouse = scoreCore(
        {
            age: 25,
            education: "doctoral",
            firstLanguage: maxLanguage,
            secondLanguage: { test: "TEF", reading: 263, writing: 393, listening: 316, speaking: 393 },
            canadianWorkYears: 5,
            spouseAccompanying: true,
            spouseEducation: "doctoral",
            spouseLanguage: maxLanguage,
            spouseCanadianWorkYears: 5,
        },
        rs,
    );

    // 460 core + 40 spouse factors.
    assert.equal(coreOf(withSpouse), 500);
    assert.equal(withSpouse.factors.find((f) => f.factor === "Spouse factors")!.points, 40);
});

test("F. the grand total ceiling is 1200", () => {
    // 500 core + 100 transferability + 600 additional.
    const maxLanguage = { test: "CELPIP" as const, reading: 10, writing: 10, listening: 10, speaking: 10 };
    const score = scoreCore(
        {
            age: 25,
            education: "doctoral",
            firstLanguage: maxLanguage,
            secondLanguage: { test: "TEF", reading: 263, writing: 393, listening: 316, speaking: 393 },
            canadianWorkYears: 5,
            foreignWorkYears: 5,
            hasTradeCertificate: true,
            provincialNomination: true,
            siblingInCanada: true,
            canadianCredential: "threeYearsPlus",
        },
        rs,
    );

    assert.equal(score.factors.find((f) => f.factor === "Skill transferability")!.points, 100);
    // PNP 600 alone hits the additional-points ceiling; sibling, study and
    // French bonuses cannot push it past 600.
    assert.ok(
        score.factors.find((f) => f.factor === "Additional points")!.points <= 600,
        "additional points must not exceed 600",
    );
    assert.ok(score.total <= 1200, `total ${score.total} must not exceed 1200`);
});

import type { Ruleset, EducationLevel, Skill } from "@/lib/crs/ruleset/types";
import { toCLB, type RawLanguageResult } from "@/lib/crs/engine/clb";

export interface CrsProfile {
    age: number;
    education: EducationLevel;
    firstLanguage: RawLanguageResult;
    canadianWorkYears: number;
    foreignWorkYears?: number;
    hasTradeCertificate?: boolean;
    provincialNomination?: boolean;
    siblingInCanada?: boolean;
    canadianStudyYears?: number;
    frenchClb7Plus?: boolean;
}

export interface CrsFactor {
    factor: string;
    points: number;
    max: number;
}

export interface CrsScore {
    total: number;
    factors: CrsFactor[];
}

const ABILITIES: Skill[] = ["reading", "writing", "listening", "speaking"];

function scoreTransferability(profile: CrsProfile, ruleset: Ruleset): number {
    const tr = ruleset.transferability;
    const clb = toCLB(profile.firstLanguage, ruleset);
    const abilities = [clb.reading, clb.writing, clb.listening, clb.speaking];
    const lang9 = abilities.every((c) => c >= 9);
    const lang7 = abilities.every((c) => c >= 7);

    const postSecondary =
        profile.education !== "none" && profile.education !== "secondary";
    const cdn = profile.canadianWorkYears;
    const fwe = profile.foreignWorkYears ?? 0;

    // Education category — combines with language AND Canadian work, capped.
    let education = 0;
    if (postSecondary) {
        education += lang9
            ? tr.educationWithLanguage.clb9
            : lang7
                ? tr.educationWithLanguage.clb7
                : 0;
        education +=
            cdn >= 2
                ? tr.educationWithCanadianWork.years2plus
                : cdn >= 1
                    ? tr.educationWithCanadianWork.years1
                    : 0;
    }
    education = Math.min(education, tr.categoryCap);

    // Foreign work experience category — combines with language AND Canadian work.
    let foreign = 0;
    const fL =
        fwe >= 3 ? tr.foreignWithLanguage.years3plus
            : fwe >= 1 ? tr.foreignWithLanguage.years1to2
                : null;
    if (fL) foreign += lang9 ? fL.clb9 : lang7 ? fL.clb7 : 0;
    const fC =
        fwe >= 3 ? tr.foreignWithCanadianWork.years3plus
            : fwe >= 1 ? tr.foreignWithCanadianWork.years1to2
                : null;
    if (fC) foreign += cdn >= 2 ? fC.cdn2plus : cdn >= 1 ? fC.cdn1 : 0;
    foreign = Math.min(foreign, tr.categoryCap);

    // Trades certificate.
    let trade = 0;
    if (profile.hasTradeCertificate) {
        trade = lang7
            ? tr.tradeCertificate.clb7
            : clb.floor >= 5
                ? tr.tradeCertificate.clb5
                : 0;
    }

    return Math.min(education + foreign + trade, tr.totalCap);
}

function scoreAdditional(profile: CrsProfile, ruleset: Ruleset): number {
    const a = ruleset.additional;
    let points = 0;

    if (profile.provincialNomination) points += a.provincialNomination;
    if (profile.siblingInCanada) points += a.siblingInCanada;

    const study = profile.canadianStudyYears ?? 0;
    if (study >= 3) points += a.canadianStudy.threeYearsPlus;
    else if (study >= 1) points += a.canadianStudy.oneOrTwoYears;

    // French bonus: strong French (CLB7+ all abilities). English CLB5+ pays more.
    if (profile.frenchClb7Plus) {
        const clb = toCLB(profile.firstLanguage, ruleset);
        const englishClb5 = clb.floor >= 5;
        points += englishClb5
            ? a.frenchStrong.withEnglish
            : a.frenchStrong.withoutEnglish;
    }

    return points;
}

export function scoreCore(profile: CrsProfile, ruleset: Ruleset): CrsScore {
    const t = ruleset.crs;

    const agePoints = t.ageSingle[profile.age] ?? 0;
    const educationPoints = t.education[profile.education];

    const clb = toCLB(profile.firstLanguage, ruleset);
    const languagePoints = ABILITIES.reduce(
        (sum, ability) => sum + (t.firstLanguagePerAbility[clb[ability]] ?? 0),
        0,
    );

    const years = Math.min(Math.max(profile.canadianWorkYears, 0), 5);
    const experiencePoints = t.canadianExperienceSingle[years] ?? 0;

    const transferabilityPoints = scoreTransferability(profile, ruleset);

    const additionalPoints = scoreAdditional(profile, ruleset);

    const factors: CrsFactor[] = [
        { factor: "Age", points: agePoints, max: 110 },
        { factor: "Education", points: educationPoints, max: 150 },
        { factor: "First official language", points: languagePoints, max: 136 },
        { factor: "Canadian work experience", points: experiencePoints, max: 80 },
        { factor: "Skill transferability", points: transferabilityPoints, max: 100 },
        { factor: "Additional points", points: additionalPoints, max: 600 },
    ];


    return { total: factors.reduce((s, f) => s + f.points, 0), factors };
}
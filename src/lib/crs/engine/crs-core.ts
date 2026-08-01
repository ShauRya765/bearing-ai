import type { Ruleset, EducationLevel, Skill, LanguageTest } from "@/lib/crs/ruleset/types";
import { toCLB, type RawLanguageResult } from "@/lib/crs/engine/clb";

export interface CrsProfile {
    age: number;
    education: EducationLevel;
    firstLanguage: RawLanguageResult;
    secondLanguage?: RawLanguageResult;
    canadianWorkYears: number;
    foreignWorkYears?: number;
    hasTradeCertificate?: boolean;
    provincialNomination?: boolean;
    siblingInCanada?: boolean;
    // IRCC doesn't ask "how many years did you study in Canada" — it asks
    // whether you earned a Canadian degree/diploma/certificate at all, and
    // if so whether it was a 1-2 year credential or 3+ years / Master's /
    // professional / doctoral. Undefined/omitted = no Canadian credential.
    canadianCredential?: "oneOrTwoYears" | "threeYearsPlus";
    // Has a spouse or common-law partner who is also coming to Canada.
    // Switches the core tables (age/education/language/Canadian work) to
    // IRCC's reduced "with spouse" scale and enables the spouse's own
    // factors below.
    spouseAccompanying?: boolean;
    spouseEducation?: EducationLevel;
    spouseLanguage?: RawLanguageResult;
    spouseCanadianWorkYears?: number;
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

const FRENCH_TESTS: LanguageTest[] = ["TEF", "TCF"];
const ENGLISH_TESTS: LanguageTest[] = ["IELTS", "CELPIP", "PTE"];

function languageResults(profile: CrsProfile): RawLanguageResult[] {
    return [profile.firstLanguage, profile.secondLanguage].filter(
        (r): r is RawLanguageResult => Boolean(r),
    );
}

// Strong French = a TEF/TCF result with CLB floor >= 7 in EITHER language
// slot. Derived from the actual test results, not a self-reported flag.
export function hasStrongFrench(profile: CrsProfile, ruleset: Ruleset): boolean {
    return languageResults(profile).some(
        (r) => FRENCH_TESTS.includes(r.test) && toCLB(r, ruleset).floor >= 7,
    );
}

function hasClb5PlusEnglish(profile: CrsProfile, ruleset: Ruleset): boolean {
    return languageResults(profile).some(
        (r) => ENGLISH_TESTS.includes(r.test) && toCLB(r, ruleset).floor >= 5,
    );
}

// IRCC's education-transferability tables pay out more for "two or more
// post-secondary credentials, one of which was three years or longer, OR a
// Master's, professional, or doctoral degree" than for a single credential.
const ADVANCED_EDUCATION: EducationLevel[] = ["twoOrMoreCredentials", "masters", "doctoral"];

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
    // The payout tier depends on credential level, not just "postSecondary".
    let education = 0;
    if (postSecondary) {
        const advanced = ADVANCED_EDUCATION.includes(profile.education);
        const langTier = advanced ? tr.educationWithLanguage.twoOrMoreOrAdvanced : tr.educationWithLanguage.oneCredential;
        const workTier = advanced ? tr.educationWithCanadianWork.twoOrMoreOrAdvanced : tr.educationWithCanadianWork.oneCredential;
        education += lang9
            ? langTier.clb9
            : lang7
                ? langTier.clb7
                : 0;
        education +=
            cdn >= 2
                ? workTier.years2plus
                : cdn >= 1
                    ? workTier.years1
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

// The accompanying spouse/common-law partner's own education, language, and
// Canadian work experience — a separate capped group, entirely distinct
// from skill transferability (which always keys off the principal
// applicant, never the spouse).
function scoreSpouseFactors(profile: CrsProfile, ruleset: Ruleset): number {
    if (!profile.spouseAccompanying) return 0;
    const sf = ruleset.spouseFactors;

    const educationPoints = profile.spouseEducation ? sf.education[profile.spouseEducation] : 0;

    let languagePoints = 0;
    if (profile.spouseLanguage) {
        const clb = toCLB(profile.spouseLanguage, ruleset);
        languagePoints = ABILITIES.reduce(
            (sum, ability) => sum + (sf.languagePerAbility[clb[ability]] ?? 0),
            0,
        );
    }

    const years = Math.min(Math.max(profile.spouseCanadianWorkYears ?? 0, 0), 5);
    const experiencePoints = sf.canadianExperience[years] ?? 0;

    return Math.min(educationPoints + languagePoints + experiencePoints, sf.cap);
}

function scoreAdditional(profile: CrsProfile, ruleset: Ruleset): number {
    const a = ruleset.additional;
    let points = 0;

    if (profile.provincialNomination) points += a.provincialNomination;
    if (profile.siblingInCanada) points += a.siblingInCanada;

    if (profile.canadianCredential) points += a.canadianStudy[profile.canadianCredential];

    // French bonus: strong French (CLB7+ floor on a TEF/TCF result). English
    // CLB5+ on the other slot pays more.
    if (hasStrongFrench(profile, ruleset)) {
        points += hasClb5PlusEnglish(profile, ruleset)
            ? a.frenchStrong.withEnglish
            : a.frenchStrong.withoutEnglish;
    }

    return Math.min(points, a.cap);
}

export function scoreCore(profile: CrsProfile, ruleset: Ruleset): CrsScore {
    const t = ruleset.crs;
    const withSpouse = Boolean(profile.spouseAccompanying);

    // An accompanying spouse/common-law partner shrinks these four core
    // tables and opens up the separate "Spouse factors" pool below — the
    // 500-point core human capital ceiling is the same either way.
    const ageTable = withSpouse ? t.ageWithSpouse : t.ageSingle;
    const educationTable = withSpouse ? t.educationWithSpouse : t.education;
    const languageTable = withSpouse ? t.firstLanguagePerAbilityWithSpouse : t.firstLanguagePerAbility;
    const experienceTable = withSpouse ? t.canadianExperienceWithSpouse : t.canadianExperienceSingle;
    const secondLanguageCap = withSpouse ? t.secondLanguageCapWithSpouse : t.secondLanguageCap;
    const ageMax = withSpouse ? 100 : 110;
    const educationMax = withSpouse ? 140 : 150;
    const languageMax = withSpouse ? 128 : 136;
    const experienceMax = withSpouse ? 70 : 80;

    const agePoints = ageTable[profile.age] ?? 0;
    const educationPoints = educationTable[profile.education];

    const clb = toCLB(profile.firstLanguage, ruleset);
    const languagePoints = ABILITIES.reduce(
        (sum, ability) => sum + (languageTable[clb[ability]] ?? 0),
        0,
    );

    let secondLanguagePoints = 0;
    if (profile.secondLanguage) {
        const clb2 = toCLB(profile.secondLanguage, ruleset);
        const rawSecondLanguagePoints = ABILITIES.reduce(
            (sum, ability) => sum + (t.secondLanguagePerAbility[clb2[ability]] ?? 0),
            0,
        );
        secondLanguagePoints = Math.min(rawSecondLanguagePoints, secondLanguageCap);
    }

    const years = Math.min(Math.max(profile.canadianWorkYears, 0), 5);
    const experiencePoints = experienceTable[years] ?? 0;

    const transferabilityPoints = scoreTransferability(profile, ruleset);

    const additionalPoints = scoreAdditional(profile, ruleset);

    const spouseFactorPoints = scoreSpouseFactors(profile, ruleset);

    const factors: CrsFactor[] = [
        { factor: "Age", points: agePoints, max: ageMax },
        { factor: "Education", points: educationPoints, max: educationMax },
        { factor: "First official language", points: languagePoints, max: languageMax },
        { factor: "Second official language", points: secondLanguagePoints, max: secondLanguageCap },
        { factor: "Canadian work experience", points: experiencePoints, max: experienceMax },
        { factor: "Spouse factors", points: spouseFactorPoints, max: ruleset.spouseFactors.cap },
        { factor: "Skill transferability", points: transferabilityPoints, max: 100 },
        { factor: "Additional points", points: additionalPoints, max: ruleset.additional.cap },
    ];


    return { total: factors.reduce((s, f) => s + f.points, 0), factors };
}
export type LanguageTest = "IELTS" | "CELPIP" | "PTE" | "TEF" | "TCF";
export type Skill = "reading" | "writing" | "listening" | "speaking";

/** Canadian Language Benchmark. CRS uses 4–10; below 4 collapses to 0. */
export type CLB = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Minimum raw score per skill needed to reach `clb`. Per-skill, no averaging. */
export interface LanguageThreshold {
    clb: Exclude<CLB, 0>;
    reading: number;
    writing: number;
    listening: number;
    speaking: number;
}

export interface Ruleset {
    version: string;
    source: string;
    verified: boolean;
    language: Partial<Record<LanguageTest, LanguageThreshold[]>>;
    crs: CrsCoreTables;
    spouseFactors: SpouseFactorsTable;
    transferability: TransferabilityTable;
    additional: AdditionalPointsTable;
    recentDraws: DrawRecord[];
}


export type EducationLevel =
    | "none"
    | "secondary"
    | "oneYearPostSecondary"
    | "twoYearPostSecondary"
    | "bachelors"
    | "twoOrMoreCredentials"
    | "masters"
    | "doctoral";

export interface CrsCoreTables {
    ageSingle: Record<number, number>;
    ageWithSpouse: Record<number, number>;
    education: Record<EducationLevel, number>;
    educationWithSpouse: Record<EducationLevel, number>;
    firstLanguagePerAbility: Partial<Record<CLB, number>>;
    firstLanguagePerAbilityWithSpouse: Partial<Record<CLB, number>>;
    secondLanguagePerAbility: Partial<Record<CLB, number>>;
    secondLanguageCap: number;
    canadianExperienceSingle: Record<number, number>;
    canadianExperienceWithSpouse: Record<number, number>;
}

/** Points for an accompanying spouse or common-law partner's own profile. Capped as a group. */
export interface SpouseFactorsTable {
    education: Record<EducationLevel, number>;
    languagePerAbility: Partial<Record<CLB, number>>;
    canadianExperience: Record<number, number>;
    cap: number;
}

// IRCC's education-transferability tables have two tiers: a single
// post-secondary credential vs. two-or-more credentials (one 3+ years) or a
// Master's/professional/doctoral degree. The tier changes the payout, not
// just the cap.
export interface EducationTransferTier {
    oneCredential: { clb9: number; clb7: number };
    twoOrMoreOrAdvanced: { clb9: number; clb7: number };
}

export interface EducationWorkTransferTier {
    oneCredential: { years2plus: number; years1: number };
    twoOrMoreOrAdvanced: { years2plus: number; years1: number };
}

export interface TransferabilityTable {
    educationWithLanguage: EducationTransferTier;
    educationWithCanadianWork: EducationWorkTransferTier;
    foreignWithLanguage: {
        years3plus: { clb9: number; clb7: number };
        years1to2: { clb9: number; clb7: number };
    };
    foreignWithCanadianWork: {
        years3plus: { cdn2plus: number; cdn1: number };
        years1to2: { cdn2plus: number; cdn1: number };
    };
    tradeCertificate: { clb7: number; clb5: number };
    categoryCap: number;
    totalCap: number;
}

export interface AdditionalPointsTable {
  provincialNomination: number;
  siblingInCanada: number;
  canadianStudy: { oneOrTwoYears: number; threeYearsPlus: number };
  frenchStrong: { withEnglish: number; withoutEnglish: number };
}

export type DrawCategory =
  | "general"
  | "cec"
  | "pnp"
  | "healthcare"
  | "stem"
  | "trades"
  | "transport"
  | "agriculture"
  | "education"
  | "french";

export interface DrawRecord {
  category: DrawCategory;
  date: string;      // ISO
  cutoff: number;
  invitations: number;
}
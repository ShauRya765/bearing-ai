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
    education: Record<EducationLevel, number>;
    firstLanguagePerAbility: Partial<Record<CLB, number>>;
    canadianExperienceSingle: Record<number, number>;
}

export interface TransferabilityTable {
    educationWithLanguage: { clb9: number; clb7: number };
    educationWithCanadianWork: { years2plus: number; years1: number };
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
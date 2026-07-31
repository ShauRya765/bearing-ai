import type { DrawCategory } from "@/lib/crs/ruleset/types";
import { OCCUPATIONS, type Occupation } from "@/lib/crs/ruleset/noc-catalogue";

// Eligibility rules for IRCC's category-based draws.
//
// Source: "Who's eligible for each category" —
// https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/submit-profile/rounds-invitations/category-based-selection.html
// Transcribed 2026-07-27. Each round's own ministerial instructions govern;
// re-check when those change.
//
// The rule is uniform across every occupation category: at least 12 months of
// full-time work (or the part-time equivalent) in a SINGLE listed occupation
// within the past 3 years, not necessarily continuous. The only thing that
// varies is WHERE that experience counts — three categories accept Canadian
// experience only.
//
// A NOC code alone is never eligibility. Holding a certificate of qualification
// is a third, unrelated thing: it earns CRS transferability points and has no
// bearing on which draws can invite you.

export interface CategoryRule {
  category: DrawCategory;
  label: string;
  /** Months of experience in the occupation, within the past 3 years. */
  months: number;
  /** Whether that experience must have been earned in Canada. */
  mustBeInCanada: boolean;
}

export const CATEGORY_RULES: CategoryRule[] = [
  { category: "healthcare", label: "Healthcare and social services", months: 12, mustBeInCanada: false },
  { category: "stem", label: "STEM occupations", months: 12, mustBeInCanada: false },
  { category: "trades", label: "Trade occupations", months: 12, mustBeInCanada: false },
  { category: "education", label: "Education occupations", months: 12, mustBeInCanada: false },
  { category: "transport", label: "Transport occupations", months: 12, mustBeInCanada: false },
  { category: "physicians", label: "Physicians with Canadian work experience", months: 12, mustBeInCanada: true },
  { category: "seniorManagers", label: "Senior managers with Canadian work experience", months: 12, mustBeInCanada: true },
  { category: "researchers", label: "Researchers with Canadian work experience", months: 12, mustBeInCanada: true },
];

// Skilled military recruits is deliberately absent. Its gate is Foreign Skilled
// Military Applicant status — ten years of continuous service in a recognized
// foreign military — not a NOC plus work experience. Deriving it from an
// occupation selection would be wrong, so we never do.

export function findOccupation(noc: string | undefined): Occupation | undefined {
  if (!noc) return undefined;
  return OCCUPATIONS.find((o) => o.noc === noc);
}

/**
 * Case-insensitive match on NOC code or job title, for the search field.
 * Prefix matches rank above substring matches, so typing "721" or "plumb"
 * surfaces the obvious answer first.
 */
export function searchOccupations(query: string, limit = 60): Occupation[] {
  const q = query.trim().toLowerCase();
  if (!q) return OCCUPATIONS.slice(0, limit);

  const starts: Occupation[] = [];
  const contains: Occupation[] = [];
  for (const o of OCCUPATIONS) {
    const title = o.title.toLowerCase();
    if (o.noc.startsWith(q) || title.startsWith(q)) starts.push(o);
    else if (o.noc.includes(q) || title.includes(q)) contains.push(o);
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Categories this candidate could actually be invited from, given their
 * occupation and how they answered the experience questions. Returns [] unless
 * the 12-month condition is met, and drops the Canada-only categories when the
 * experience was earned abroad. Military recruits is never derived here.
 */
export function eligibleCategories(
  noc: string | undefined,
  hasTwelveMonths: boolean,
  experienceInCanada: boolean,
): DrawCategory[] {
  if (!hasTwelveMonths) return [];
  const occupation = findOccupation(noc);
  if (!occupation) return [];

  return occupation.categories.filter((category) => {
    const rule = CATEGORY_RULES.find((r) => r.category === category);
    if (!rule) return false; // militaryRecruits and anything unmodelled
    return rule.mustBeInCanada ? experienceInCanada : true;
  });
}

export { OCCUPATIONS };
export type { Occupation };

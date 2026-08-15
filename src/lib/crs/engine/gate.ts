import type { Ruleset, DrawCategory, DrawRecord } from "@/lib/crs/ruleset/types";
import { hasStrongFrench, type CrsProfile } from "@/lib/crs/engine/crs-core";

// A NOC's TEER + category tags. In production this comes from the NOC
// dataset; here the caller supplies the candidate's category memberships
// directly, which is what the eligibility gate actually needs.
export interface CategoryEligibility {
  category: DrawCategory;
  eligible: boolean;
  reason: string;
}

// A category that hasn't drawn in this long is evidence about a past round, not
// a target a candidate can aim at. Six months clears every category IRCC is
// actually running on a cadence (trades, the slowest live one, went 2026-04-02
// → still the latest at ~4 months) while catching education (last drew
// 2025-09-17) and the general/STEM/agriculture rounds that stopped in 2024.
export const STALE_AFTER_DAYS = 180;

const MS_PER_DAY = 86_400_000;

export interface Benchmark {
  category: DrawCategory;
  cutoff: number;
  drawDate: string;
  candidateScore: number;
  standing: "above" | "below";
  gap: number; // signed: positive = candidate is above the cutoff
  daysSinceDraw: number;
  /** True when the category hasn't drawn in STALE_AFTER_DAYS. The cutoff is
   *  still real, but it is a historical fact, not a live bar to clear. */
  stale: boolean;
}

export interface GateResult {
  benchmarks: Benchmark[];        // ONLY categories the candidate can stand in
  excluded: CategoryEligibility[]; // categories deliberately NOT benchmarked
  honestSummary: string;
}

// Which categories a candidate qualifies for. CEC needs Canadian skilled
// work; French needs strong French; occupation categories need the caller
// to have flagged the NOC. Everyone eligible for Express Entry can stand in
// a general draw — but there haven't been any since 2024.
function determineEligibility(
  profile: CrsProfile,
  ruleset: Ruleset,
  occupationCategories: DrawCategory[],
): CategoryEligibility[] {
  const out: CategoryEligibility[] = [];

  out.push({
    category: "cec",
    eligible: profile.canadianWorkYears >= 1,
    reason:
      profile.canadianWorkYears >= 1
        ? "Has 1+ year Canadian skilled work."
        : "CEC requires 1+ year Canadian skilled work.",
  });

  out.push({
    category: "pnp",
    eligible: Boolean(profile.provincialNomination),
    reason: profile.provincialNomination
      ? "Holds a provincial nomination."
      : "No provincial nomination.",
  });

  const strongFrench = hasStrongFrench(profile, ruleset);
  out.push({
    category: "french",
    eligible: strongFrench,
    reason: strongFrench
      ? "Strong French (CLB 7+ on a TEF/TCF result)."
      : "No qualifying French.",
  });

  const occupational: DrawCategory[] = [
    "healthcare", "stem", "trades", "transport", "agriculture", "education",
    "militaryRecruits",
  ];
  for (const cat of occupational) {
    const eligible = occupationCategories.includes(cat);
    out.push({
      category: cat,
      eligible,
      reason: eligible
        ? `NOC qualifies for the ${cat} category.`
        : `NOC is not in the ${cat} category.`,
    });
  }

  // IRCC's 2026 physician and senior-manager categories are occupation-gated
  // AND require Canadian work experience, so both conditions must hold. Two
  // gates rather than one is deliberate: an occupation flag alone would let a
  // physician with no Canadian experience be benchmarked against a draw they
  // cannot be invited from, which is exactly the failure this module exists
  // to prevent.
  const withCanadianExperience: DrawCategory[] = ["physicians", "seniorManagers"];
  for (const cat of withCanadianExperience) {
    const rightOccupation = occupationCategories.includes(cat);
    const hasCanadianWork = profile.canadianWorkYears >= 1;
    out.push({
      category: cat,
      eligible: rightOccupation && hasCanadianWork,
      reason: !rightOccupation
        ? `NOC is not in the ${cat} category.`
        : hasCanadianWork
          ? `NOC qualifies for the ${cat} category, with 1+ year Canadian work.`
          : `NOC qualifies for the ${cat} category, but it also requires 1+ year Canadian work.`,
    });
  }

  return out;
}

export function runGate(
  profile: CrsProfile,
  score: number,
  ruleset: Ruleset,
  occupationCategories: DrawCategory[] = [],
  // Injectable so staleness is testable and doesn't depend on the wall clock.
  now: Date = new Date(),
): GateResult {
  const eligibility = determineEligibility(profile, ruleset, occupationCategories);
  const eligibleCats = new Set(
    eligibility.filter((e) => e.eligible).map((e) => e.category),
  );

  const latestByCategory = new Map<DrawCategory, DrawRecord>();
  for (const draw of ruleset.recentDraws) {
    const existing = latestByCategory.get(draw.category);
    if (!existing || draw.date > existing.date) {
      latestByCategory.set(draw.category, draw);
    }
  }

  // THE GATE: benchmark ONLY against categories the candidate is eligible for.
  const benchmarks: Benchmark[] = [];
  for (const [category, draw] of latestByCategory) {
    if (!eligibleCats.has(category)) continue;
    const gap = score - draw.cutoff;
    const daysSinceDraw = Math.floor(
      (now.getTime() - Date.parse(`${draw.date}T00:00:00Z`)) / MS_PER_DAY,
    );
    benchmarks.push({
      category,
      cutoff: draw.cutoff,
      drawDate: draw.date,
      candidateScore: score,
      standing: gap >= 0 ? "above" : "below",
      gap,
      daysSinceDraw,
      stale: daysSinceDraw > STALE_AFTER_DAYS,
    });
  }
  // Live categories first, then by gap. A stale category must never outrank a
  // live one just because its cutoff was easier — that would point a candidate
  // at a draw that isn't running.
  benchmarks.sort((a, b) => Number(a.stale) - Number(b.stale) || b.gap - a.gap);

  const excluded = eligibility.filter((e) => !e.eligible);

  let honestSummary: string;
  if (benchmarks.length === 0) {
    honestSummary =
      "This candidate isn't eligible for any recent draw category. Their CRS " +
      "can't be meaningfully compared to any current cutoff — the realistic " +
      "levers are a provincial nomination or raising CRS, not any single draw.";
  } else if (benchmarks.every((b) => b.stale)) {
    // Eligible on paper for categories that have all gone quiet. Saying
    // "above the education cutoff" here would be true and useless.
    const best = benchmarks[0];
    honestSummary =
      `Every category this candidate is eligible for has gone quiet — the most ` +
      `recent is ${best.category}, which last drew on ${best.drawDate} ` +
      `(${best.daysSinceDraw} days ago). Those cutoffs are history, not a bar ` +
      `to clear; the realistic levers are a provincial nomination or raising CRS.`;
  } else {
    const best = benchmarks[0]; // sorted live-first, so this is a live category
    honestSummary =
      best.standing === "above"
        ? `Above the ${best.category} cutoff (${best.cutoff}) by ${best.gap}.`
        : `Below every eligible cutoff. Closest is ${best.category} by ${-best.gap}.`;
  }

  return { benchmarks, excluded, honestSummary };
}
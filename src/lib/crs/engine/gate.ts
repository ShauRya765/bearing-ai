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

export interface Benchmark {
  category: DrawCategory;
  cutoff: number;
  drawDate: string;
  candidateScore: number;
  standing: "above" | "below";
  gap: number; // signed: positive = candidate is above the cutoff
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

  return out;
}

export function runGate(
  profile: CrsProfile,
  score: number,
  ruleset: Ruleset,
  occupationCategories: DrawCategory[] = [],
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
    benchmarks.push({
      category,
      cutoff: draw.cutoff,
      drawDate: draw.date,
      candidateScore: score,
      standing: gap >= 0 ? "above" : "below",
      gap,
    });
  }
  benchmarks.sort((a, b) => b.gap - a.gap);

  const excluded = eligibility.filter((e) => !e.eligible);

  let honestSummary: string;
  if (benchmarks.length === 0) {
    honestSummary =
      "This candidate isn't eligible for any recent draw category. Their CRS " +
      "can't be meaningfully compared to any current cutoff — the realistic " +
      "levers are a provincial nomination or raising CRS, not any single draw.";
  } else {
    const best = benchmarks[0];
    honestSummary =
      best.standing === "above"
        ? `Above the ${best.category} cutoff (${best.cutoff}) by ${best.gap}.`
        : `Below every eligible cutoff. Closest is ${best.category} by ${-best.gap}.`;
  }

  return { benchmarks, excluded, honestSummary };
}
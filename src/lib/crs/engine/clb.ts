import type { Ruleset, LanguageTest, Skill, CLB } from "@/lib/crs/ruleset/types";

// Raw language scores in -> CLB per skill out. Three IRCC rules:
// 1. Per skill, never averaged. 2. No interpolation (a band between
// thresholds takes the lower CLB). 3. The floor (min across skills)
// governs program eligibility.

export interface RawLanguageResult {
  test: LanguageTest;
  reading: number;
  writing: number;
  listening: number;
  speaking: number;
}

export interface CLBProfile {
  reading: CLB;
  writing: CLB;
  listening: CLB;
  speaking: CLB;
  floor: CLB;
}

export function toCLB(result: RawLanguageResult, ruleset: Ruleset): CLBProfile {
  const table = ruleset.language[result.test];
  if (!table) {
    throw new Error(
      `Ruleset ${ruleset.version} has no conversion table for test "${result.test}".`,
    );
  }

  const levelsHighToLow = [...table].sort((a, b) => b.clb - a.clb);

  const convert = (skill: Skill): CLB => {
    const raw = result[skill];
    for (const row of levelsHighToLow) {
      if (raw >= row[skill]) return row.clb;
    }
    return 0;
  };

  const reading = convert("reading");
  const writing = convert("writing");
  const listening = convert("listening");
  const speaking = convert("speaking");
  const floor = Math.min(reading, writing, listening, speaking) as CLB;

  return { reading, writing, listening, speaking, floor };
}
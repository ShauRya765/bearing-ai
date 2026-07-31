import type { Ruleset, DrawRecord } from "@/lib/crs/ruleset/types";
import { ruleset_2026_06 } from "@/lib/crs/ruleset/ruleset-2026-06";

// Ruleset 2026-07.
//
// IRCC did not change any CRS point value this cycle — the age, education,
// language, work and transferability tables are byte-for-byte what 2026-06
// holds, so this version derives from it rather than copying 185 lines that
// would then have to be corrected twice. What changed is the draw record:
// three new categories appeared during 2026 (physicians, senior managers,
// skilled military recruits), and the previous file's `recentDraws` had
// drifted from what IRCC actually published.
//
// Source: IRCC's own rounds-of-invitations feed, the one the canada.ca page
// renders client-side —
// https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json
// Pulled 2026-07-26; newest round in the feed was #430 (2026-07-23).
//
// Corrections this version makes to 2026-06's draw list, all verified against
// that feed:
//   cec        was 2026-06-23 / 518 / 3,000  → round #420 was 516 / 4,000, and
//                                              #428 (2026-07-21) superseded it
//   french     was 2026-06-10 / 393 / 2,500  → no French round on that date at
//                                              all; latest is #429 (2026-07-22)
//   pnp        was 2026-06-18 / 752 / 1,000  → no PNP round on that date;
//                                              latest is #427 (2026-07-20)
//   trades     was 2026-04-02 / 477 / 1,500  → date and cutoff right, size was
//                                              3,000
//   education  was 2026-05-15 / 462 / 2,500  → cutoff and size right, but the
//                                              date was wrong by eight months
//   healthcare was 2026-06-25 / 475 / 4,000  → correct, unchanged
//
// Note for the gate: `education` last drew on 2025-09-17, over ten months ago.
// It stays in the list because it is the most recent education round on record,
// but benchmarking a candidate against a category that has gone quiet for most
// of a year is weak evidence, and the UI should not present it as live.

const recentDraws: DrawRecord[] = [
  // Most recent round per category, newest first.
  { category: "militaryRecruits", date: "2026-07-23", cutoff: 368, invitations: 4 },
  { category: "french", date: "2026-07-22", cutoff: 399, invitations: 5000 },
  { category: "cec", date: "2026-07-21", cutoff: 516, invitations: 2000 },
  { category: "pnp", date: "2026-07-20", cutoff: 744, invitations: 511 },
  { category: "seniorManagers", date: "2026-07-10", cutoff: 392, invitations: 500 },
  { category: "healthcare", date: "2026-06-25", cutoff: 475, invitations: 4000 },
  { category: "physicians", date: "2026-06-24", cutoff: 223, invitations: 271 },
  { category: "trades", date: "2026-04-02", cutoff: 477, invitations: 3000 },
  { category: "education", date: "2025-09-17", cutoff: 462, invitations: 2500 },

  // Deliberately recorded even though they are long dead, because the gate's
  // job is to say "no current draw fits you" rather than silently omit a
  // category. General draws stopped in April 2024; STEM, transport and
  // agriculture have not run since then either.
  { category: "general", date: "2024-04-23", cutoff: 529, invitations: 2095 },
  { category: "stem", date: "2024-04-11", cutoff: 491, invitations: 4500 },
  { category: "transport", date: "2024-03-13", cutoff: 430, invitations: 975 },
  { category: "agriculture", date: "2024-02-16", cutoff: 437, invitations: 150 },
];

export const ruleset_2026_07: Ruleset = {
  ...ruleset_2026_06,
  version: "2026-07",
  // The point tables are still the ones transcribed in 2026-06 and still need a
  // cell-by-cell human pass. Draw data being current does not verify them.
  verified: false,
  recentDraws,
};

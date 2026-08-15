import type { Ruleset, DrawRecord } from "@/lib/crs/ruleset/types";
import { ruleset_2026_07 } from "@/lib/crs/ruleset/ruleset-2026-07";

// Ruleset 2026-08.
//
// Same story as 2026-07: IRCC changed no CRS point value, so this derives from
// the previous version and only replaces `recentDraws`.
//
// Source: IRCC's rounds-of-invitations feed, the one the canada.ca page renders
// client-side —
// https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json
// Pulled 2026-08-14; newest round in the feed was #434 (2026-08-07).
//
// Four rounds landed since 2026-07's pull (#430):
//   #431  2026-08-04  Provincial Nominee Program        768 / 507
//   #432  2026-08-05  Canadian Experience Class         516 / 3,000
//   #433  2026-08-06  French-Language proficiency       391 / 5,000
//   #434  2026-08-07  Transport Occupations, Version 2  470 / 300
//
// The notable one is transport: 2026-07 filed it with the dead categories on
// the strength of round #289 (2024-03-13). It is live again under a 2026
// instruction, so it moves up into the current block. CEC's cutoff held at 516
// while the draw grew from 2,000 to 3,000; French dropped 399 → 391.
//
// Still-quiet categories carry forward unchanged. Note for the gate:
// `education` last drew 2025-09-17, now eleven months ago — it stays listed so
// the gate can say "no current draw fits you", but the UI should not present it
// as live.

const recentDraws: DrawRecord[] = [
  // Most recent round per category, newest first.
  { category: "transport", date: "2026-08-07", cutoff: 470, invitations: 300 },
  { category: "french", date: "2026-08-06", cutoff: 391, invitations: 5000 },
  { category: "cec", date: "2026-08-05", cutoff: 516, invitations: 3000 },
  { category: "pnp", date: "2026-08-04", cutoff: 768, invitations: 507 },
  { category: "militaryRecruits", date: "2026-07-23", cutoff: 368, invitations: 4 },
  { category: "seniorManagers", date: "2026-07-10", cutoff: 392, invitations: 500 },
  { category: "healthcare", date: "2026-06-25", cutoff: 475, invitations: 4000 },
  { category: "physicians", date: "2026-06-24", cutoff: 223, invitations: 271 },
  { category: "trades", date: "2026-04-02", cutoff: 477, invitations: 3000 },
  { category: "education", date: "2025-09-17", cutoff: 462, invitations: 2500 },

  // Deliberately recorded even though they are long dead, because the gate's
  // job is to say "no current draw fits you" rather than silently omit a
  // category. General draws stopped in April 2024; STEM and agriculture have
  // not run since then either.
  { category: "general", date: "2024-04-23", cutoff: 529, invitations: 2095 },
  { category: "stem", date: "2024-04-11", cutoff: 491, invitations: 4500 },
  { category: "agriculture", date: "2024-02-16", cutoff: 437, invitations: 150 },
];

export const ruleset_2026_08: Ruleset = {
  ...ruleset_2026_07,
  version: "2026-08",
  // The point tables are still the ones transcribed in 2026-06 and still need a
  // cell-by-cell human pass. Draw data being current does not verify them.
  verified: false,
  recentDraws,
};

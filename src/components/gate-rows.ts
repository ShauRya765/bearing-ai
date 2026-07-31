import type { DrawCategory } from "@/lib/crs/ruleset/types";

// Shared by the server component that resolves cutoffs and the client component
// that animates them. It lives outside GateAnimation.tsx because that file is
// "use client" — a server component importing a value from a client module gets
// a client-reference proxy, not the data, so ROWS.map() there fails at build.

// One worked example: a candidate with a year of skilled Canadian work, no
// nomination, no French test, and a job outside every occupation category.
// Their eligibility is fixed narrative, not computed — this is an illustration
// on a marketing page, and runGate() remains the only thing that decides a real
// candidate's standing.
export interface GateRow {
  category: DrawCategory;
  label: string;
  requirement: string;
  eligible: boolean;
}

export const GATE_ROWS: GateRow[] = [
  { category: "french", label: "French proficiency", requirement: "Needs strong French", eligible: false },
  { category: "education", label: "Education jobs", requirement: "Needs a teaching job", eligible: false },
  { category: "healthcare", label: "Healthcare", requirement: "Needs a healthcare job", eligible: false },
  { category: "trades", label: "Skilled trades", requirement: "Needs a skilled trade", eligible: false },
  { category: "cec", label: "Canadian Experience Class", requirement: "1+ year of skilled work in Canada", eligible: true },
  { category: "pnp", label: "Provincial nomination", requirement: "Needs a province to nominate you", eligible: false },
];

export const GATE_CATEGORIES: DrawCategory[] = GATE_ROWS.map((r) => r.category);

// The example candidate's score. Exported so the payoff copy and the row gaps
// can't drift apart.
export const GATE_SCORE = 480;

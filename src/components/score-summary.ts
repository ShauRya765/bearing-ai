import type { GateResult, Benchmark } from "@/lib/crs/engine/gate";

export const CRS_MAX = 1200;

export type StatusTone = "clear" | "primary" | "refuse";

export interface DrawStatus {
    tone: StatusTone;
    /** One-line label for the sticky bar. */
    label: string;
    /** Fuller heading for the detail banner. */
    heading: string;
    /** Explanatory sentence for the detail banner. */
    body: string;
}

export function titleCase(category: string): string {
    // Short program codes read better upper-cased; occupation categories are words.
    if (category.length <= 4) return category.toUpperCase();
    return category.charAt(0).toUpperCase() + category.slice(1);
}

// The candidate's best shot: the lowest cutoff among LIVE eligible draws. Null
// when none is eligible — showing a cutoff comparison then would be the exact
// bogus benchmark the GATE exists to prevent. Stale categories are excluded for
// the same reason: education's 462 is the lowest cutoff in the ruleset and it
// would otherwise win this every time, aiming candidates at a draw that hasn't
// run since 2025-09-17.
export function liveBenchmarks(gate: GateResult): Benchmark[] {
    return gate.benchmarks.filter((b) => !b.stale);
}

export function featuredBenchmark(gate: GateResult): Benchmark | null {
    const live = liveBenchmarks(gate);
    if (live.length === 0) return null;
    return live.reduce((a, b) => (b.cutoff < a.cutoff ? b : a));
}

// Single source of truth for the GATE headline, shared by the sticky bar and
// the detail banner so they can never disagree.
export function deriveDrawStatus(gate: GateResult): DrawStatus {
    // Only live draws set the headline. Being "above" a category that stopped
    // drawing a year ago is not competitiveness, and counting it here would put
    // an encouraging number on a door that is shut.
    const eligible = liveBenchmarks(gate);
    const clears = eligible.filter((b) => b.standing === "above");

    if (eligible.length === 0) {
        const staleOnly = gate.benchmarks.length > 0;
        return {
            tone: "refuse",
            label: staleOnly ? "No live draw" : "Not benchmarked",
            heading: staleOnly
                ? "Eligible only for categories that have gone quiet"
                : "Not benchmarked against any draw",
            body: gate.honestSummary,
        };
    }

    if (clears.length > 0) {
        const names = clears.map((b) => titleCase(b.category)).join(", ");
        return {
            tone: "clear",
            label: "Competitive",
            heading:
                clears.length === 1
                    ? "You'd be competitive in 1 eligible draw"
                    : `You'd be competitive in ${clears.length} eligible draws`,
            body: `Above the cutoff for ${names}. A nomination or invitation isn't guaranteed, but you're standing in draws you actually qualify for.`,
        };
    }

    // Closest target = the smallest shortfall (gap is negative when below).
    const nearest = eligible.reduce((a, b) => (b.gap > a.gap ? b : a));
    const short = -nearest.gap;
    return {
        tone: "primary",
        label: `${short} short`,
        heading: "Eligible — not competitive yet",
        body: `${short} point${short === 1 ? "" : "s"} short of the ${titleCase(nearest.category)} cutoff (${nearest.cutoff}).`,
    };
}

export const TONE_DOT: Record<StatusTone, string> = {
    clear: "bg-clear",
    primary: "bg-primary",
    refuse: "bg-muted-foreground",
};

export const TONE_METER_FILL: Record<StatusTone, string> = {
    clear: "bg-clear",
    primary: "bg-primary",
    refuse: "bg-muted-foreground",
};

import type { CrsScore } from "@/lib/crs/engine/crs-core";
import type { GateResult } from "@/lib/crs/engine/gate";
import {
    CRS_MAX,
    deriveDrawStatus,
    featuredBenchmark,
    titleCase,
    TONE_DOT,
} from "@/components/score-summary";

// Slim, always-visible summary pinned to the top of the assessment view: the
// live total, the one-line GATE status, and a mini meter toward the nearest
// eligible cutoff. The full breakdown and honest narrative live below the form.
export function ScoreBar({ score, gate }: { score: CrsScore; gate: GateResult }) {
    const status = deriveDrawStatus(gate);
    const featured = featuredBenchmark(gate);
    const pct =
        featured ? Math.min(score.total / featured.cutoff, 1) * 100 : 0;

    return (
        <div className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-sm">
            <div className="flex items-center gap-x-4 gap-y-2 px-4 py-3 flex-wrap sm:gap-x-6 sm:px-8">
                {/* Score */}
                <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-2xl font-bold leading-none text-foreground">
                        {score.total}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">/ {CRS_MAX}</span>
                </div>

                {/* GATE status */}
                <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${TONE_DOT[status.tone]}`} aria-hidden />
                    <span className="text-sm font-medium text-foreground">{status.label}</span>
                </div>

                {/* Cutoff meter — only when a draw is actually eligible */}
                {featured && (
                    <div className="flex items-center gap-3 min-w-0 flex-1 max-w-xs">
                        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-[width] duration-300 ${
                                    featured.standing === "above" ? "bg-clear" : "bg-primary"
                                }`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                            vs. {titleCase(featured.category)} {featured.cutoff}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

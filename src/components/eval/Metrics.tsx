// Metric primitives for the /eval dashboard. Server components — everything on
// this page is static data read at build time, so none of it needs to ship JS.

import type { MetricDelta } from "@/lib/eval/diff";
import { NONE, deltaPp, pct, trend, type Trend } from "@/lib/eval/format";

const TREND_CLASS: Record<Trend, string> = {
    better: "text-clear",
    worse: "text-destructive",
    flat: "text-muted-foreground",
    none: "text-muted-foreground/50",
};

const TREND_GLYPH: Record<Trend, string> = {
    better: "▲",
    worse: "▼",
    flat: "→",
    none: "",
};

/**
 * A change against the previous run. Renders nothing but a dash when there is no
 * comparison to make — an absent baseline must never look like a flat one.
 */
export function DeltaBadge({
    delta,
    higherIsBetter,
    format,
}: {
    delta: MetricDelta;
    higherIsBetter: boolean;
    format: (d: MetricDelta) => string;
}) {
    const t = trend(delta, higherIsBetter);
    const label = format(delta);

    if (t === "none") {
        return (
            <span
                className="font-mono text-xs text-muted-foreground/50"
                title="No comparable previous run"
            >
                {NONE}
            </span>
        );
    }

    return (
        <span className={`font-mono text-xs tabular-nums ${TREND_CLASS[t]}`}>
            {/* The glyph is decorative; the sign in the label carries the meaning,
                so screen readers aren't given "black up-pointing triangle". */}
            <span aria-hidden="true">{TREND_GLYPH[t]}</span> {label}
        </span>
    );
}

/** A headline number with its change. */
export function MetricTile({
    label,
    value,
    sub,
    delta,
    higherIsBetter,
    format,
    warn,
}: {
    label: string;
    value: string;
    sub?: string;
    delta?: MetricDelta;
    higherIsBetter?: boolean;
    format?: (d: MetricDelta) => string;
    /** Draws attention without asserting a trend — for a standing caveat. */
    warn?: boolean;
}) {
    return (
        <div
            className={`rounded-xl border bg-card px-4 py-3.5 ${warn ? "border-primary/40" : ""}`}
        >
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground/70">
                {label}
            </p>
            <div className="mt-1.5 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                    {value}
                </span>
                {delta && format && higherIsBetter !== undefined && (
                    <DeltaBadge
                        delta={delta}
                        higherIsBetter={higherIsBetter}
                        format={format}
                    />
                )}
            </div>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
    );
}

/**
 * One recall figure as a bar. NaN draws an empty dotted track rather than a
 * zero-width filled bar, which would read as 0%.
 */
export function RecallBar({
    label,
    recall,
    allHit,
    total,
    delta,
    indent,
}: {
    label: string;
    recall: number;
    allHit: number;
    total: number;
    delta?: MetricDelta;
    indent?: boolean;
}) {
    const defined = !Number.isNaN(recall);
    const width = defined ? `${Math.max(recall * 100, 0.5)}%` : "0%";

    return (
        <div className={indent ? "pl-4" : ""}>
            <div className="flex items-baseline justify-between gap-3">
                <span
                    className={`text-sm ${indent ? "text-muted-foreground" : "font-medium text-foreground"}`}
                >
                    {label}
                </span>
                <span className="flex items-baseline gap-2">
                    <span className="font-mono text-sm tabular-nums text-foreground">
                        {pct(recall)}
                    </span>
                    {/* deltaPp, not a local formatter: an inline copy of this got
                        an unchanged metric wrong, rendering 0 as "−0.0pp". */}
                    {delta && (
                        <DeltaBadge delta={delta} higherIsBetter format={deltaPp} />
                    )}
                </span>
            </div>
            <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${label}: ${pct(recall)}`}
            >
                {defined && (
                    <div
                        className={`h-full rounded-full ${recall >= 1 ? "bg-clear" : "bg-primary"}`}
                        style={{ width }}
                    />
                )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                {total === 0
                    ? "no questions in this group"
                    : `${allHit}/${total} questions retrieved every expected source`}
            </p>
        </div>
    );
}

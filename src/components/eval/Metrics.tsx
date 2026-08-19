// Metric primitives for the /eval dashboard. Server components — everything on
// this page is static data read at build time, so none of it needs to ship JS.

import type { MetricDelta } from "@/lib/eval/diff";
import {
    NONE,
    deltaPp,
    isFirstMeasurement,
    pct,
    trend,
    type Trend,
} from "@/lib/eval/format";

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
 * A collapsed section, closed by default.
 *
 * This page publishes its own failure lists, which is the strongest thing it
 * does and also the reason it grew to five thousand words. The evidence is for
 * checking a number, not for reading front to back — so it lives one click
 * away rather than in the scroll. Native <details>, so it still costs no JS and
 * still opens under ctrl-F and print.
 */
export function Disclosure({
    label,
    count,
    tone = "neutral",
    children,
}: {
    label: string;
    /** Shown beside the label. Omit when a count would be meaningless. */
    count?: number | string;
    /** `bad` marks a list of failures, so a non-empty one reads as one. */
    tone?: "neutral" | "bad";
    children: React.ReactNode;
}) {
    // A disclosure with a count of zero has nothing to disclose, and a row of
    // "Fixed 0 / Standing 0" toggles is exactly the noise this pass is for.
    if (count === 0) return null;

    return (
        <details className="group mt-3 rounded-lg border bg-background/40">
            <summary className="flex cursor-pointer list-none items-baseline gap-2 px-3 py-2 hover:bg-muted/40">
                <span
                    className="font-mono text-[0.65rem] text-muted-foreground/50 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                >
                    ▸
                </span>
                <span className="flex-1 text-xs font-medium text-foreground">{label}</span>
                {count !== undefined && (
                    <span
                        className={`font-mono text-xs tabular-nums ${
                            tone === "bad" ? "text-destructive" : "text-muted-foreground"
                        }`}
                    >
                        {count}
                    </span>
                )}
            </summary>
            <div className="border-t border-border/50 px-3 py-3">{children}</div>
        </details>
    );
}

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
        // A metric measured for the first time is not an unchanged one. It gets
        // a label rather than the dash, because a bare dash beside a strong
        // number invites the reader to supply the missing comparison — and it
        // is deliberately NOT coloured, since there is nothing yet to be better
        // than. The real arrow appears on its own once a baseline exists.
        if (isFirstMeasurement(delta)) {
            return (
                <span
                    className="font-mono text-[0.7rem] text-muted-foreground/70"
                    title="Measured in this run only — the previous run did not measure it, so there is no change to report"
                >
                    first measured
                </span>
            );
        }

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
    caption,
}: {
    label: string;
    recall: number;
    allHit: number;
    total: number;
    delta?: MetricDelta;
    indent?: boolean;
    /** Replaces the default "n/m retrieved every expected source" line, for
     *  bars measuring something other than recall. */
    caption?: string;
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
                    : (caption ??
                      `${allHit}/${total} questions retrieved every expected source`)}
            </p>
        </div>
    );
}

// Provenance and history: what produced this run, and how the numbers have moved.

import type { MetricDelta, RunDiff } from "@/lib/eval/diff";
import type { EvalRun } from "@/lib/eval/run";
import { NONE, deltaMs, ms, pct, runDate, shortDate } from "@/lib/eval/format";
import { DeltaBadge } from "@/components/eval/Metrics";

/**
 * Everything needed to decide whether this run is comparable to another one.
 * Printed as provenance rather than tucked away, because every number on the
 * page is a claim about one corpus, one k and one embedding model.
 */
export function RunProvenance({ run }: { run: EvalRun }) {
    const m = run.meta;
    const facts: [string, string][] = [
        ["run", runDate(m.startedAt)],
        ["commit", m.gitSha ?? "unknown"],
        ["embedding", m.embeddingModel],
        ["generation", m.generationModel ?? "not called"],
        ["k", String(m.matchCount)],
        ["corpus", `${m.corpus.chunks} chunks / ${m.corpus.sources} sources`],
        [
            "questions",
            `${m.questions.total} (${m.questions.covered} covered, ${m.questions.hard} hard, ${m.questions.uncovered} out-of-corpus)`,
        ],
    ];

    return (
        <dl className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[0.7rem] sm:gap-x-5">
            {facts.map(([k, v]) => (
                <div key={k} className="flex gap-1.5">
                    <dt className="text-muted-foreground/60">{k}</dt>
                    <dd className="text-muted-foreground">{v}</dd>
                </div>
            ))}
        </dl>
    );
}

/**
 * Reasons the deltas on this page may reflect a changed measurement rather than a
 * changed system. Shown prominently when non-empty — the alternative is a page
 * that reports a +25pp improvement caused entirely by adding easy questions.
 */
export function Warnings({ warnings }: { warnings: string[] }) {
    if (warnings.length === 0) return null;

    return (
        <div className="rounded-xl border border-primary/40 bg-primary/[0.06] p-4">
            <p className="text-sm font-semibold text-primary">
                Comparable with caution
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
                Something changed between these two runs besides the system under test.
            </p>
            <ul className="mt-2.5 space-y-1.5">
                {warnings.map((w) => (
                    <li
                        key={w}
                        className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                    >
                        <span className="text-primary/60" aria-hidden="true">
                            →
                        </span>
                        <span>{w}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function LatencyTable({ diff }: { diff: RunDiff }) {
    const gen = diff.current.generation;

    // A retrieval-only run still measured two stages honestly; show those rather
    // than nothing, and say why the rest are absent.
    const rows: { stage: string; p50: number; p95: number; note: string; delta?: MetricDelta }[] =
        gen
            ? gen.latency.map((s) => ({ ...s }))
            : [
                  {
                      stage: "Embed the question",
                      p50: diff.current.summary.latency.embedP50,
                      p95: diff.current.summary.latency.embedP95,
                      note: "One API call, 768-dim",
                      delta: diff.latency.embedP50,
                  },
                  {
                      stage: "Vector search",
                      p50: diff.current.summary.latency.searchP50,
                      p95: diff.current.summary.latency.searchP95,
                      note: "pgvector, top-k",
                      delta: diff.latency.searchP50,
                  },
              ];

    return (
        <section>
            <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                Latency
            </p>
            <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[20rem] text-left text-sm sm:min-w-[34rem]">
                    <thead>
                        <tr className="border-b text-[0.65rem] uppercase tracking-wider text-muted-foreground/70">
                            <th className="px-3 py-2.5 font-normal sm:px-4">Stage</th>
                            <th className="px-3 py-2.5 text-right font-normal sm:px-4">p50</th>
                            <th className="px-3 py-2.5 text-right font-normal sm:px-4">p95</th>
                            {/* Ancillary — dropped below sm so the four real
                                columns fit a phone without a sideways scroll. */}
                            <th className="hidden px-4 py-2.5 font-normal sm:table-cell">
                                Note
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr
                                key={r.stage}
                                className={i < rows.length - 1 ? "border-b border-border/50" : ""}
                            >
                                <td className="px-3 py-2.5 text-foreground sm:px-4">{r.stage}</td>
                                <td className="px-3 py-2.5 text-right sm:px-4">
                                    <span className="font-mono tabular-nums text-foreground">
                                        {ms(r.p50)}
                                    </span>
                                    {r.delta && (
                                        <span className="ml-2">
                                            <DeltaBadge
                                                delta={r.delta}
                                                higherIsBetter={false}
                                                format={deltaMs}
                                            />
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground sm:px-4">
                                    {ms(r.p95)}
                                </td>
                                <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">
                                    {r.note}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="mt-2 max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                Nearest-rank percentiles, no interpolation — at{" "}
                {gen ? `${gen.reps} repetition${gen.reps === 1 ? "" : "s"}` : "one repetition"} per
                question an interpolated percentile would imply precision the sample size
                doesn&apos;t support. Runs are sequential and paced; running them concurrently
                would measure contention rather than latency.
                {!gen && " Generation stages are absent because this run made no model calls."}
            </p>
        </section>
    );
}

export function RunHistory({ runs }: { runs: EvalRun[] }) {
    if (runs.length < 2) return null;

    return (
        <section>
            <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                Run history
            </p>
            <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[22rem] text-left text-sm sm:min-w-[38rem]">
                    <thead>
                        <tr className="border-b text-[0.65rem] uppercase tracking-wider text-muted-foreground/70">
                            <th className="px-3 py-2.5 font-normal sm:px-4">Date</th>
                            {/* Dropped below sm. Questions is NOT droppable —
                                the caption tells you to read it before Recall. */}
                            <th className="hidden px-4 py-2.5 font-normal sm:table-cell">
                                Commit
                            </th>
                            <th className="px-3 py-2.5 text-right font-normal sm:px-4">Recall@k</th>
                            <th className="px-3 py-2.5 text-right font-normal sm:px-4">Hard</th>
                            <th className="px-3 py-2.5 text-right font-normal sm:px-4">Refused</th>
                            <th className="px-3 py-2.5 text-right font-normal sm:px-4">Questions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {runs.map((r, i) => (
                            <tr
                                key={r.meta.startedAt}
                                className={i < runs.length - 1 ? "border-b border-border/50" : ""}
                            >
                                <td className="whitespace-nowrap px-3 py-2.5 text-foreground sm:px-4">
                                    {shortDate(r.meta.startedAt)}
                                    {i === 0 && (
                                        <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-primary">
                                            latest
                                        </span>
                                    )}
                                </td>
                                <td className="hidden px-4 py-2.5 font-mono text-xs text-muted-foreground sm:table-cell">
                                    {r.meta.gitSha ?? NONE}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-foreground sm:px-4">
                                    {pct(r.summary.overall.recall)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground sm:px-4">
                                    {pct(r.summary.hard.recall)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground sm:px-4">
                                    {r.generation
                                        ? `${r.generation.refusals.refused}/${r.generation.refusals.total}`
                                        : NONE}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground sm:px-4">
                                    {r.meta.questions.covered}
                                    <span className="text-muted-foreground/50">
                                        {" "}
                                        /{r.meta.questions.total}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="mt-2 max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                Read the Questions column before reading the Recall column. Recall is a fraction
                over the question set, so it moves when the set changes — a row with a different
                denominator is not directly comparable to the one above it.
            </p>
        </section>
    );
}

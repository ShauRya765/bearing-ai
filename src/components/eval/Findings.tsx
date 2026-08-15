// The parts of the dashboard that show failures rather than summary numbers.
//
// A recall percentage tells you how much is wrong. Only these panels tell you
// WHAT is wrong, which is the only form the number can be acted on in. Both are
// deliberately unflattering: the misses are listed with the sources that came
// back instead, and a leaked answer to an out-of-corpus question is quoted
// verbatim.

import type { RunDiff } from "@/lib/eval/diff";
import type { GenerationResult } from "@/lib/eval/run";
import { deltaPp, pct } from "@/lib/eval/format";
import { DeltaBadge } from "@/components/eval/Metrics";
import type { QuestionScore } from "@/lib/eval/score";

type Tone = "bad" | "neutral" | "good";

const TONE: Record<Tone, { border: string; text: string; dot: string }> = {
    bad: {
        border: "border-destructive/40 bg-destructive/[0.06]",
        text: "text-destructive",
        dot: "bg-destructive",
    },
    neutral: { border: "border-border bg-card", text: "text-muted-foreground", dot: "bg-muted-foreground" },
    good: {
        border: "border-clear/40 bg-clear/[0.06]",
        text: "text-clear",
        dot: "bg-clear",
    },
};

function MissBucket({
    title,
    explain,
    scores,
    tone,
    showRetrieved = true,
}: {
    title: string;
    explain: string;
    scores: QuestionScore[];
    tone: Tone;
    showRetrieved?: boolean;
}) {
    if (scores.length === 0) return null;
    const t = TONE[tone];

    return (
        <div className={`rounded-xl border p-4 ${t.border}`}>
            <p className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
                <span className={`text-sm font-semibold ${t.text}`}>
                    {title} ({scores.length})
                </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{explain}</p>
            <ul className="mt-3 space-y-3">
                {scores.map((s) => (
                    <li key={s.question} className="text-xs">
                        <p className="text-foreground">
                            {s.hard && (
                                <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                                    hard
                                </span>
                            )}
                            &ldquo;{s.question}&rdquo;
                        </p>
                        {showRetrieved && (
                            <p className="mt-1 font-mono text-[0.7rem] leading-relaxed text-muted-foreground">
                                <span className="text-destructive/80">missing:</span>{" "}
                                {s.missing.join(", ")}
                                <br />
                                {/* What came back instead is the actual debugging
                                    information — a missing title alone doesn't tell
                                    you which neighbour outranked it. */}
                                <span className="text-muted-foreground/60">got:</span>{" "}
                                {s.titles.slice(0, 3).join(", ")}
                                {s.titles.length > 3 && "…"}
                            </p>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function MissPanel({ diff }: { diff: RunDiff }) {
    const { newMisses, persistentMisses, fixedMisses, untrackedMisses } = diff;
    const nothing =
        newMisses.length +
            persistentMisses.length +
            fixedMisses.length +
            untrackedMisses.length ===
        0;

    return (
        <section>
            <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                Failures, by what changed
            </p>

            {nothing ? (
                <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm font-medium text-clear">
                        Every covered question retrieved every expected source.
                    </p>
                    <p className="mt-1.5 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                        Read this as a statement about the eval set, not about the retriever. A
                        set that never fails has stopped being a measurement — it means the
                        questions no longer reach the edge of what retrieval can do. The useful
                        response to a clean run is harder questions, not satisfaction.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    <MissBucket
                        title="New failures"
                        explain="Passed in the previous run, fails now. A regression."
                        scores={newMisses}
                        tone="bad"
                    />
                    <MissBucket
                        title="Standing failures"
                        explain="Failed in both runs. A known weakness, not news."
                        scores={persistentMisses}
                        tone="neutral"
                    />
                    <MissBucket
                        title="Newly tracked failures"
                        explain="Failing, but the previous run never asked them — added to the set since. Not a regression."
                        scores={untrackedMisses}
                        tone="neutral"
                    />
                    <MissBucket
                        title="Fixed"
                        explain="Failed in the previous run, passes now."
                        scores={fixedMisses}
                        tone="good"
                        showRetrieved={false}
                    />
                </div>
            )}
        </section>
    );
}

export function RefusalPanel({
    generation,
    diff,
    uncoveredTotal,
    matchCount,
    alwaysFullK,
}: {
    generation: GenerationResult | null;
    diff: RunDiff;
    uncoveredTotal: number;
    matchCount: number;
    alwaysFullK: boolean;
}) {
    return (
        <section>
            <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                Refusal — the generation layer
            </p>

            <div className="rounded-xl border bg-card p-5">
                <p className="max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                    {uncoveredTotal} questions in the set are deliberately outside the corpus.
                    The correct answer to each is &ldquo;I don&apos;t have a rule for
                    that&rdquo;.{" "}
                    {alwaysFullK && (
                        <>
                            Retrieval cannot produce that answer: every one of them still returned
                            a full {matchCount} chunks, because the search applies no similarity
                            floor. Refusing is entirely the prompt&apos;s job, so it can only be
                            measured by asking for real.
                        </>
                    )}
                </p>

                {!generation ? (
                    <p className="mt-4 rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
                        This run was retrieval-only — no generation calls were made, so refusal is
                        unmeasured. Re-run with{" "}
                        <code className="font-mono text-primary">--full</code> to measure it.
                    </p>
                ) : (
                    <>
                        <div className="mt-4 flex items-baseline gap-3">
                            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                                {generation.refusals.refused}/{generation.refusals.total}
                            </span>
                            <span className="text-sm text-muted-foreground">
                                declined ({pct(generation.refusals.refused / generation.refusals.total, 0)})
                            </span>
                            {diff.refusalRate && (
                                <DeltaBadge
                                    delta={diff.refusalRate}
                                    higherIsBetter
                                    format={deltaPp}
                                />
                            )}
                        </div>

                        {generation.refusals.answered.length > 0 && (
                            <div className="mt-4 space-y-3">
                                {generation.refusals.answered.map((a) => (
                                    <div
                                        key={a.question}
                                        className="rounded-lg border border-destructive/40 bg-destructive/[0.06] p-3.5"
                                    >
                                        <p className="text-xs font-semibold text-destructive">
                                            Answered instead of refusing
                                        </p>
                                        <p className="mt-1.5 text-xs text-foreground">
                                            &ldquo;{a.question}&rdquo;
                                        </p>
                                        {/* Quoted verbatim. A refusal rate with no examples is a
                                            number you can't act on, and paraphrasing a leak makes
                                            it look milder than it is. */}
                                        <p className="mt-2 border-l-2 border-destructive/30 pl-3 font-mono text-[0.7rem] leading-relaxed text-muted-foreground">
                                            {a.excerpt}…
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {generation.refusals.answered.length === 0 && (
                            <p className="mt-3 text-xs text-clear">
                                Every out-of-corpus question was declined.
                            </p>
                        )}

                        <p className="mt-4 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                            Measured by string-matching a fixed list of refusal phrasings. That is a
                            deliberate weakness: if the model starts declining in wording the list
                            doesn&apos;t cover, this number drops, which is a prompt change worth
                            seeing rather than smoothing over with a fuzzier matcher.
                        </p>
                    </>
                )}
            </div>
        </section>
    );
}

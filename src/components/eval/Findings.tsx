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
import { DeltaBadge, Disclosure } from "@/components/eval/Metrics";
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

/** The rows themselves, shared by the open bucket and the collapsed ones. */
function MissList({
    scores,
    showRetrieved = false,
}: {
    scores: QuestionScore[];
    showRetrieved?: boolean;
}) {
    return (
        <ul className="space-y-3">
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
    );
}

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
        <div className={`rounded-xl border p-3.5 sm:p-4 ${t.border}`}>
            <p className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
                <span className={`text-sm font-semibold ${t.text}`}>
                    {title} ({scores.length})
                </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{explain}</p>
            <div className="mt-3">
                <MissList scores={scores} showRetrieved={showRetrieved} />
            </div>
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
                <div className="rounded-xl border bg-card p-4 sm:p-5">
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
                    {/* Regressions stay open. Everything else collapses: a new failure
                        is the one thing on this page you must not have to click to
                        find, and it is usually a short list or an empty one. */}
                    <MissBucket
                        title="New failures"
                        explain="Passed in the previous run, fails now. A regression."
                        scores={newMisses}
                        tone="bad"
                    />

                    {persistentMisses.length + untrackedMisses.length + fixedMisses.length >
                        0 && (
                        <div className="rounded-xl border bg-card px-3 pb-3 pt-1 sm:px-4">
                            <Disclosure
                                label="Standing failures — failed in both runs"
                                count={persistentMisses.length}
                            >
                                <MissList scores={persistentMisses} showRetrieved />
                            </Disclosure>
                            <Disclosure
                                label="Newly tracked — the previous run never asked these"
                                count={untrackedMisses.length}
                            >
                                <MissList scores={untrackedMisses} showRetrieved />
                            </Disclosure>
                            <Disclosure
                                label="Fixed — failed before, passes now"
                                count={fixedMisses.length}
                            >
                                <MissList scores={fixedMisses} />
                            </Disclosure>
                        </div>
                    )}
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

            <div className="rounded-xl border bg-card p-4 sm:p-5">
                <p className="max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                    {uncoveredTotal} questions are deliberately outside the corpus; the correct
                    answer to each is &ldquo;I don&apos;t have a rule for that&rdquo;.{" "}
                    {alwaysFullK && (
                        <>
                            Retrieval can&apos;t produce it — all {matchCount} chunks come back
                            regardless, since search applies no similarity floor — so refusing is
                            the prompt&apos;s job.{" "}
                        </>
                    )}
                    Detected by string-matching a fixed list of phrasings, which is a deliberate
                    weakness: if the model starts declining in wording the list doesn&apos;t
                    cover, this number drops, and that is a prompt change worth seeing.
                </p>

                {!generation ? (
                    <p className="mt-4 rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
                        This run was retrieval-only — no generation calls were made, so refusal is
                        unmeasured. Re-run with{" "}
                        <code className="font-mono text-primary">--full</code> to measure it.
                    </p>
                ) : (
                    <>
                        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
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
                    </>
                )}
            </div>
        </section>
    );
}

export function FaithfulnessPanel({
    generation,
    diff,
}: {
    generation: GenerationResult | null;
    diff: RunDiff;
}) {
    const f = generation?.faithfulness;

    return (
        <section>
            <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                Faithfulness — is the prose supported?
            </p>

            <div className="rounded-xl border bg-card p-4 sm:p-5">
                <p className="max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                    Each answer is split into atomic claims and every claim checked against the
                    passages that answer was generated from — not against the world, so a claim
                    that is true in reality but absent from the sources counts as{" "}
                    <span className="text-foreground">unsupported</span>. It bounds invention,
                    not truth: an answer faithfully drawn from the wrong chunk still scores 100%,
                    and the judge is a Gemini model grading Gemini output.
                </p>

                {!f ? (
                    <p className="mt-4 rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
                        Not measured in this run. Re-run with{" "}
                        <code className="font-mono text-primary">--judge</code> to grade answer
                        faithfulness.
                    </p>
                ) : (
                    <>
                        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                                {pct(f.score)}
                            </span>
                            <span className="text-sm text-muted-foreground">
                                of claims supported, across {f.judged} judged answers
                            </span>
                            {diff.faithfulness && (
                                <DeltaBadge
                                    delta={diff.faithfulness}
                                    higherIsBetter
                                    format={deltaPp}
                                />
                            )}
                        </div>

                        <p className="mt-2 font-mono text-[0.7rem] text-muted-foreground">
                            {f.clean}/{f.judged} answers fully supported · {f.skippedRefusals}{" "}
                            refusals skipped (scoring them would let a system that refuses
                            everything post 100%) · {f.failed} judge failures, excluded rather than
                            scored zero · judged by {f.judgeModel}
                        </p>

                        {f.unsupported.length > 0 && (
                            <Disclosure
                                label="Unsupported claims"
                                count={f.unsupported.length}
                                tone="bad"
                            >
                                <ul className="space-y-3">
                                    {f.unsupported.map((u, i) => (
                                        <li key={`${u.question}-${i}`} className="text-xs">
                                            <p className="text-foreground">
                                                &ldquo;{u.question}&rdquo;
                                            </p>
                                            <p className="mt-1 font-mono text-[0.7rem] leading-relaxed text-muted-foreground">
                                                <span className="text-destructive/80">claim:</span>{" "}
                                                {u.claim}
                                                <br />
                                                <span className="text-muted-foreground/60">
                                                    judge:
                                                </span>{" "}
                                                {u.note}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            </Disclosure>
                        )}

                        {f.unsupported.length === 0 && f.judged > 0 && (
                            <p className="mt-4 text-sm font-medium text-clear">
                                Every claim in every judged answer was supported by its retrieved
                                passages.
                            </p>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

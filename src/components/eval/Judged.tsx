// The three Claude-judged panels: context precision, answer relevance, and
// correctness.
//
// Each metric is explained ONCE, here, in a sentence or two. The caveats that
// used to be repeated in the limits list and the metric grid live in the panel
// they belong to, and every failure list is collapsed — it is evidence for
// checking a number, not prose to read through.
//
// Server components, like everything else on this page.

import type { RunDiff } from "@/lib/eval/diff";
import { deltaPp, pct } from "@/lib/eval/format";
import type { GenerationResult } from "@/lib/eval/run";
import { DeltaBadge, Disclosure } from "@/components/eval/Metrics";

/** Shared panel chrome: eyebrow, one-line definition, headline figure, caveat. */
function Panel({
    eyebrow,
    what,
    children,
}: {
    eyebrow: string;
    what: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section>
            <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                {eyebrow}
            </p>
            <div className="rounded-xl border bg-card p-4 sm:p-5">
                <p className="max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                    {what}
                </p>
                {children}
            </div>
        </section>
    );
}

function NotMeasured({ what }: { what: string }) {
    return (
        <p className="mt-4 rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
            Not measured in this run. Re-run with{" "}
            <code className="font-mono text-primary">--judge</code> to grade {what}.
        </p>
    );
}

/** The headline number, its denominator, and its change. */
function Headline({
    value,
    of,
    delta,
    higherIsBetter = true,
}: {
    value: string;
    of: React.ReactNode;
    delta?: RunDiff["faithfulness"];
    higherIsBetter?: boolean;
}) {
    return (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                {value}
            </span>
            <span className="text-sm text-muted-foreground">{of}</span>
            {delta && (
                <DeltaBadge delta={delta} higherIsBetter={higherIsBetter} format={deltaPp} />
            )}
        </div>
    );
}

/** The mono counts line under a headline. */
function Meta({ children }: { children: React.ReactNode }) {
    return (
        <p className="mt-2 font-mono text-[0.7rem] text-muted-foreground">{children}</p>
    );
}

/** A quoted question with its finding. */
function Finding({
    question,
    rows,
}: {
    question: string;
    rows: [string, string][];
}) {
    return (
        <li className="text-xs">
            <p className="text-foreground">&ldquo;{question}&rdquo;</p>
            <p className="mt-1 font-mono text-[0.7rem] leading-relaxed text-muted-foreground">
                {rows.map(([k, v], i) => (
                    <span key={k}>
                        {i > 0 && <br />}
                        <span className="text-muted-foreground/60">{k}:</span> {v}
                    </span>
                ))}
            </p>
        </li>
    );
}

export function ContextPrecisionPanel({
    generation,
    diff,
}: {
    generation: GenerationResult | null;
    diff: RunDiff;
}) {
    const p = generation?.contextPrecision;

    return (
        <Panel
            eyebrow="Context precision — was what came back relevant?"
            what={
                <>
                    A judge scores each retrieved chunk on its own merits, so it can credit a
                    useful card the expected list doesn&apos;t name — which is what rank
                    precision above cannot do. It is also the only metric{" "}
                    <span className="text-foreground">defined for out-of-corpus questions</span>
                    , where the target is zero.
                </>
            }
        >
            {!p ? (
                <NotMeasured what="chunk relevance" />
            ) : (
                <>
                    <Headline
                        value={pct(p.score)}
                        of={`of retrieved chunks judged relevant, across ${p.judged} covered questions`}
                        delta={diff.contextPrecision ?? undefined}
                    />
                    <Headline
                        value={pct(p.uncoveredScore)}
                        of={
                            <>
                                on {p.uncoveredJudged} out-of-corpus questions —{" "}
                                <span className="text-foreground">lower is better</span>
                            </>
                        }
                        delta={diff.uncoveredPrecision ?? undefined}
                        higherIsBetter={false}
                    />
                    <Meta>
                        {p.failed} judge failures · judged by {p.judgeModel}
                    </Meta>

                    {p.topRankIrrelevant.length > 0 && (
                        <Disclosure
                            label="Led with an irrelevant chunk"
                            count={p.topRankIrrelevant.length}
                            tone="bad"
                        >
                            <ul className="space-y-3">
                                {p.topRankIrrelevant.map((t, i) => (
                                    <Finding
                                        key={`${t.question}-${i}`}
                                        question={t.question}
                                        rows={[
                                            ["rank 1", t.sourceTitle],
                                            ["judge", t.note],
                                        ]}
                                    />
                                ))}
                            </ul>
                        </Disclosure>
                    )}

                    {p.uncoveredRelevant.length > 0 && (
                        <Disclosure
                            label="Out-of-corpus questions that found something relevant"
                            count={p.uncoveredRelevant.length}
                            tone="bad"
                        >
                            <p className="mb-3 max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                                The corpus declares fees, medicals and processing times out of
                                scope, and the refusal metric is drawn from exactly those topics.
                                A relevant chunk here is the first sign that boundary is eroding.
                            </p>
                            <ul className="space-y-3">
                                {p.uncoveredRelevant.map((u, i) => (
                                    <Finding
                                        key={`${u.question}-${i}`}
                                        question={u.question}
                                        rows={[["found", `${u.sourceTitle} — ${u.note}`]]}
                                    />
                                ))}
                            </ul>
                        </Disclosure>
                    )}
                </>
            )}
        </Panel>
    );
}

export function AnswerRelevancePanel({
    generation,
    diff,
}: {
    generation: GenerationResult | null;
    diff: RunDiff;
}) {
    const r = generation?.answerRelevance;

    return (
        <Panel
            eyebrow="Answer relevance — did it answer the question asked?"
            what={
                <>
                    Each answer is shown to a model{" "}
                    <span className="text-foreground">without its question</span>; the model
                    writes the questions that answer would answer, and those are embedded and
                    compared against the real one. Withholding the question is what stops it
                    echoing the question back and scoring everything perfect. Uncalibrated, so
                    read the change rather than the value — and a fluent, confident, wrong
                    answer scores well here.
                </>
            }
        >
            {!r ? (
                <NotMeasured what="answer relevance" />
            ) : (
                <>
                    <Headline
                        value={pct(r.score)}
                        of={`mean similarity, across ${r.judged} scored answers`}
                        delta={diff.answerRelevance ?? undefined}
                    />
                    <Meta>
                        {r.skippedRefusals} refusals skipped · {r.failed} failures · judged by{" "}
                        {r.judgeModel} · embedded with {r.embeddingModel}
                    </Meta>

                    {r.lowest.length > 0 && (
                        <Disclosure label="Weakest answers" count={r.lowest.length}>
                            <p className="mb-3 max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                                Each with the question the model thought the answer was
                                answering. Where that reads as a different question from the one
                                asked, the score is telling the truth.
                            </p>
                            <ul className="space-y-3">
                                {r.lowest.map((l, i) => (
                                    <li key={`${l.question}-${i}`} className="text-xs">
                                        <p className="flex items-baseline gap-2">
                                            <span className="font-mono tabular-nums text-primary">
                                                {pct(l.score)}
                                            </span>
                                            <span className="text-foreground">
                                                &ldquo;{l.question}&rdquo;
                                            </span>
                                        </p>
                                        <p className="mt-1 font-mono text-[0.7rem] leading-relaxed text-muted-foreground">
                                            <span className="text-muted-foreground/60">
                                                answered instead:
                                            </span>{" "}
                                            {l.generated[0] ?? "—"}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </Disclosure>
                    )}
                </>
            )}
        </Panel>
    );
}

export function CorrectnessPanel({
    generation,
    diff,
}: {
    generation: GenerationResult | null;
    diff: RunDiff;
}) {
    const c = generation?.correctness;

    return (
        <Panel
            eyebrow="Correctness — is it right?"
            what={
                <>
                    Every other number here grades the system against its own corpus, so all of
                    them read 100% on an answer faithfully drawn from a card that is wrong. This
                    one grades against{" "}
                    <span className="text-foreground">canada.ca</span>: each gold question
                    carries the facts a right answer must state and the page they were read
                    from, with the date. Those facts are as current as that date — IRCC edits
                    the pages.
                </>
            }
        >
            {!c ? (
                <NotMeasured what="correctness against the gold subset" />
            ) : (
                <>
                    <Headline
                        value={pct(c.score)}
                        of={`across ${c.judged} of ${c.gold} gold-labelled questions`}
                        delta={diff.correctness ?? undefined}
                    />
                    {/* The denominator is stated loudly and separately: a correctness
                        figure that let a reader assume full coverage would be the same
                        class of lie the rest of this page is built to avoid. */}
                    <p className="mt-2 rounded-lg border border-primary/40 bg-primary/[0.06] px-3 py-2 text-xs text-muted-foreground">
                        <span className="text-foreground">
                            This figure speaks for {c.gold} questions, not {c.covered}.
                        </span>{" "}
                        Labelling is manual and cited, so the subset grows slowly. Correctness is
                        never averaged into another metric, and a changed subset raises a warning
                        above.
                    </p>
                    <Meta>
                        {/* {" "} not a newline: JSX drops the whitespace between an
                            expression and text on the following line, which
                            rendered this as "73.3%deterministic". */}
                        {pct(c.factCoverage)}{" "}
                        deterministic fact coverage (a floor — it
                        can&apos;t see a paraphrase) · {c.failed} judge failures · judged by{" "}
                        {c.judgeModel}
                    </Meta>

                    {c.contradictions.length > 0 && (
                        <Disclosure
                            label="Wrong — contradicted the cited source"
                            count={c.contradictions.length}
                            tone="bad"
                        >
                            <ul className="space-y-3">
                                {c.contradictions.map((w, i) => (
                                    <Finding
                                        key={`${w.question}-${i}`}
                                        question={w.question}
                                        rows={[
                                            ["claimed", w.fact],
                                            ["source", w.source],
                                        ]}
                                    />
                                ))}
                            </ul>
                        </Disclosure>
                    )}

                    {c.missing.length > 0 && (
                        <Disclosure label="Gold facts not stated" count={c.missing.length}>
                            <p className="mb-3 text-xs text-muted-foreground">
                                Incomplete rather than wrong — the answer didn&apos;t contradict
                                the source, it left this out.
                            </p>
                            <ul className="space-y-3">
                                {c.missing.map((m, i) => (
                                    <Finding
                                        key={`${m.question}-${i}`}
                                        question={m.question}
                                        rows={[["missing", `${m.fact} — ${m.note}`]]}
                                    />
                                ))}
                            </ul>
                        </Disclosure>
                    )}

                    {c.contradictions.length === 0 && c.judged > 0 && (
                        <p className="mt-4 text-sm font-medium text-clear">
                            No answer contradicted its cited source.
                        </p>
                    )}
                </>
            )}
        </Panel>
    );
}

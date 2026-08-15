// The eval set itself — every question, what it expects, and how it did.
//
// Without this the dashboard publishes a score and asks to be believed. A recall
// figure is only as good as the questions behind it, so the questions are the
// evidence and the number is the summary. Anyone can then check the thing that
// actually matters: whether the set is hard enough for its score to mean
// anything.
//
// Rendered from the same per-question rows the summary is computed from, so the
// list and the headline can never disagree. No client JS — grouping is static and
// the collapsibles are native <details>.

import type { EvalRun, GenerationResult } from "@/lib/eval/run";
import type { QuestionScore } from "@/lib/eval/score";

/** What is being measured, named and defined. */
const METRICS: { name: string; formula: string; body: string }[] = [
    {
        name: "Recall@k",
        formula: "expected sources retrieved ÷ expected sources",
        body: "Per covered question, averaged per question. Answers one question only: did the passage that answers this land in the top k?",
    },
    {
        name: "Refusal rate",
        formula: "declined ÷ out-of-corpus questions",
        body: "Over questions the corpus deliberately doesn't cover. A property of the prompt, not the retriever — search returns k chunks regardless.",
    },
    {
        name: "Stage latency",
        formula: "nearest-rank p50 / p95",
        body: "Wall clock per pipeline stage, measured sequentially from one machine. No interpolation at these sample sizes.",
    },
];

function ResultDot({ pass }: { pass: boolean }) {
    return (
        <span
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${pass ? "bg-clear" : "bg-destructive"}`}
            aria-hidden="true"
        />
    );
}

function CoveredRow({ score }: { score: QuestionScore }) {
    return (
        <li className="flex gap-2.5 py-1.5">
            <ResultDot pass={score.complete} />
            <div className="min-w-0 flex-1">
                <p className="text-xs leading-relaxed text-foreground">
                    {score.hard && (
                        <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                            hard
                        </span>
                    )}
                    {score.question}
                </p>
                {/* Only shown when it failed. A passing row's expected source is
                    the group heading it already sits under. */}
                {!score.complete && (
                    <p className="mt-0.5 font-mono text-[0.7rem] leading-relaxed text-destructive/80">
                        missed {score.missing.join(", ")} — got{" "}
                        {score.titles.slice(0, 3).join(", ")}
                        {score.titles.length > 3 && "…"}
                    </p>
                )}
                {/* Multi-source questions are the ones where partial credit is
                    possible, so name the second source rather than hiding it. */}
                {score.complete && score.expect.length > 1 && (
                    <p className="mt-0.5 font-mono text-[0.7rem] text-muted-foreground/70">
                        needs {score.expect.length} sources: {score.expect.join(" + ")}
                    </p>
                )}
            </div>
        </li>
    );
}

function TopicGroup({
    title,
    scores,
}: {
    title: string;
    scores: QuestionScore[];
}) {
    const passed = scores.filter((s) => s.complete).length;
    const clean = passed === scores.length;

    return (
        <details open className="group border-b last:border-b-0">
            <summary className="flex cursor-pointer list-none items-baseline gap-2 px-4 py-2.5 hover:bg-muted/40">
                <span
                    className="font-mono text-[0.65rem] text-muted-foreground/50 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                >
                    ▸
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">{title}</span>
                <span
                    className={`font-mono text-xs tabular-nums ${clean ? "text-muted-foreground" : "text-destructive"}`}
                >
                    {passed}/{scores.length}
                </span>
            </summary>
            <ul className="border-t border-border/50 bg-background/40 px-4 py-1.5 pl-9">
                {scores.map((s) => (
                    <CoveredRow key={s.question} score={s} />
                ))}
            </ul>
        </details>
    );
}

function UncoveredGroup({
    scores,
    generation,
}: {
    scores: QuestionScore[];
    generation: GenerationResult | null;
}) {
    // Per-question refusal is derived: the artifact records the FAILURES verbatim,
    // so anything not in that list was declined. Storing both would be two
    // representations of one fact.
    const leaked = new Set(generation?.refusals.answered.map((a) => a.question) ?? []);

    return (
        <details open className="group border-b last:border-b-0">
            <summary className="flex cursor-pointer list-none items-baseline gap-2 px-4 py-2.5 hover:bg-muted/40">
                <span
                    className="font-mono text-[0.65rem] text-muted-foreground/50 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                >
                    ▸
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">
                    Out of corpus — the correct answer is a refusal
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {generation
                        ? `${scores.length - leaked.size}/${scores.length}`
                        : `${scores.length}`}
                </span>
            </summary>
            <ul className="border-t border-border/50 bg-background/40 px-4 py-1.5 pl-9">
                {scores.map((s) => {
                    const declined = generation ? !leaked.has(s.question) : null;
                    return (
                        <li key={s.question} className="flex gap-2.5 py-1.5">
                            {declined === null ? (
                                <span
                                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                                    aria-hidden="true"
                                />
                            ) : (
                                <ResultDot pass={declined} />
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="text-xs leading-relaxed text-foreground">
                                    {s.question}
                                </p>
                                <p className="mt-0.5 font-mono text-[0.7rem] text-muted-foreground/70">
                                    {declined === null
                                        ? "not measured — retrieval-only run"
                                        : declined
                                          ? "declined"
                                          : "answered anyway"}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </details>
    );
}

export function QuestionSet({ run }: { run: EvalRun }) {
    const covered = run.scores.filter((s) => s.covered);
    const uncovered = run.scores.filter((s) => !s.covered);

    // Grouped by the first expected source: the set is organised by topic, and a
    // topic with a systematic weakness shows up as a group rather than as
    // scattered rows.
    const groups = new Map<string, QuestionScore[]>();
    for (const s of covered) {
        const key = s.expect[0];
        const list = groups.get(key);
        if (list) list.push(s);
        else groups.set(key, [s]);
    }

    return (
        <section>
            <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                The eval set
            </p>

            {/* What the numbers above actually are. */}
            <div className="mb-4 grid gap-3 md:grid-cols-3">
                {METRICS.map((m) => (
                    <div key={m.name} className="rounded-xl border bg-card p-4">
                        <p className="text-sm font-semibold text-foreground">{m.name}</p>
                        <p className="mt-1 font-mono text-[0.65rem] leading-relaxed text-primary/80">
                            {m.formula}
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            {m.body}
                        </p>
                    </div>
                ))}
            </div>

            <p className="mb-4 max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                All {run.meta.questions.total} questions are below, with the source each one is
                expected to retrieve and how it did.{" "}
                <span className="text-foreground">
                    Questions are deliberately worded the way a user would ask
                </span>{" "}
                rather than in the vocabulary of the passage that answers them — retrieval that
                only works when the question echoes the source is keyword search wearing an
                embedding costume, and this set is built to catch that.{" "}
                <span className="text-foreground">{run.meta.questions.hard} are marked hard</span>
                : they share no vocabulary with their source, span two sources, or sit next to a
                neighbour that could plausibly be retrieved instead.
            </p>

            <div className="overflow-hidden rounded-xl border bg-card">
                {[...groups.entries()].map(([title, scores]) => (
                    <TopicGroup key={title} title={title} scores={scores} />
                ))}
                <UncoveredGroup scores={uncovered} generation={run.generation} />
            </div>

            <p className="mt-2 max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                Grouped by first expected source. Questions expecting two sources are listed under
                the first and score partial credit — the group count is questions that retrieved{" "}
                <em>every</em> source they expect. The set lives in{" "}
                <code className="font-mono">src/lib/eval/questions.ts</code>; the labels are
                hand-written, which is this measurement&apos;s main limitation and is why the
                section below says so.
            </p>
        </section>
    );
}

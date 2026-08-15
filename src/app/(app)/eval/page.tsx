// The eval dashboard.
//
// A Server Component with no client JS: every figure comes from a JSON run
// artifact committed under src/lib/eval/runs/, read at build time. The page makes
// no API calls, costs nothing to serve, and cannot show a number that isn't
// attributable to a commit.
//
// It is public on purpose. Publishing your own miss list is a stronger claim than
// publishing a score — anyone can report 100%, and a page that shows where the
// system fails is the only version of this that is worth trusting.

import { diffRuns } from "@/lib/eval/diff";
import { deltaCount, deltaPp, pct } from "@/lib/eval/format";
import { loadHistory } from "@/lib/eval/runs-store";
import { MetricTile, RecallBar } from "@/components/eval/Metrics";
import { MissPanel, RefusalPanel } from "@/components/eval/Findings";
import { QuestionSet } from "@/components/eval/QuestionSet";
import { LatencyTable, RunHistory, RunProvenance, Warnings } from "@/components/eval/Runs";

// What the numbers above cannot tell you. Written down because every one of these
// is a question an informed reader will ask, and answering them on the page is
// cheaper than being caught by them.
const LIMITS: { title: string; body: string }[] = [
    {
        title: "Recall@k is not answer quality",
        body: "It asks one question: did the passage that answers this land in the top k? A run can retrieve every correct source and still produce a wrong answer from it. Nothing on this page grades the prose.",
    },
    {
        title: "The eval set was written by the same person as the corpus",
        body: "That is the sharpest bias here. Questions are deliberately worded the way a user would ask rather than in the source's vocabulary, and adversarial ones are marked hard and scored separately — but a set authored alongside the corpus still cannot discover a topic its author never thought of. Production questions are the correction, and they are not in this page yet.",
    },
    {
        title: "Out-of-corpus recall is undefined, not 100%",
        body: "Questions the corpus doesn't cover have no expected source, so recall over them is a fraction with no denominator. They are excluded from the average and shown as a dash. Averaging them in as perfect scores would be the single easiest way to fake a good number here.",
    },
    {
        title: "A small corpus makes recall@k easy",
        body: "With few enough sources competing for k slots, retrieval can score highly without being discriminating. Read the recall figure against the corpus size in the provenance line, and treat a rising corpus with flat recall as the real result.",
    },
    {
        title: "Latency is measured from one machine, sequentially",
        body: "These are wall-clock figures from a developer laptop against a shared database, not production percentiles under concurrency. Useful for spotting a stage that got slower; not a capacity claim.",
    },
];

export default function EvalPage() {
    const { latest, previous, all } = loadHistory();

    if (!latest) {
        return (
            <main className="mx-auto w-full max-w-3xl px-6 py-14">
                <h1 className="font-heading text-2xl font-bold tracking-tight">Evaluation</h1>
                <div className="mt-6 rounded-xl border border-dashed p-6">
                    <p className="text-sm text-muted-foreground">
                        No eval runs have been committed yet. Produce one with:
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground">
                        npx tsx --tsconfig tsconfig.json scripts/bench-retrieve.ts --full --save
                    </pre>
                    <p className="mt-3 text-xs text-muted-foreground">
                        Then commit the file it writes to{" "}
                        <code className="font-mono">src/lib/eval/runs/</code>.
                    </p>
                </div>
            </main>
        );
    }

    const diff = diffRuns(latest, previous);
    const { summary, meta, generation } = latest;

    return (
        <main className="mx-auto w-full max-w-4xl space-y-10 px-6 py-14">
            {/* Header */}
            <header>
                <p className="font-mono text-[0.7rem] uppercase tracking-wider text-primary">
                    Evaluation
                </p>
                <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">
                    How well retrieval actually works
                </h1>
                <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
                    Every answer this product gives is drawn from a retrieved passage, so retrieval
                    is the ceiling on correctness — if the right rule doesn&apos;t come back,
                    nothing downstream can save the answer. This page is the measurement, run
                    against a fixed question set and committed to the repository so the numbers
                    move only when something real changes.
                </p>
                <div className="mt-5 border-t pt-4">
                    <RunProvenance run={latest} />
                </div>
            </header>

            <Warnings warnings={diff.warnings} />

            {/* Headline numbers */}
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricTile
                    label={`Recall@${meta.matchCount}`}
                    value={pct(summary.overall.recall)}
                    sub={`${summary.overall.total} covered questions`}
                    delta={diff.recall.overall}
                    higherIsBetter
                    format={deltaPp}
                />
                <MetricTile
                    label="Hard questions"
                    value={pct(summary.hard.recall)}
                    sub={`${summary.hard.total} adversarial`}
                    delta={diff.recall.hard}
                    higherIsBetter
                    format={deltaPp}
                />
                <MetricTile
                    label="Fully retrieved"
                    value={`${summary.overall.allHit}/${summary.overall.total}`}
                    sub="every expected source in top k"
                    delta={diff.allHit}
                    higherIsBetter
                    format={deltaCount}
                />
                <MetricTile
                    label="Refusals"
                    value={
                        generation
                            ? `${generation.refusals.refused}/${generation.refusals.total}`
                            : "—"
                    }
                    sub={
                        generation
                            ? "out-of-corpus questions declined"
                            : "not measured in this run"
                    }
                    warn={!generation}
                />
            </section>

            {/* Retrieval detail */}
            <section>
                <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                    Retrieval quality
                </p>
                <div className="space-y-5 rounded-xl border bg-card p-5">
                    <RecallBar
                        label={`Recall@${meta.matchCount}, all covered questions`}
                        recall={summary.overall.recall}
                        allHit={summary.overall.allHit}
                        total={summary.overall.total}
                        delta={diff.recall.overall}
                    />
                    <RecallBar
                        label="Typical questions"
                        recall={summary.easy.recall}
                        allHit={summary.easy.allHit}
                        total={summary.easy.total}
                        delta={diff.recall.easy}
                        indent
                    />
                    <RecallBar
                        label="Hard questions"
                        recall={summary.hard.recall}
                        allHit={summary.hard.allHit}
                        total={summary.hard.total}
                        delta={diff.recall.hard}
                        indent
                    />
                    <p className="max-w-[74ch] border-t pt-4 text-xs leading-relaxed text-muted-foreground">
                        Averaged per question, not per expected source — a question needing two
                        sources counts the same as one needing a single source, otherwise the
                        handful of two-source questions would quietly dominate the figure.{" "}
                        <span className="text-foreground">Hard</span> marks questions chosen to be
                        adversarial rather than typical: they share no vocabulary with the source
                        that answers them, span two sources, or sit next to a neighbour that could
                        plausibly be retrieved instead. Scoring them separately stops an easy
                        average from hiding a real weakness.
                    </p>
                </div>
            </section>

            <MissPanel diff={diff} />

            <RefusalPanel
                generation={generation}
                diff={diff}
                uncoveredTotal={meta.questions.uncovered}
                matchCount={meta.matchCount}
                alwaysFullK={summary.uncovered.alwaysFullK}
            />

            <LatencyTable diff={diff} />

            {/* The evidence behind every number above. */}
            <QuestionSet run={latest} />

            <RunHistory runs={all} />

            {/* Limits */}
            <section>
                <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                    What this does not measure
                </p>
                <div className="divide-y rounded-xl border bg-card">
                    {LIMITS.map((l) => (
                        <div key={l.title} className="p-5">
                            <p className="text-sm font-semibold text-foreground">{l.title}</p>
                            <p className="mt-1.5 max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                                {l.body}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Reproduce */}
            <section>
                <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                    Reproduce it
                </p>
                <div className="rounded-xl border bg-card p-5">
                    <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground">
                        npx tsx --tsconfig tsconfig.json scripts/bench-retrieve.ts --full --save
                    </pre>
                    <p className="mt-3 max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                        Scoring is a pure function over retrieved source titles, unit tested against
                        fixed inputs, and shared by the command line and this page — so the two
                        cannot disagree about the same run. The command writes a JSON artifact;
                        committing it is what publishes these numbers.
                    </p>
                </div>
            </section>
        </main>
    );
}

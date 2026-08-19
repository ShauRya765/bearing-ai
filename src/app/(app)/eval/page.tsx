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
import { deltaPp, pct } from "@/lib/eval/format";
import { loadHistory } from "@/lib/eval/runs-store";
import { rankPrecision } from "@/lib/eval/score";
import { Disclosure, MetricTile, RecallBar } from "@/components/eval/Metrics";
import { FaithfulnessPanel, MissPanel, RefusalPanel } from "@/components/eval/Findings";
import {
    AnswerRelevancePanel,
    ContextPrecisionPanel,
    CorrectnessPanel,
} from "@/components/eval/Judged";
import { QuestionSet } from "@/components/eval/QuestionSet";
import { LatencyTable, RunHistory, RunProvenance, Warnings } from "@/components/eval/Runs";

// What the numbers above cannot tell you. Written down because every one of these
// is a question an informed reader will ask, and answering them on the page is
// cheaper than being caught by them.
const LIMITS: { title: string; body: string }[] = [
    {
        title: "The eval set was written by the same person as the corpus",
        body: "The sharpest bias here. Questions are worded the way a user would ask rather than in the source's vocabulary, and adversarial ones are marked hard and scored separately — but a set authored alongside the corpus cannot discover a topic its author never thought of. Production questions are the correction, and they are not on this page yet.",
    },
    {
        title: "Every graded metric is one model's opinion of another's",
        body: "Faithfulness is graded by Gemini on answers written by Gemini — a system partly marking its own work, where a shared blind spot passes unnoticed. Context precision, answer relevance and correctness are graded by Claude, so a mistake has to survive two model families; that is stronger, and still well short of a human audit. Every judge model is recorded per run and a change to any of them raises a warning above, because a delta across two judges measures the judges.",
    },
    {
        title: "Undefined metrics are dashes, never zeros",
        body: "Out-of-corpus questions have no expected source, so recall over them is a fraction with no denominator; they are excluded rather than counted as perfect, which would be the easiest way to fake a good number here. The same rule holds throughout: a judge that failed, a metric never run, and a metric that ran and found nothing are three different states and stay distinguishable.",
    },
    {
        title: "Labels are a floor, not the truth",
        body: "Rank precision credits a chunk only if the question's expected list names it, so a genuinely useful neighbouring card is scored as noise — read it against the judged context precision beside it. Correctness relies on gold facts read from canada.ca on a stated date, and IRCC edits those pages. Both are comparable run-to-run only while the labels are unchanged, and a changed set raises a warning.",
    },
    {
        title: "A small corpus makes recall@k easy",
        body: "With few enough sources competing for k slots, retrieval can score highly without being discriminating. Read recall against the corpus size in the provenance line, and treat a rising corpus with flat recall as the real result. The corpus went from 16 sources to 62 on 2026-08-15 for exactly this reason: at 16 and k=5, nearly a third of it came back for every query.",
    },
    {
        title: "Latency is measured from one machine, sequentially",
        body: "Wall-clock figures from a developer laptop against a shared database, not production percentiles under concurrency. Useful for spotting a stage that got slower; not a capacity claim.",
    },
];

export default function EvalPage() {
    const { latest, previous, all } = loadHistory();

    if (!latest) {
        return (
            <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
                <h1 className="font-heading text-2xl font-bold tracking-tight">Evaluation</h1>
                <div className="mt-6 rounded-xl border border-dashed p-6">
                    <p className="text-sm text-muted-foreground">
                        No eval runs have been committed yet. Produce one with:
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground">
                        npx tsx --tsconfig tsconfig.json scripts/bench-retrieve.ts --full --judge --save
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
        <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-10 sm:space-y-10 sm:px-6 sm:py-14">
            {/* Header */}
            <header>
                <p className="font-mono text-[0.7rem] uppercase tracking-wider text-primary">
                    Evaluation
                </p>
                <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
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

            {/* Eight tiles, two rows: retrieval, then answers. Wrapped in one
                section so the row gap matches the tile gap — as two sections they
                inherited the page rhythm and read as two unrelated groups. One number per
                metric — the supporting counts (fully retrieved, clean answers,
                judge failures) live in the panel that explains them, where they
                were already being repeated. */}
            <section className="space-y-3">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricTile
                    label={`Recall@${meta.matchCount}`}
                    value={pct(summary.overall.recall)}
                    sub={`${summary.overall.allHit}/${summary.overall.total} fully retrieved`}
                    delta={diff.recall.overall}
                    higherIsBetter
                    format={deltaPp}
                />
                <MetricTile
                    label="Rank precision"
                    value={pct(summary.rankPrecision.overall)}
                    sub="how highly the right source ranked"
                    delta={diff.rankPrecision.overall}
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
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricTile
                    label="Context precision"
                    value={
                        generation?.contextPrecision
                            ? pct(generation.contextPrecision.score)
                            : "—"
                    }
                    sub={
                        generation?.contextPrecision
                            ? "retrieved chunks judged relevant"
                            : "not measured in this run"
                    }
                    delta={diff.contextPrecision ?? undefined}
                    higherIsBetter
                    format={deltaPp}
                    warn={!generation?.contextPrecision}
                />
                <MetricTile
                    label="Faithfulness"
                    value={
                        generation?.faithfulness ? pct(generation.faithfulness.score) : "—"
                    }
                    sub={
                        generation?.faithfulness
                            ? `claims supported, ${generation.faithfulness.judged} answers judged`
                            : "not measured in this run"
                    }
                    delta={diff.faithfulness ?? undefined}
                    higherIsBetter
                    format={deltaPp}
                    warn={!generation?.faithfulness}
                />
                <MetricTile
                    label="Answer relevance"
                    value={
                        generation?.answerRelevance
                            ? pct(generation.answerRelevance.score)
                            : "—"
                    }
                    sub={
                        generation?.answerRelevance
                            ? `${generation.answerRelevance.judged} answers scored`
                            : "not measured in this run"
                    }
                    delta={diff.answerRelevance ?? undefined}
                    higherIsBetter
                    format={deltaPp}
                    warn={!generation?.answerRelevance}
                />
                <MetricTile
                    label="Correctness"
                    value={
                        generation?.correctness ? pct(generation.correctness.score) : "—"
                    }
                    sub={
                        generation?.correctness
                            ? `${generation.correctness.gold} gold-labelled of ${generation.correctness.covered} covered`
                            : "not measured in this run"
                    }
                    delta={diff.correctness ?? undefined}
                    higherIsBetter
                    format={deltaPp}
                    warn={!generation?.correctness}
                />
                </div>
            </section>

            {/* Retrieval detail */}
            <section>
                <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                    Retrieval quality
                </p>
                <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-5">
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
                    <div className="space-y-5 border-t pt-5">
                        <RecallBar
                            label="Rank precision, all covered questions"
                            recall={summary.rankPrecision.overall}
                            allHit={summary.overall.allHit}
                            total={summary.overall.total}
                            delta={diff.rankPrecision.overall}
                            caption="mean average precision — where in the top k the expected sources landed"
                        />
                        <RecallBar
                            label="Typical questions"
                            recall={summary.rankPrecision.easy}
                            allHit={summary.easy.allHit}
                            total={summary.easy.total}
                            delta={diff.rankPrecision.easy}
                            caption="&nbsp;"
                            indent
                        />
                        <RecallBar
                            label="Hard questions"
                            recall={summary.rankPrecision.hard}
                            allHit={summary.hard.allHit}
                            total={summary.hard.total}
                            delta={diff.rankPrecision.hard}
                            caption="&nbsp;"
                            indent
                        />
                    </div>
                    <p className="max-w-[74ch] border-t pt-4 text-xs leading-relaxed text-muted-foreground">
                        Recall asks whether the right card came back at all; rank precision asks
                        where it landed —{" "}
                        <span className="text-foreground">
                            {
                                latest.scores.filter(
                                    (s) => s.complete && rankPrecision(s) < 0.5,
                                ).length
                            }{" "}
                            questions here scored full recall while ranking in the bottom half
                        </span>
                        . Rank 1 scores 1.0, rank 5 scores 0.2, never found scores 0; dividing by
                        sources expected rather than sources found keeps it bounded by recall.
                        Both average per question, so the few two-source questions can&apos;t
                        dominate.{" "}
                        <span className="text-foreground">Hard</span> questions share no
                        vocabulary with their source, span two sources, or sit beside a plausible
                        decoy — scored separately so an easy average can&apos;t hide a weakness.
                    </p>
                </div>
            </section>

            <MissPanel diff={diff} />

            <ContextPrecisionPanel generation={generation} diff={diff} />

            <FaithfulnessPanel generation={generation} diff={diff} />

            <AnswerRelevancePanel generation={generation} diff={diff} />

            <CorrectnessPanel generation={generation} diff={diff} />

            <RefusalPanel
                generation={generation}
                diff={diff}
                uncoveredTotal={meta.questions.uncovered}
                matchCount={meta.matchCount}
                alwaysFullK={summary.uncovered.alwaysFullK}
            />

            <LatencyTable diff={diff} />

            {/* The evidence behind the numbers, and the caveats on them. All
                collapsed: this is material for checking a figure, not a thing
                to read top to bottom — and burying it in the scroll was how the
                page stopped being readable. */}
            <section className="space-y-2">
                <Disclosure
                    label="What this does not measure"
                    count={LIMITS.length}
                >
                    <div className="divide-y">
                        {LIMITS.map((l) => (
                            <div key={l.title} className="py-3 first:pt-0 last:pb-0">
                                <p className="text-sm font-semibold text-foreground">
                                    {l.title}
                                </p>
                                <p className="mt-1.5 max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                                    {l.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </Disclosure>

                <Disclosure
                    label="Every question, and how it did"
                    count={latest.scores.length}
                >
                    <QuestionSet run={latest} />
                </Disclosure>

                {all.length > 1 && (
                    <Disclosure label="Run history" count={all.length}>
                        <RunHistory runs={all} />
                    </Disclosure>
                )}
            </section>

            {/* Reproduce */}
            <section>
                <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">
                    Reproduce it
                </p>
                <div className="rounded-xl border bg-card p-4 sm:p-5">
                    <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground">
                        npx tsx --tsconfig tsconfig.json scripts/bench-retrieve.ts --full --judge --save
                    </pre>
                    <p className="mt-3 max-w-[74ch] text-xs leading-relaxed text-muted-foreground">
                        Every score is a pure function — unit tested against fixed inputs and
                        shared by the command line and this page, so the two cannot disagree about
                        one run. That holds for the judged metrics too: prompt, parsing and
                        arithmetic are pure and tested, and only the model call touches the
                        network. The command writes a JSON artifact; committing it is what
                        publishes these numbers.
                    </p>
                </div>
            </section>
        </main>
    );
}

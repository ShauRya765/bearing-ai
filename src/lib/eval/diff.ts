// Compares two saved eval runs.
//
// A dashboard that only shows the current number can tell you where you stand
// but never whether you're improving, which is the question you actually have.
// This module answers it — and, more importantly, tells you when it CAN'T.
//
// The trap it exists to avoid: recall is a fraction over a question set, so it
// moves when the SET changes, not only when the retriever changes. Add four easy
// questions and recall rises; add four adversarial ones and it falls. Either way
// the retriever is untouched. Reporting that as a delta manufactures a
// regression or hides one.
//
// So two things happen here. Comparability is checked explicitly and reported as
// human-readable warnings, and the per-question diff runs over the INTERSECTION
// of the two runs' questions — a question that didn't exist in the previous run
// is neither a new failure nor a fix, and gets its own bucket.

import type { EvalRun } from "@/lib/eval/run";
import type { QuestionScore } from "@/lib/eval/score";

export interface MetricDelta {
  /** May be NaN — an undefined metric, per score.ts. */
  current: number;
  /** Null when there is no previous run to compare against. */
  previous: number | null;
  /**
   * current − previous. Null when there's no previous run, or when either side
   * is NaN: a delta computed from an undefined metric is not a small delta, it's
   * no delta, and rendering it as 0.0 would read as "no change".
   */
  delta: number | null;
}

function metricDelta(current: number, previous: number | null): MetricDelta {
  if (previous === null || Number.isNaN(current) || Number.isNaN(previous)) {
    return { current, previous, delta: null };
  }
  return { current, previous, delta: current - previous };
}

export interface RunDiff {
  current: EvalRun;
  previous: EvalRun | null;

  recall: { overall: MetricDelta; easy: MetricDelta; hard: MetricDelta };
  allHit: MetricDelta;
  latency: {
    embedP50: MetricDelta;
    embedP95: MetricDelta;
    searchP50: MetricDelta;
    searchP95: MetricDelta;
  };
  /** Out-of-corpus questions correctly declined. Null on a retrieval-only run. */
  refusalRate: MetricDelta | null;

  /** Passed before, fails now. The list to look at first. */
  newMisses: QuestionScore[];
  /** Failed before, passes now. */
  fixedMisses: QuestionScore[];
  /** Failed in both runs — a known weakness, not news. */
  persistentMisses: QuestionScore[];
  /** Failing questions that the previous run never asked. Excluded from the three above. */
  untrackedMisses: QuestionScore[];

  questionSet: { added: string[]; removed: string[] };
  /**
   * Empty means the two runs are directly comparable. Each entry names one
   * reason a delta below may reflect a changed measurement rather than a changed
   * system. Non-empty does not mean "hide the numbers" — it means label them.
   */
  warnings: string[];
}

function refusalRate(run: EvalRun): number | null {
  const g = run.generation;
  if (!g || g.refusals.total === 0) return null;
  return g.refusals.refused / g.refusals.total;
}

function comparabilityWarnings(
  current: EvalRun,
  previous: EvalRun,
  added: string[],
  removed: string[],
): string[] {
  const w: string[] = [];
  const a = current.meta;
  const b = previous.meta;

  if (a.embeddingModel !== b.embeddingModel) {
    w.push(
      `Embedding model changed (${b.embeddingModel} → ${a.embeddingModel}). ` +
        `Recall across two embedding models is not a comparison.`,
    );
  }
  if (a.matchCount !== b.matchCount) {
    w.push(
      `k changed (${b.matchCount} → ${a.matchCount}). Recall@${a.matchCount} ` +
        `is mechanically higher than recall@${b.matchCount} — more chunks, more chances to hit.`,
    );
  }
  if (a.corpus.chunks !== b.corpus.chunks) {
    w.push(
      `Corpus changed (${b.corpus.chunks} → ${a.corpus.chunks} chunks). ` +
        `New chunks compete for the same k slots.`,
    );
  }
  if (added.length || removed.length) {
    const parts = [
      added.length ? `${added.length} added` : null,
      removed.length ? `${removed.length} removed` : null,
    ].filter(Boolean);
    w.push(
      `Question set changed (${parts.join(", ")}). Set-level deltas move with ` +
        `the set, not only with the retriever.`,
    );
  }
  if (current.generation && !previous.generation) {
    w.push(`Previous run was retrieval-only, so it has no latency or refusal figures.`);
  }
  return w;
}

export function diffRuns(current: EvalRun, previous: EvalRun | null): RunDiff {
  const prevByQuestion = new Map(
    (previous?.scores ?? []).map((s) => [s.question, s]),
  );
  const currentQuestions = new Set(current.scores.map((s) => s.question));

  const added = previous
    ? current.scores
        .filter((s) => !prevByQuestion.has(s.question))
        .map((s) => s.question)
    : [];
  const removed = previous
    ? previous.scores
        .filter((s) => !currentQuestions.has(s.question))
        .map((s) => s.question)
    : [];

  // Only covered questions can pass or fail. `complete` is false for
  // out-of-corpus rows by construction, so including them would report every
  // refusal question as a permanent miss.
  const covered = current.scores.filter((s) => s.covered);

  const newMisses: QuestionScore[] = [];
  const fixedMisses: QuestionScore[] = [];
  const persistentMisses: QuestionScore[] = [];
  const untrackedMisses: QuestionScore[] = [];

  for (const score of covered) {
    const before = prevByQuestion.get(score.question);
    if (!before || !before.covered) {
      if (!score.complete) untrackedMisses.push(score);
      continue;
    }
    if (!score.complete && before.complete) newMisses.push(score);
    else if (score.complete && !before.complete) fixedMisses.push(score);
    else if (!score.complete && !before.complete) persistentMisses.push(score);
  }

  const pick = <T>(get: (r: EvalRun) => T) =>
    previous ? get(previous) : null;

  return {
    current,
    previous,
    recall: {
      overall: metricDelta(
        current.summary.overall.recall,
        pick((r) => r.summary.overall.recall),
      ),
      easy: metricDelta(
        current.summary.easy.recall,
        pick((r) => r.summary.easy.recall),
      ),
      hard: metricDelta(
        current.summary.hard.recall,
        pick((r) => r.summary.hard.recall),
      ),
    },
    allHit: metricDelta(
      current.summary.overall.allHit,
      pick((r) => r.summary.overall.allHit),
    ),
    latency: {
      embedP50: metricDelta(
        current.summary.latency.embedP50,
        pick((r) => r.summary.latency.embedP50),
      ),
      embedP95: metricDelta(
        current.summary.latency.embedP95,
        pick((r) => r.summary.latency.embedP95),
      ),
      searchP50: metricDelta(
        current.summary.latency.searchP50,
        pick((r) => r.summary.latency.searchP50),
      ),
      searchP95: metricDelta(
        current.summary.latency.searchP95,
        pick((r) => r.summary.latency.searchP95),
      ),
    },
    refusalRate: (() => {
      const rate = refusalRate(current);
      if (rate === null) return null;
      return metricDelta(rate, previous ? refusalRate(previous) : null);
    })(),
    newMisses,
    fixedMisses,
    persistentMisses,
    untrackedMisses,
    questionSet: { added, removed },
    warnings: previous
      ? comparabilityWarnings(current, previous, added, removed)
      : [],
  };
}

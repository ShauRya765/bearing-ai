import test from "node:test";
import assert from "node:assert/strict";
import { diffRuns } from "@/lib/eval/diff";
import { RUN_SCHEMA_VERSION, type EvalRun, type GenerationResult } from "@/lib/eval/run";
import { scoreQuestion, summarise, type QuestionScore } from "@/lib/eval/score";

/** One question's outcome, stated as pass/fail rather than as retrieved titles. */
function q(question: string, pass: boolean, hard = false): QuestionScore {
  return scoreQuestion(
    { q: question, expect: ["Target"], hard },
    {
      titles: pass ? ["Target"] : ["Something else"],
      chunksUsed: 5,
      embedMs: 40,
      searchMs: 12,
    },
  );
}

function outOfCorpus(question: string): QuestionScore {
  return scoreQuestion(
    { q: question, expect: [] },
    { titles: ["Anything"], chunksUsed: 5, embedMs: 40, searchMs: 12 },
  );
}

function run(scores: QuestionScore[], over: Partial<EvalRun> = {}): EvalRun {
  return {
    meta: {
      schema: RUN_SCHEMA_VERSION,
      startedAt: "2026-08-13T09:12:04Z",
      gitSha: null,
      embeddingModel: "gemini-embedding-001",
      generationModel: null,
      matchCount: 5,
      corpus: { chunks: 120, sources: 16 },
      questions: {
        total: scores.length,
        covered: scores.filter((s) => s.covered).length,
        hard: scores.filter((s) => s.hard).length,
        uncovered: scores.filter((s) => !s.covered).length,
      },
      ...over.meta,
    },
    summary: summarise(scores, [{ embedMs: 40, searchMs: 12 }], 5, []),
    scores,
    generation: null,
    ...over,
  };
}

test("with no previous run every delta is null, not zero", () => {
  const diff = diffRuns(run([q("a", true), q("b", false)]), null);
  assert.equal(diff.recall.overall.current, 0.5);
  assert.equal(diff.recall.overall.previous, null);
  assert.equal(diff.recall.overall.delta, null);
  assert.deepEqual(diff.warnings, []);
});

test("misses are bucketed by what changed, not just listed", () => {
  const previous = run([q("regressed", true), q("fixed", false), q("stuck", false)]);
  const current = run([q("regressed", false), q("fixed", true), q("stuck", false)]);
  const diff = diffRuns(current, previous);

  assert.deepEqual(diff.newMisses.map((m) => m.question), ["regressed"]);
  assert.deepEqual(diff.fixedMisses.map((m) => m.question), ["fixed"]);
  assert.deepEqual(diff.persistentMisses.map((m) => m.question), ["stuck"]);
  assert.deepEqual(diff.untrackedMisses, []);
});

test("a question the previous run never asked is untracked, not a new failure", () => {
  // Calling this a regression would mean every question you add to the eval set
  // and immediately fail reads as something you broke.
  const previous = run([q("old", true)]);
  const current = run([q("old", true), q("brand new", false)]);
  const diff = diffRuns(current, previous);

  assert.deepEqual(diff.newMisses, []);
  assert.deepEqual(diff.untrackedMisses.map((m) => m.question), ["brand new"]);
  assert.deepEqual(diff.questionSet.added, ["brand new"]);
});

test("out-of-corpus questions never appear as misses", () => {
  // `complete` is false for them by construction, so a naive miss filter would
  // report every refusal question as a permanent retrieval failure.
  const previous = run([q("a", true), outOfCorpus("proof of funds?")]);
  const current = run([q("a", true), outOfCorpus("proof of funds?")]);
  const diff = diffRuns(current, previous);

  assert.deepEqual(diff.newMisses, []);
  assert.deepEqual(diff.persistentMisses, []);
  assert.deepEqual(diff.untrackedMisses, []);
});

test("a changed question set is flagged, because recall moves with the set", () => {
  const previous = run([q("a", true), q("b", false)]);
  const current = run([q("a", true), q("b", false), q("c", true), q("d", true)]);
  const diff = diffRuns(current, previous);

  // Recall went 50% → 75% while the retriever did not change at all.
  assert.equal(diff.recall.overall.previous, 0.5);
  assert.equal(diff.recall.overall.current, 0.75);
  assert.equal(diff.recall.overall.delta, 0.25);
  assert.ok(
    diff.warnings.some((w) => w.includes("Question set changed")),
    "an unlabelled +25% here would be a lie",
  );
});

test("a changed embedding model or k is flagged as incomparable", () => {
  const previous = run([q("a", true)]);
  const current = run([q("a", true)], {
    meta: { ...previous.meta, embeddingModel: "text-embedding-004", matchCount: 10 },
  });
  const diff = diffRuns(current, previous);

  assert.ok(diff.warnings.some((w) => w.includes("Embedding model changed")));
  assert.ok(diff.warnings.some((w) => w.includes("k changed")));
});

test("a delta against an undefined metric is null rather than a number", () => {
  // No hard questions in either run, so hard recall is NaN on both sides.
  // NaN - NaN is NaN, which would render as "—" if we were lucky and as
  // "NaN%" if we were not. Either way it is not a delta.
  const previous = run([q("a", true)]);
  const current = run([q("a", false)]);
  assert.ok(Number.isNaN(current.summary.hard.recall));
  assert.equal(diffRuns(current, previous).recall.hard.delta, null);
});

test("refusal rate is null on a retrieval-only run and a rate when generation ran", () => {
  const generation: GenerationResult = {
    reps: 1,
    latency: [],
    refusals: {
      total: 4,
      refused: 3,
      answered: [{ question: "leaked", excerpt: "You need $14,690..." }],
    },
  };
  const retrievalOnly = run([q("a", true)]);
  assert.equal(diffRuns(retrievalOnly, null).refusalRate, null);

  const withGeneration = run([q("a", true)], { generation });
  const diff = diffRuns(withGeneration, retrievalOnly);
  assert.equal(diff.refusalRate?.current, 0.75);
  // The previous run made no generation calls, so there is nothing to compare to.
  assert.equal(diff.refusalRate?.previous, null);
  assert.equal(diff.refusalRate?.delta, null);
  assert.ok(diff.warnings.some((w) => w.includes("retrieval-only")));
});

// --- faithfulness ----------------------------------------------------------

function judged(over: {
  score?: number;
  judgeModel?: string;
  generationModel?: string | null;
} = {}): EvalRun {
  const gen: GenerationResult = {
    reps: 1,
    latency: [],
    refusals: { total: 1, refused: 1, answered: [] },
    faithfulness: {
      judgeModel: over.judgeModel ?? "gemini-3.6-flash",
      score: over.score ?? 0.9,
      judged: 10,
      skippedRefusals: 1,
      failed: 0,
      clean: 8,
      unsupported: [],
    },
  };
  const r = run([q("a", true)], { generation: gen });
  if (over.generationModel !== undefined) r.meta.generationModel = over.generationModel;
  return r;
}

test("faithfulness is null when the current run did not judge", () => {
  const diff = diffRuns(run([q("a", true)]), judged());
  assert.equal(diff.faithfulness, null);
});

test("faithfulness deltas against a judged previous run", () => {
  const diff = diffRuns(judged({ score: 0.95 }), judged({ score: 0.9 }));
  assert.ok(diff.faithfulness);
  assert.ok(Math.abs(diff.faithfulness.delta! - 0.05) < 1e-9);
});

test("a NaN faithfulness score yields no delta, not a delta of zero", () => {
  const diff = diffRuns(judged({ score: NaN }), judged({ score: 0.9 }));
  assert.ok(diff.faithfulness);
  assert.equal(diff.faithfulness.delta, null);
  assert.ok(Number.isNaN(diff.faithfulness.current));
});

test("changing the judge warns that the delta measures the judges", () => {
  const diff = diffRuns(judged({ judgeModel: "other-judge" }), judged());
  assert.ok(diff.warnings.some((w) => /Judge model changed/.test(w)));
});

test("a first judged run warns that faithfulness has no baseline", () => {
  const diff = diffRuns(judged(), run([q("a", true)]));
  assert.ok(diff.warnings.some((w) => /not judged/.test(w)));
});

test("changing the generation model warns, since refusal and faithfulness are its properties", () => {
  const diff = diffRuns(
    judged({ generationModel: "model-b" }),
    judged({ generationModel: "model-a" }),
  );
  assert.ok(diff.warnings.some((w) => /Generation model changed/.test(w)));
});

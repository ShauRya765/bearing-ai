import test from "node:test";
import assert from "node:assert/strict";
import {
  RUN_SCHEMA_VERSION,
  RunParseError,
  parseRun,
  runFilename,
  serializeRun,
  type EvalRun,
} from "@/lib/eval/run";
import { scoreQuestion, summarise } from "@/lib/eval/score";

function run(over: Partial<EvalRun> = {}): EvalRun {
  const scores = [
    scoreQuestion(
      { q: "hit", expect: ["Provincial nomination"] },
      { titles: ["Provincial nomination"], chunksUsed: 5, embedMs: 40, searchMs: 12 },
    ),
    scoreQuestion(
      { q: "miss", expect: ["Skill transferability"], hard: true },
      { titles: ["Express Entry"], chunksUsed: 5, embedMs: 60, searchMs: 20 },
    ),
    scoreQuestion(
      { q: "out of corpus", expect: [] },
      { titles: ["Express Entry"], chunksUsed: 5, embedMs: 50, searchMs: 15 },
    ),
  ];

  return {
    meta: {
      schema: RUN_SCHEMA_VERSION,
      startedAt: "2026-08-13T09:12:04Z",
      gitSha: "e7ee70f",
      embeddingModel: "gemini-embedding-001",
      generationModel: null,
      matchCount: 5,
      corpus: { chunks: 120, sources: 16 },
      questions: { total: 3, covered: 2, hard: 1, uncovered: 1 },
    },
    summary: summarise(
      scores,
      scores.map(() => ({ embedMs: 40, searchMs: 12 })),
      5,
      [5],
    ),
    scores,
    generation: null,
    ...over,
  };
}

test("a run survives the JSON round trip unchanged", () => {
  const original = run();
  const restored = parseRun(serializeRun(original));

  assert.deepEqual(restored.meta, original.meta);
  assert.deepEqual(restored.scores, original.scores);
  assert.equal(restored.summary.overall.recall, original.summary.overall.recall);
});

test("NaN survives serialization — it does not come back as 0", () => {
  // The out-of-corpus question's recall is NaN, and so is the `hard` set's
  // recall in a run with no hard questions. JSON.stringify turns NaN into null,
  // and a null read as a number is 0 — which would render as a confident "0.0%"
  // and, worse, produce a delta against the previous run. This is the single
  // most dangerous silent failure in the artifact format.
  const restored = parseRun(serializeRun(run()));

  const outOfCorpus = restored.scores.find((s) => s.question === "out of corpus");
  assert.ok(outOfCorpus);
  assert.ok(Number.isNaN(outOfCorpus.recall), "expected NaN, not 0");
  assert.equal(outOfCorpus.covered, false);

  // Raw JSON really does hold null — the guarantee is in the parse, not in the file.
  const raw = JSON.parse(serializeRun(run()));
  assert.equal(raw.scores[2].recall, null);
});

test("an empty hard set round-trips as NaN rather than a claim of zero recall", () => {
  const noHard = run();
  noHard.summary.hard = { recall: NaN, allHit: 0, total: 0 };
  const restored = parseRun(serializeRun(noHard));
  assert.ok(Number.isNaN(restored.summary.hard.recall));
  assert.equal(restored.summary.hard.total, 0);
});

test("the miss list is rebuilt from the per-question scores, never read from the file", () => {
  // Writing `misses` into the artifact would let it drift out of agreement with
  // `scores` — two representations of one fact. parseRun derives it instead.
  const text = serializeRun(run());
  assert.ok(!("misses" in JSON.parse(text).summary), "misses must not be persisted");

  const restored = parseRun(text);
  assert.deepEqual(restored.summary.misses.map((m) => m.question), ["miss"]);
});

test("a run from an incompatible schema is refused, not partially rendered", () => {
  const text = serializeRun(run()).replace(
    `"schema": ${RUN_SCHEMA_VERSION}`,
    `"schema": ${RUN_SCHEMA_VERSION + 1}`,
  );
  assert.throws(() => parseRun(text, "future.json"), RunParseError);
  assert.throws(() => parseRun("{ not json", "broken.json"), RunParseError);
});

test("filenames sort chronologically as plain strings", () => {
  const names = [
    runFilename("2026-08-13T09:12:04.512Z"),
    runFilename("2026-08-02T11:22:00.000Z"),
    runFilename("2026-08-09T17:40:31.900Z"),
  ];
  assert.deepEqual([...names].sort(), [
    "2026-08-02T11-22-00Z.json",
    "2026-08-09T17-40-31Z.json",
    "2026-08-13T09-12-04Z.json",
  ]);
  // No colons: they are illegal in filenames on Windows and awkward everywhere.
  assert.ok(names.every((n) => !n.includes(":")));
});

// --- faithfulness ----------------------------------------------------------

function withGeneration(over: Partial<NonNullable<EvalRun["generation"]>> = {}) {
  return run({
    generation: {
      reps: 1,
      latency: [],
      refusals: { total: 1, refused: 1, answered: [] },
      ...over,
    },
  });
}

test("a faithfulness result round-trips, including the unsupported claims", () => {
  const original = withGeneration({
    faithfulness: {
      judgeModel: "gemini-3.6-flash",
      score: 0.875,
      judged: 8,
      skippedRefusals: 2,
      failed: 1,
      clean: 6,
      unsupported: [{ question: "q", claim: "50 points", note: "source says 25" }],
    },
  });

  const restored = parseRun(serializeRun(original));
  assert.deepEqual(restored.generation?.faithfulness, original.generation?.faithfulness);
});

test("a NaN faithfulness score does not come back as a confident 0%", () => {
  // Every judge call failing must read as "not measured", never as "0% of claims
  // were supported" — which would be the most alarming possible false alarm.
  const original = withGeneration({
    faithfulness: {
      judgeModel: "gemini-3.6-flash",
      score: NaN,
      judged: 0,
      skippedRefusals: 0,
      failed: 12,
      clean: 0,
      unsupported: [],
    },
  });

  const json = JSON.parse(serializeRun(original));
  assert.equal(json.generation.faithfulness.score, null); // null on the wire

  const restored = parseRun(serializeRun(original));
  assert.ok(Number.isNaN(restored.generation!.faithfulness!.score));
});

test("a generation block with no faithfulness field stays absent, not null", () => {
  // This is what every run committed before judging existed looks like. It must
  // keep parsing, and it must be distinguishable from "judged and got nothing".
  const original = withGeneration();
  const restored = parseRun(serializeRun(original));

  assert.equal(restored.generation?.faithfulness, undefined);
  assert.ok(!("faithfulness" in JSON.parse(serializeRun(original)).generation));
});

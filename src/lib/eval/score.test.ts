import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreQuestion,
  scoreSet,
  summarise,
  percentile,
  rankPrecision,
  rankPrecisionSet,
} from "@/lib/eval/score";
import type { EvalQuestion } from "@/lib/eval/questions";
import { EVAL_QUESTIONS, COVERED, UNCOVERED, HARD, GOLD_QUESTIONS } from "@/lib/eval/questions";

function retrieval(titles: string[], chunksUsed = titles.length) {
  return { titles, chunksUsed, embedMs: 10, searchMs: 5 };
}

const q = (over: Partial<EvalQuestion> = {}): EvalQuestion => ({
  q: "does a nomination help?",
  expect: ["Provincial nomination"],
  ...over,
});

test("a question that retrieved its one expected source scores 1", () => {
  const s = scoreQuestion(q(), retrieval(["Provincial nomination", "Express Entry"]));
  assert.equal(s.recall, 1);
  assert.equal(s.complete, true);
  assert.deepEqual(s.missing, []);
});

test("a question that retrieved none of its sources scores 0", () => {
  const s = scoreQuestion(q(), retrieval(["Express Entry", "Skill transferability"]));
  assert.equal(s.recall, 0);
  assert.equal(s.complete, false);
  assert.deepEqual(s.missing, ["Provincial nomination"]);
});

test("partial credit when only some expected sources come back", () => {
  const item = q({ expect: ["CLB 7 in all abilities", "First official language points"] });
  const s = scoreQuestion(item, retrieval(["CLB 7 in all abilities", "Express Entry"]));
  assert.equal(s.recall, 0.5);
  assert.equal(s.complete, false);
  assert.deepEqual(s.hit, ["CLB 7 in all abilities"]);
});

test("out-of-corpus questions score NaN, not 1 — and never inflate the average", () => {
  const outOfCorpus = scoreQuestion(q({ expect: [] }), retrieval(["Express Entry"]));
  assert.equal(outOfCorpus.covered, false);
  assert.ok(Number.isNaN(outOfCorpus.recall));
  assert.equal(outOfCorpus.complete, false);

  const perfect = scoreQuestion(q(), retrieval(["Provincial nomination"]));
  const missed = scoreQuestion(q(), retrieval(["Express Entry"]));
  // Two covered questions, one hit one miss = 50%. The out-of-corpus row is
  // excluded entirely rather than counted as a third success.
  const set = scoreSet([perfect, missed, outOfCorpus]);
  assert.equal(set.recall, 0.5);
  assert.equal(set.total, 2);
  assert.equal(set.allHit, 1);
});

test("recall averages per question, not per expected source", () => {
  const oneSource = scoreQuestion(q(), retrieval(["Provincial nomination"])); // 1.0
  const twoSource = scoreQuestion(
    q({ expect: ["A", "B"] }),
    retrieval(["A"]),
  ); // 0.5
  // Per-question mean is 0.75. Per-source it would be 2/3 — the two-source
  // question would carry more weight, which is the bug this guards.
  assert.equal(scoreSet([oneSource, twoSource]).recall, 0.75);
});

test("an empty set is NaN rather than a misleading zero or one", () => {
  const set = scoreSet([]);
  assert.ok(Number.isNaN(set.recall));
  assert.equal(set.total, 0);
});

test("summarise splits easy from hard and lists only the misses", () => {
  const scores = [
    scoreQuestion(q({ q: "easy hit" }), retrieval(["Provincial nomination"])),
    scoreQuestion(q({ q: "easy miss" }), retrieval(["Express Entry"])),
    scoreQuestion(q({ q: "hard hit", hard: true }), retrieval(["Provincial nomination"])),
    scoreQuestion(q({ q: "out", expect: [] }), retrieval(["Express Entry"])),
  ];
  const summary = summarise(scores, [{ embedMs: 10, searchMs: 5 }], 5, [5]);

  assert.equal(summary.overall.total, 3);
  assert.equal(summary.easy.total, 2);
  assert.equal(summary.easy.recall, 0.5);
  assert.equal(summary.hard.total, 1);
  assert.equal(summary.hard.recall, 1);
  assert.equal(summary.uncovered.total, 1);
  assert.deepEqual(summary.misses.map((m) => m.question), ["easy miss"]);
});

test("alwaysFullK flags that no similarity floor is being applied", () => {
  const scores = [scoreQuestion(q({ expect: [] }), retrieval([], 5))];
  assert.equal(summarise(scores, [], 5, [5, 5, 5]).uncovered.alwaysFullK, true);
  assert.equal(summarise(scores, [], 5, [5, 3, 5]).uncovered.alwaysFullK, false);
  // No out-of-corpus questions ran at all — don't claim the property either way.
  assert.equal(summarise(scores, [], 5, []).uncovered.alwaysFullK, false);
});

test("rank precision rewards ranking the expected source first", () => {
  const first = scoreQuestion(q(), retrieval(["Provincial nomination", "A", "B", "C", "D"]));
  const last = scoreQuestion(q(), retrieval(["A", "B", "C", "D", "Provincial nomination"]));

  // recall@5 cannot tell these two apart — both found the source.
  assert.equal(first.recall, 1);
  assert.equal(last.recall, 1);

  // Rank precision can: 1/1 vs 1/5.
  assert.equal(rankPrecision(first), 1);
  assert.equal(rankPrecision(last), 0.2);
});

test("rank precision is bounded above by recall, so a miss can't score well", () => {
  // Two expected, one retrieved at rank 1. A found-only denominator would call
  // this perfect ranking; averaging over both expected sources reports 0.5.
  const item = q({ expect: ["A", "B"] });
  const s = scoreQuestion(item, retrieval(["A", "x", "y"]));
  assert.equal(s.recall, 0.5);
  assert.equal(rankPrecision(s), 0.5);

  // Both found, consecutively at the top: precision@1 = 1, precision@2 = 1.
  const both = scoreQuestion(item, retrieval(["A", "B", "x"]));
  assert.equal(rankPrecision(both), 1);

  // Both found but interleaved with a decoy: 1/1 and 2/3.
  const split = scoreQuestion(item, retrieval(["A", "x", "B"]));
  assert.equal(rankPrecision(split), (1 + 2 / 3) / 2);
});

test("rank precision is 0 when nothing expected came back, NaN when nothing was expected", () => {
  assert.equal(rankPrecision(scoreQuestion(q(), retrieval(["x", "y"]))), 0);
  // Out-of-corpus: no expected source means no ranking to be right about.
  assert.ok(Number.isNaN(rankPrecision(scoreQuestion(q({ expect: [] }), retrieval(["x"])))));
});

test("rank precision excludes out-of-corpus questions from the average", () => {
  const scores = [
    scoreQuestion(q({ q: "top" }), retrieval(["Provincial nomination", "x"])), // 1.0
    scoreQuestion(q({ q: "third" }), retrieval(["x", "y", "Provincial nomination"])), // 1/3
    scoreQuestion(q({ q: "out", expect: [] }), retrieval(["x"])), // NaN, excluded
  ];
  // Mean of the two covered rows. A NaN leaking in would poison the whole
  // average, which is exactly how this metric would fail loudly rather than
  // quietly — but it must not happen.
  assert.equal(rankPrecisionSet(scores), (1 + 1 / 3) / 2);
  assert.ok(Number.isNaN(rankPrecisionSet([])));
});

test("summarise splits rank precision easy from hard, like recall", () => {
  const scores = [
    scoreQuestion(q({ q: "easy" }), retrieval(["Provincial nomination", "x"])),
    scoreQuestion(q({ q: "hard", hard: true }), retrieval(["x", "Provincial nomination"])),
    scoreQuestion(q({ q: "out", expect: [] }), retrieval(["x"])),
  ];
  const { rankPrecision: rp } = summarise(scores, [{ embedMs: 1, searchMs: 1 }], 5, [5]);
  assert.equal(rp.easy, 1);
  assert.equal(rp.hard, 0.5);
  assert.equal(rp.overall, 0.75);
});

test("percentile is nearest-rank, no interpolation", () => {
  const values = [10, 20, 30, 40];
  assert.equal(percentile(values, 50), 20);
  assert.equal(percentile(values, 95), 40);
  assert.equal(percentile([7], 50), 7);
  assert.ok(Number.isNaN(percentile([], 50)));
});

test("the eval set's own partitions stay consistent", () => {
  assert.equal(COVERED.length + UNCOVERED.length, EVAL_QUESTIONS.length);
  assert.ok(HARD.every((h) => h.expect.length > 0), "hard questions must be covered");
  assert.ok(COVERED.length > 0 && UNCOVERED.length > 0);
});

test("every gold record is covered, cited, dated and non-empty", () => {
  assert.ok(GOLD_QUESTIONS.length > 0, "the gold subset must not be empty");

  for (const q of GOLD_QUESTIONS) {
    const gold = q.gold!;

    // A gold record on an out-of-corpus question would grade the system on
    // facts it is supposed to refuse to discuss.
    assert.ok(q.expect.length > 0, `gold on an out-of-corpus question: "${q.q}"`);

    // No facts means checkFacts returns NaN and the judge has nothing to grade
    // — a labelling bug that would otherwise just quietly shrink the subset.
    assert.ok(gold.mustState.length > 0, `no required facts: "${q.q}"`);

    // The citation is the whole point. A correctness figure traceable to
    // nothing is a claim, not a measurement.
    assert.match(gold.source, /^https:\/\/(www\.canada\.ca|www\.ontario\.ca)\//, q.q);
    assert.match(gold.accessed, /^\d{4}-\d{2}-\d{2}$/, q.q);
  }
});

test("gold facts are not accidentally forbidden by their own record", () => {
  // mustState and mustNotState are checked by the same substring matcher, so a
  // required fact that contains a forbidden one would score every answer zero
  // no matter what it said.
  for (const q of GOLD_QUESTIONS) {
    for (const forbidden of q.gold!.mustNotState ?? []) {
      for (const required of q.gold!.mustState) {
        assert.ok(
          !required.toLowerCase().includes(forbidden.toLowerCase()),
          `"${q.q}": required fact "${required}" contains forbidden "${forbidden}"`,
        );
      }
    }
  }
});

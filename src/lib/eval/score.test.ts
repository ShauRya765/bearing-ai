import test from "node:test";
import assert from "node:assert/strict";
import { scoreQuestion, scoreSet, summarise, percentile } from "@/lib/eval/score";
import type { EvalQuestion } from "@/lib/eval/questions";
import { EVAL_QUESTIONS, COVERED, UNCOVERED, HARD } from "@/lib/eval/questions";

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

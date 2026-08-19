import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCorrectnessPrompt,
  checkFacts,
  correctness,
  CorrectnessParseError,
  judgeCorrectness,
  normalise,
  parseCorrectnessResponse,
  summariseCorrectness,
  type CorrectnessVerdict,
} from "@/lib/eval/correctness";
import type { GoldAnswer } from "@/lib/eval/questions";

const GOLD: GoldAnswer = {
  mustState: ["1,560 hours", "30 hours per week"],
  mustNotState: ["2,080 hours"],
  source: "https://www.canada.ca/example",
  accessed: "2026-08-15",
};

const verdict = (over: Partial<CorrectnessVerdict> = {}): CorrectnessVerdict => ({
  question: "q",
  facts: { stated: [], missing: [], contradicted: [], coverage: 1 },
  graded: [{ fact: "1,560 hours", stated: true, note: "" }],
  score: 1,
  wrong: false,
  error: null,
  ...over,
});

// --- deterministic fact checking -------------------------------------------

test("normalisation folds digit separators, dashes and spacing", () => {
  // In a corpus whose entire subject is numeric thresholds, treating "1,560"
  // and "1560" as different facts would make the check useless.
  assert.equal(normalise("1,560 Hours"), "1560 hours");
  assert.equal(normalise("CLB 7–and up"), "clb 7-and up");
  assert.equal(normalise("  a   b  "), "a b");
});

test("fact coverage finds gold facts regardless of formatting", () => {
  const check = checkFacts(
    "You need 1560 hours, which is 30 hours per week for a year.",
    GOLD,
  );
  assert.deepEqual(check.stated, ["1,560 hours", "30 hours per week"]);
  assert.deepEqual(check.missing, []);
  assert.equal(check.coverage, 1);
});

test("fact coverage is a lower bound — a paraphrase reads as missing", () => {
  // This is why the judged score exists. Coverage cannot see "thirty hours a
  // week", so publishing it alone would understate a correct answer.
  const check = checkFacts("You need thirty hours a week.", GOLD);
  assert.deepEqual(check.stated, []);
  assert.equal(check.coverage, 0);
});

test("a forbidden value in the answer is caught without a model", () => {
  const check = checkFacts("Full time means 2,080 hours a year.", GOLD);
  assert.deepEqual(check.contradicted, ["2,080 hours"]);
});

test("a gold record with no required facts is NaN, not a perfect score", () => {
  const empty = checkFacts("anything", { ...GOLD, mustState: [] });
  assert.ok(Number.isNaN(empty.coverage));
});

// --- prompt ----------------------------------------------------------------

test("the prompt supplies the gold facts and withholds the retrieved chunks", () => {
  // Grading against the retrieved passages is what faithfulness already does.
  // Repeating it here would produce a second faithfulness score wearing a
  // correctness label.
  const p = buildCorrectnessPrompt("how many hours?", "1,560.", GOLD);
  assert.match(p, /\[1\] 1,560 hours/);
  assert.match(p, /\[2\] 30 hours per week/);
  assert.match(p, /Forbidden claims:\n\[1\] 2,080 hours/);
  assert.doesNotMatch(p, /Sources:/);
});

test("the prompt tells the judge a paraphrase counts but a different value does not", () => {
  const p = buildCorrectnessPrompt("q", "a", GOLD);
  assert.match(p, /a paraphrase, a different unit of the same quantity/);
  assert.match(p, /does NOT count if the answer merely mentions the topic/);
});

test("a gold record with no forbidden claims still renders", () => {
  const p = buildCorrectnessPrompt("q", "a", { ...GOLD, mustNotState: undefined });
  assert.match(p, /Forbidden claims:\n\(none\)/);
});

// --- parsing ---------------------------------------------------------------

test("parses verdicts and pairs them to the gold facts in order", () => {
  const parsed = parseCorrectnessResponse(
    '{"facts":[{"index":2,"stated":false,"note":"absent"},' +
      '{"index":1,"stated":true,"note":"stated up front"}],"contradictions":[]}',
    GOLD,
  );
  assert.deepEqual(
    parsed.facts.map((f) => [f.fact, f.stated]),
    [
      ["1,560 hours", true],
      ["30 hours per week", false],
    ],
  );
});

test("contradiction indices resolve back to the forbidden claim text", () => {
  const parsed = parseCorrectnessResponse(
    '{"facts":[{"index":1,"stated":true,"note":""},{"index":2,"stated":true,"note":""}],' +
      '"contradictions":[1]}',
    GOLD,
  );
  assert.deepEqual(parsed.contradictions, ["2,080 hours"]);
});

test("an ungraded required fact throws rather than shrinking the denominator", () => {
  assert.throws(
    () =>
      parseCorrectnessResponse(
        '{"facts":[{"index":1,"stated":true,"note":""}],"contradictions":[]}',
        GOLD,
      ),
    CorrectnessParseError,
  );
});

test("malformed replies throw", () => {
  assert.throws(() => parseCorrectnessResponse("nope", GOLD), CorrectnessParseError);
  assert.throws(
    () => parseCorrectnessResponse('{"contradictions":[]}', GOLD),
    CorrectnessParseError,
  );
});

// --- scoring ---------------------------------------------------------------

test("correctness is stated over required, and any contradiction is a hard zero", () => {
  assert.equal(
    correctness({
      facts: [
        { fact: "a", stated: true, note: "" },
        { fact: "b", stated: false, note: "" },
      ],
      contradictions: [],
    }),
    0.5,
  );
  // Four right things and one wrong one is not 80% correct to someone about to
  // file on it. The cliff is the point.
  assert.equal(
    correctness({
      facts: [
        { fact: "a", stated: true, note: "" },
        { fact: "b", stated: true, note: "" },
      ],
      contradictions: ["2,080 hours"],
    }),
    0,
  );
  assert.ok(Number.isNaN(correctness({ facts: [], contradictions: [] })));
});

test("the summary keeps the gold subset's denominator visible", () => {
  // The metric must never speak for the whole question set.
  const s = summariseCorrectness(
    [verdict(), verdict({ question: "q2", score: 0.5 })],
    new Map(),
    "claude-opus-5",
    154,
  );
  assert.equal(s.judged, 2);
  assert.equal(s.gold, 2);
  assert.equal(s.covered, 154);
  assert.equal(s.score, 0.75);
});

test("a judge failure is NaN and excluded, never an incorrect answer", () => {
  const s = summariseCorrectness(
    [verdict(), verdict({ question: "broke", graded: null, score: NaN, error: "timeout" })],
    new Map(),
    "claude-opus-5",
    154,
  );
  assert.equal(s.score, 1);
  assert.equal(s.judged, 1);
  assert.equal(s.gold, 2);
  assert.equal(s.failed, 1);
});

test("a contradiction is reported even when the judge failed on that question", async () => {
  // The string check cannot fail, so a forbidden value that literally appears
  // in the answer is confirmed wrong with or without a grader. The score stays
  // NaN — but suppressing the finding because the judge timed out would hide
  // the strongest evidence this metric produces.
  const v = await judgeCorrectness({
    question: "hours",
    answer: "Full time means 2,080 hours a year.",
    gold: GOLD,
    generate: async () => {
      throw new Error("529 overloaded");
    },
  });
  assert.ok(Number.isNaN(v.score));

  const s = summariseCorrectness([v], new Map([["hours", GOLD.source]]), "j", 154);
  assert.equal(s.judged, 0);
  assert.equal(s.failed, 1);
  assert.deepEqual(
    s.contradictions.map((c) => c.fact),
    ["2,080 hours"],
  );
});

test("the summary carries the source URL for every finding", () => {
  // A correctness failure that can't be checked against its primary source is
  // an accusation, not a finding.
  const s = summariseCorrectness(
    [
      verdict({
        question: "hours",
        graded: [{ fact: "1,560 hours", stated: false, note: "said 2,080" }],
        score: 0,
      }),
    ],
    new Map([["hours", GOLD.source]]),
    "claude-opus-5",
    154,
  );
  assert.equal(s.missing[0].source, GOLD.source);
  assert.equal(s.missing[0].fact, "1,560 hours");
});

// --- the call --------------------------------------------------------------

test("judgeCorrectness merges the deterministic contradiction with the judge's", async () => {
  // A forbidden string that literally appears in the answer is a contradiction
  // whether or not the judge noticed it. The check the model cannot talk its way
  // out of is the one worth having.
  const v = await judgeCorrectness({
    question: "q",
    answer: "It is 2,080 hours.",
    gold: GOLD,
    generate: async () =>
      '{"facts":[{"index":1,"stated":true,"note":""},{"index":2,"stated":true,"note":""}],' +
      '"contradictions":[]}',
  });
  assert.equal(v.wrong, true);
  assert.equal(v.score, 0);
  assert.deepEqual(v.facts.contradicted, ["2,080 hours"]);
});

test("judgeCorrectness never throws, and keeps the deterministic check on failure", async () => {
  const v = await judgeCorrectness({
    question: "q",
    answer: "You need 1,560 hours.",
    gold: GOLD,
    generate: async () => {
      throw new Error("429 rate limited");
    },
  });
  assert.ok(Number.isNaN(v.score));
  assert.equal(v.graded, null);
  // Fact coverage cannot fail, so it survives a judge outage — the floor is
  // still reported when the reading isn't.
  assert.equal(v.facts.coverage, 0.5);
  assert.match(v.error!, /429/);
});

test("judgeCorrectness credits a paraphrase the string check missed", async () => {
  const v = await judgeCorrectness({
    question: "q",
    answer: "You need thirty hours a week for a year.",
    gold: GOLD,
    generate: async () =>
      '{"facts":[{"index":1,"stated":true,"note":"a year at 30h"},' +
      '{"index":2,"stated":true,"note":"thirty hours a week"}],"contradictions":[]}',
  });
  assert.equal(v.score, 1);
  assert.equal(v.facts.coverage, 0); // the floor; the judge saw past it
});

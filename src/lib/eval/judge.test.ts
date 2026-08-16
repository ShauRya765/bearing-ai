import test from "node:test";
import assert from "node:assert/strict";
import {
  buildJudgePrompt,
  faithfulness,
  judgeAnswer,
  JudgeParseError,
  parseJudgeResponse,
  summariseFaithfulness,
  type FaithfulnessVerdict,
  type JudgedClaim,
} from "@/lib/eval/judge";

const claim = (c: string, supported: boolean): JudgedClaim => ({
  claim: c,
  supported,
  note: "",
});

// --- prompt ----------------------------------------------------------------

test("the prompt numbers the contexts and carries the answer verbatim", () => {
  const p = buildJudgePrompt("How many points?", "You get 50 points [1].", [
    "first chunk",
    "second chunk",
  ]);
  assert.match(p, /\[1\]\nfirst chunk/);
  assert.match(p, /\[2\]\nsecond chunk/);
  assert.match(p, /You get 50 points \[1\]\./);
});

test("the prompt tells the judge that real-world truth is not the test", () => {
  // The single most common failure of an LLM judge here is grading correctness
  // instead of groundedness, which would silently turn this into a different
  // metric than the page claims.
  const p = buildJudgePrompt("q", "a", ["c"]);
  assert.match(p, /true in reality but absent from the sources is UNSUPPORTED/);
});

// --- parsing ---------------------------------------------------------------

test("parses a bare JSON object", () => {
  const claims = parseJudgeResponse(
    '{"claims":[{"claim":"50 points","supported":true,"note":"source 1"}]}',
  );
  assert.equal(claims.length, 1);
  assert.equal(claims[0].claim, "50 points");
  assert.equal(claims[0].supported, true);
});

test("parses through a markdown fence and surrounding chatter", () => {
  // Models add these despite being told not to. Failing here would show up as a
  // judge failure rate, which reads as a broken pipeline rather than a stray ```.
  const claims = parseJudgeResponse(
    'Sure!\n```json\n{"claims":[{"claim":"x","supported":false,"note":"not in sources"}]}\n```\nHope that helps.',
  );
  assert.equal(claims.length, 1);
  assert.equal(claims[0].supported, false);
  assert.equal(claims[0].note, "not in sources");
});

test("an empty claim list is valid, not an error", () => {
  assert.deepEqual(parseJudgeResponse('{"claims":[]}'), []);
});

test("a missing note defaults to empty rather than failing the claim", () => {
  const claims = parseJudgeResponse('{"claims":[{"claim":"x","supported":true}]}');
  assert.equal(claims[0].note, "");
});

test("a malformed claim throws instead of being dropped", () => {
  // Dropping it would RAISE faithfulness — a discarded claim can no longer be
  // unsupported — so the tolerant path must stop at the wrapper.
  assert.throws(
    () => parseJudgeResponse('{"claims":[{"claim":"x"},{"claim":"y","supported":true}]}'),
    JudgeParseError,
  );
});

test("non-JSON and missing claims array both throw", () => {
  assert.throws(() => parseJudgeResponse("I think it's mostly fine"), JudgeParseError);
  assert.throws(() => parseJudgeResponse('{"verdict":"good"}'), JudgeParseError);
});

// --- scoring ---------------------------------------------------------------

test("faithfulness is supported over total", () => {
  assert.equal(faithfulness([claim("a", true), claim("b", true)]), 1);
  assert.equal(faithfulness([claim("a", true), claim("b", false)]), 0.5);
  assert.equal(faithfulness([claim("a", false)]), 0);
});

test("an answer with no claims scores NaN, not 100%", () => {
  // Otherwise "I cannot help with that" is a perfect answer.
  assert.ok(Number.isNaN(faithfulness([])));
});

test("summary averages per question, not per claim", () => {
  const verdicts: FaithfulnessVerdict[] = [
    // 10 claims, 5 supported → 0.5
    {
      question: "verbose",
      claims: [
        ...Array(5).fill(claim("ok", true)),
        ...Array(5).fill(claim("bad", false)),
      ],
      score: 0.5,
      error: null,
    },
    // 1 claim, supported → 1.0
    { question: "terse", claims: [claim("ok", true)], score: 1, error: null },
  ];
  const s = summariseFaithfulness(verdicts, 0);
  assert.equal(s.score, 0.75); // per-claim would be 6/11 = 0.545
  assert.equal(s.judged, 2);
  assert.equal(s.clean, 1);
  assert.equal(s.unsupported.length, 5);
});

test("a judge failure is excluded from the average, not scored as zero", () => {
  const verdicts: FaithfulnessVerdict[] = [
    { question: "good", claims: [claim("ok", true)], score: 1, error: null },
    { question: "broke", claims: null, score: NaN, error: "judge returned garbage" },
  ];
  const s = summariseFaithfulness(verdicts, 0);
  assert.equal(s.score, 1); // NOT 0.5
  assert.equal(s.judged, 1);
  assert.equal(s.failed, 1);
});

test("all-failed reports NaN rather than a confident zero", () => {
  const s = summariseFaithfulness(
    [{ question: "q", claims: null, score: NaN, error: "boom" }],
    0,
  );
  assert.ok(Number.isNaN(s.score));
  assert.equal(s.judged, 0);
});

test("skipped refusals are carried, not folded into the score", () => {
  const s = summariseFaithfulness(
    [{ question: "q", claims: [claim("ok", true)], score: 1, error: null }],
    7,
  );
  assert.equal(s.skippedRefusals, 7);
  assert.equal(s.judged, 1);
});

// --- the call --------------------------------------------------------------

test("judgeAnswer returns a verdict for a well-behaved judge", async () => {
  const v = await judgeAnswer({
    question: "q",
    answer: "a",
    contexts: ["ctx"],
    generate: async () =>
      '{"claims":[{"claim":"x","supported":true,"note":"[1]"},{"claim":"y","supported":false,"note":"absent"}]}',
  });
  assert.equal(v.error, null);
  assert.equal(v.score, 0.5);
  assert.equal(v.claims?.length, 2);
});

test("a throwing judge produces an unjudged verdict, not a crash and not a zero", async () => {
  const v = await judgeAnswer({
    question: "q",
    answer: "a",
    contexts: ["ctx"],
    generate: async () => {
      throw new Error("429 rate limited");
    },
  });
  assert.ok(Number.isNaN(v.score));
  assert.equal(v.claims, null);
  assert.match(v.error ?? "", /429/);
});

test("nothing retrieved means nothing to be faithful to", async () => {
  let called = false;
  const v = await judgeAnswer({
    question: "q",
    answer: "a",
    contexts: [],
    generate: async () => {
      called = true;
      return "{}";
    },
  });
  assert.equal(called, false); // no wasted call
  assert.ok(Number.isNaN(v.score));
  assert.match(v.error ?? "", /nothing to be faithful to/);
});

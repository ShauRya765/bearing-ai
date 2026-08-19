import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPrecisionPrompt,
  judgePrecision,
  parsePrecisionResponse,
  precision,
  PrecisionParseError,
  summarisePrecision,
  type JudgedChunk,
  type PrecisionVerdict,
} from "@/lib/eval/precision";
import type { RetrievedChunk } from "@/lib/rag/retrieve";

const chunk = (title: string, rank: number): RetrievedChunk => ({
  text: `body of ${title}`,
  sourceTitle: title,
  sourceUrl: `https://example.test/${rank}`,
  similarity: 0.5,
  rank,
});

const CHUNKS = [chunk("Provincial nomination", 1), chunk("The tie-breaking rule", 2)];

const judged = (relevant: boolean, rank = 1): JudgedChunk => ({
  sourceTitle: rank === 1 ? "Provincial nomination" : "The tie-breaking rule",
  rank,
  relevant,
  note: "",
});

const verdict = (over: Partial<PrecisionVerdict> = {}): PrecisionVerdict => ({
  question: "q",
  covered: true,
  chunks: [judged(true)],
  score: 1,
  error: null,
  ...over,
});

// --- prompt ----------------------------------------------------------------

test("the prompt numbers each source and names it", () => {
  const p = buildPrecisionPrompt("How much is a nomination worth?", CHUNKS);
  assert.match(p, /\[1\] Provincial nomination\nbody of Provincial nomination/);
  assert.match(p, /\[2\] The tie-breaking rule/);
  assert.match(p, /How much is a nomination worth\?/);
});

test("the prompt says finding nothing relevant is a valid outcome", () => {
  // Without this the judge stretches to justify whatever came back, which would
  // quietly destroy the out-of-corpus half of the metric — the half where the
  // right answer is that none of the five chunks help.
  const p = buildPrecisionPrompt("q", CHUNKS);
  assert.match(p, /mark them all irrelevant. That is a valid and expected outcome/);
});

// --- parsing ---------------------------------------------------------------

test("parses verdicts and pairs them back to their chunks in rank order", () => {
  const out = parsePrecisionResponse(
    '{"verdicts":[{"index":2,"relevant":false,"note":"about ties"},' +
      '{"index":1,"relevant":true,"note":"states the 600"}]}',
    CHUNKS,
  );
  // Returned in CHUNK order regardless of the order the judge replied in.
  assert.deepEqual(
    out.map((c) => [c.rank, c.sourceTitle, c.relevant]),
    [
      [1, "Provincial nomination", true],
      [2, "The tie-breaking rule", false],
    ],
  );
  assert.equal(out[1].note, "about ties");
});

test("tolerates a fenced reply", () => {
  const out = parsePrecisionResponse(
    '```json\n{"verdicts":[{"index":1,"relevant":true,"note":""},' +
      '{"index":2,"relevant":true,"note":""}]}\n```',
    CHUNKS,
  );
  assert.equal(out.length, 2);
});

test("a missing verdict throws rather than shrinking the denominator", () => {
  // This is the flattering-repair guard. Silently scoring 1/1 instead of 1/2
  // would turn a judge that lost track into a perfect precision score.
  assert.throws(
    () =>
      parsePrecisionResponse(
        '{"verdicts":[{"index":1,"relevant":true,"note":""}]}',
        CHUNKS,
      ),
    PrecisionParseError,
  );
});

test("a duplicated verdict throws", () => {
  assert.throws(
    () =>
      parsePrecisionResponse(
        '{"verdicts":[{"index":1,"relevant":true,"note":""},' +
          '{"index":1,"relevant":false,"note":""}]}',
        CHUNKS,
      ),
    PrecisionParseError,
  );
});

test("malformed and non-JSON replies throw", () => {
  assert.throws(() => parsePrecisionResponse("not json", CHUNKS), PrecisionParseError);
  assert.throws(
    () => parsePrecisionResponse('{"nope":[]}', CHUNKS),
    PrecisionParseError,
  );
  assert.throws(
    () =>
      parsePrecisionResponse(
        '{"verdicts":[{"index":1,"relevant":"yes","note":""}]}',
        CHUNKS,
      ),
    PrecisionParseError,
  );
});

// --- scoring ---------------------------------------------------------------

test("precision is relevant over retrieved, NaN for nothing retrieved", () => {
  assert.equal(precision([judged(true), judged(false, 2)]), 0.5);
  assert.equal(precision([judged(true), judged(true, 2)]), 1);
  assert.equal(precision([judged(false), judged(false, 2)]), 0);
  assert.ok(Number.isNaN(precision([])));
});

test("covered and out-of-corpus questions are never averaged together", () => {
  // High is good for one and low is good for the other. A combined mean would
  // let retrieval getting worse on real questions be cancelled out by it getting
  // better at returning junk for questions the corpus doesn't cover.
  const s = summarisePrecision(
    [
      verdict({ question: "covered", score: 1 }),
      verdict({ question: "out", covered: false, score: 0 }),
    ],
    "test-judge",
  );
  assert.equal(s.score, 1);
  assert.equal(s.judged, 1);
  assert.equal(s.uncoveredScore, 0);
  assert.equal(s.uncoveredJudged, 1);
});

test("a judge failure is NaN and excluded, never a precision of zero", () => {
  const s = summarisePrecision(
    [
      verdict({ question: "ok", score: 1 }),
      verdict({ question: "broke", chunks: null, score: NaN, error: "timeout" }),
    ],
    "test-judge",
  );
  // Zero precision is a real, damning finding. Manufacturing it from a failed
  // API call would be inventing evidence of a bug that may not exist.
  assert.equal(s.score, 1);
  assert.equal(s.judged, 1);
  assert.equal(s.failed, 1);
});

test("summary surfaces a wrong top-ranked chunk, not every irrelevant one", () => {
  const s = summarisePrecision(
    [
      verdict({
        question: "led with the wrong card",
        chunks: [judged(false), judged(true, 2)],
        score: 0.5,
      }),
      verdict({
        question: "right card first",
        chunks: [judged(true), judged(false, 2)],
        score: 0.5,
      }),
    ],
    "test-judge",
  );
  assert.deepEqual(
    s.topRankIrrelevant.map((t) => t.question),
    ["led with the wrong card"],
  );
});

test("summary flags out-of-corpus questions that retrieved something relevant", () => {
  // okf/index.md calls the scope boundary load-bearing for the refusal metric.
  // A relevant chunk here means the corpus grew into a topic it declares it
  // excludes — the exact drift that would silently retire that metric.
  const s = summarisePrecision(
    [
      verdict({
        question: "what are the fees?",
        covered: false,
        chunks: [judged(true)],
        score: 1,
      }),
    ],
    "test-judge",
  );
  assert.deepEqual(
    s.uncoveredRelevant.map((u) => [u.question, u.sourceTitle]),
    [["what are the fees?", "Provincial nomination"]],
  );
});

test("an empty judged set is NaN, not zero", () => {
  const s = summarisePrecision([], "test-judge");
  assert.ok(Number.isNaN(s.score));
  assert.ok(Number.isNaN(s.uncoveredScore));
  assert.equal(s.judged, 0);
});

// --- the call --------------------------------------------------------------

test("judgePrecision never throws — a failure becomes an unjudged question", () => {
  return judgePrecision({
    question: "q",
    covered: true,
    chunks: CHUNKS,
    generate: async () => {
      throw new Error("429 rate limited");
    },
  }).then((v) => {
    assert.ok(Number.isNaN(v.score));
    assert.equal(v.chunks, null);
    assert.match(v.error!, /429/);
  });
});

test("judgePrecision refuses to score when nothing was retrieved", () => {
  return judgePrecision({
    question: "q",
    covered: true,
    chunks: [],
    generate: async () => {
      throw new Error("should not be called");
    },
  }).then((v) => {
    assert.ok(Number.isNaN(v.score));
    assert.match(v.error!, /nothing was retrieved/);
  });
});

test("judgePrecision scores a well-formed verdict", () => {
  return judgePrecision({
    question: "q",
    covered: true,
    chunks: CHUNKS,
    generate: async () =>
      '{"verdicts":[{"index":1,"relevant":true,"note":"a"},' +
      '{"index":2,"relevant":false,"note":"b"}]}',
  }).then((v) => {
    assert.equal(v.score, 0.5);
    assert.equal(v.error, null);
    assert.equal(v.chunks!.length, 2);
  });
});

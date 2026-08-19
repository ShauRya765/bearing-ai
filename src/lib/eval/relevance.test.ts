import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRelevancePrompt,
  cosine,
  judgeRelevance,
  parseRelevanceResponse,
  relevance,
  RelevanceParseError,
  REVERSE_QUESTIONS,
  summariseRelevance,
  type RelevanceVerdict,
} from "@/lib/eval/relevance";

const verdict = (over: Partial<RelevanceVerdict> = {}): RelevanceVerdict => ({
  question: "q",
  generated: ["a", "b", "c"],
  score: 0.9,
  error: null,
  ...over,
});

// --- prompt ----------------------------------------------------------------

test("the prompt withholds the original question", () => {
  // Showing it would let the model echo it back, and every answer — including a
  // completely off-topic one — would score near-perfect relevance.
  const p = buildRelevancePrompt("You get 600 points for a nomination.");
  assert.match(p, /You cannot see the question it was answering/);
  assert.match(p, /You get 600 points for a nomination\./);
});

test("the prompt asks for the configured number of questions", () => {
  assert.match(buildRelevancePrompt("a"), new RegExp(`Write ${REVERSE_QUESTIONS} questions`));
});

// --- parsing ---------------------------------------------------------------

test("parses a question list, fenced or bare", () => {
  assert.deepEqual(parseRelevanceResponse('{"questions":["one","two"]}'), [
    "one",
    "two",
  ]);
  assert.deepEqual(
    parseRelevanceResponse('```json\n{"questions":["one"]}\n```'),
    ["one"],
  );
});

test("drops blank entries but treats an empty result as a failure", () => {
  assert.deepEqual(parseRelevanceResponse('{"questions":["one","","  "]}'), ["one"]);
  // Not silently NaN further down: an empty list is a model that produced
  // nothing usable, which belongs in the failure count, not in the average.
  assert.throws(
    () => parseRelevanceResponse('{"questions":[]}'),
    RelevanceParseError,
  );
});

test("malformed replies throw", () => {
  assert.throws(() => parseRelevanceResponse("nope"), RelevanceParseError);
  assert.throws(() => parseRelevanceResponse('{"nope":1}'), RelevanceParseError);
});

// --- cosine ----------------------------------------------------------------

test("cosine normalises, so magnitude does not change the angle", () => {
  // gemini-embedding-001 truncated to 768 dims is not unit length. Treating raw
  // dot product as similarity would rank differently and still look plausible.
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [7, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosine([1, 1], [1, 0]) - Math.SQRT1_2) < 1e-12);
});

test("cosine is NaN for a zero vector or a length mismatch, not 0", () => {
  // Zero magnitude is an undefined angle, not a right angle.
  assert.ok(Number.isNaN(cosine([0, 0], [1, 1])));
  assert.ok(Number.isNaN(cosine([1, 2, 3], [1, 2])));
  assert.ok(Number.isNaN(cosine([], [])));
});

test("relevance averages the generated questions and refuses on any bad vector", () => {
  assert.equal(relevance([1, 0], [[1, 0], [1, 0]]), 1);
  assert.equal(relevance([1, 0], [[1, 0], [0, 1]]), 0.5);
  // One unusable vector makes the mean unusable — averaging over the rest would
  // quietly change the denominator.
  assert.ok(Number.isNaN(relevance([1, 0], [[1, 0], [0, 0]])));
  assert.ok(Number.isNaN(relevance([1, 0], [])));
});

// --- summary ---------------------------------------------------------------

test("refusals are skipped rather than scored near zero", () => {
  // A refusal is the CORRECT answer to an out-of-corpus question and a terrible
  // embedding match for it. Scoring it would penalise the system for the exact
  // behaviour the refusal metric rewards.
  const s = summariseRelevance([verdict({ score: 0.8 })], 10, "judge", "embed");
  assert.equal(s.score, 0.8);
  assert.equal(s.judged, 1);
  assert.equal(s.skippedRefusals, 10);
});

test("a failure is NaN and excluded, never a relevance of zero", () => {
  const s = summariseRelevance(
    [
      verdict({ score: 0.9 }),
      verdict({ question: "broke", generated: null, score: NaN, error: "timeout" }),
    ],
    0,
    "judge",
    "embed",
  );
  assert.equal(s.score, 0.9);
  assert.equal(s.judged, 1);
  assert.equal(s.failed, 1);
});

test("the summary publishes the weakest answers, lowest first", () => {
  const s = summariseRelevance(
    [
      verdict({ question: "good", score: 0.95 }),
      verdict({ question: "drifted", score: 0.41 }),
      verdict({ question: "middling", score: 0.7 }),
    ],
    0,
    "judge",
    "embed",
  );
  assert.deepEqual(
    s.lowest.map((l) => l.question),
    ["drifted", "middling", "good"],
  );
});

test("the summary records both models the number depends on", () => {
  const s = summariseRelevance([], 0, "claude-opus-5", "gemini-embedding-001");
  assert.equal(s.judgeModel, "claude-opus-5");
  // Cosine is a property of one embedding space; a figure from another space is
  // not comparable, exactly as recall isn't.
  assert.equal(s.embeddingModel, "gemini-embedding-001");
  assert.ok(Number.isNaN(s.score));
});

// --- the call --------------------------------------------------------------

test("judgeRelevance scores an on-topic answer higher than a drifting one", async () => {
  // Fake embedding: questions sharing a keyword point the same way.
  const embed = async (text: string): Promise<number[]> =>
    text.includes("nomination") ? [1, 0] : [0, 1];

  const onTopic = await judgeRelevance({
    question: "how do I claim a nomination?",
    answer: "irrelevant to the fake embedder",
    generate: async () => '{"questions":["claiming a nomination","nomination steps"]}',
    embed,
  });
  const drifted = await judgeRelevance({
    question: "how do I claim a nomination?",
    answer: "irrelevant to the fake embedder",
    generate: async () => '{"questions":["what is the tie-break rule"]}',
    embed,
  });

  assert.equal(onTopic.score, 1);
  assert.equal(drifted.score, 0);
});

test("judgeRelevance never throws on a generation or embedding failure", async () => {
  const genFailed = await judgeRelevance({
    question: "q",
    answer: "a",
    generate: async () => {
      throw new Error("529 overloaded");
    },
    embed: async () => [1, 0],
  });
  assert.ok(Number.isNaN(genFailed.score));
  assert.match(genFailed.error!, /529/);

  const embedFailed = await judgeRelevance({
    question: "q",
    answer: "a",
    generate: async () => '{"questions":["x"]}',
    embed: async () => {
      throw new Error("embedding quota");
    },
  });
  assert.ok(Number.isNaN(embedFailed.score));
  assert.match(embedFailed.error!, /quota/);
});

test("judgeRelevance refuses to score an empty answer", async () => {
  const v = await judgeRelevance({
    question: "q",
    answer: "   ",
    generate: async () => {
      throw new Error("should not be called");
    },
    embed: async () => [1, 0],
  });
  assert.ok(Number.isNaN(v.score));
  assert.match(v.error!, /empty/);
});
